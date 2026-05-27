#pragma once
#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include "config.h"
#include "wifi_manager.h"

// Data structures

struct Departure {
    char line[12];
    char destination[48];
    char platform[8];
    char type;        // 'U','S','T','R','B' (U-Bahn, S-Bahn, Tram, Regional, Bus)
    int  minsUntil;   // negative = already departed
    int  delayMins;   // 0 = on time, >0 = delayed
    bool isCancelled;
};

struct StationDepartures {
    char   stationName[48];
    char   icon[16];      // icon key, e.g. "house", "briefcase"
    Departure rows[8];
    int    count;
    bool   ok;
};

struct DeviceConfig {
    char  uuid[37];
    bool  configured;

    struct Station {
        char stopId[32];
        char stopName[48];
        char label[48];
        char icon[16];
        char api[16];     // "vrr","mvv","db","hvv","custom"
        char filterTypes[32];
        int  timeWindowStart;
        int  timeWindowEnd;
    } stations[6];
    int stationCount;

    int  refreshMinutes;
    int  shutdownMinutes;
    int  batWarnPct;
    char timezone[48];
    char otaUrl[128];
};

// HTTP helper

static String _apiGet(const String& path) {
    String url = String(SERVER_BASE_URL) + path;
    HTTPClient http;
    WiFiClientSecure secureClient;

    if (url.startsWith("https://")) {
        secureClient.setInsecure();
        http.begin(secureClient, url);
    } else {
        http.begin(url);
    }
    http.setTimeout(API_TIMEOUT_MS);
    http.addHeader("User-Agent", "TransitKeychain/" FIRMWARE_VERSION);

    int code = http.GET();
    String body;
    if (code == 200) {
        body = http.getString();
    } else {
        Serial.printf("[API] GET %s -> %d\n", url.c_str(), code);
    }
    http.end();
    return body;
}

static bool _apiPost(const String& path, const String& json) {
    String url = String(SERVER_BASE_URL) + path;
    HTTPClient http;
    WiFiClientSecure secureClient;

    if (url.startsWith("https://")) {
        secureClient.setInsecure();
        http.begin(secureClient, url);
    } else {
        http.begin(url);
    }
    http.setTimeout(API_TIMEOUT_MS);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("User-Agent", "TransitKeychain/" FIRMWARE_VERSION);

    int code = http.POST(json);
    http.end();
    return (code >= 200 && code < 300);
}

// UUID management

inline String transitGetOrCreateUuid() {
    Preferences prefs;
    prefs.begin(PREFS_TRANSIT, false);
    String uuid = prefs.getString("uuid", "");
    if (uuid.length() == 0) {
        // Generate a v4-like UUID using esp_random()
        uint32_t r[4];
        for (int i = 0; i < 4; i++) r[i] = esp_random();
        // Set version 4 and variant bits
        r[1] = (r[1] & 0xffff0fff) | 0x00004000;
        r[2] = (r[2] & 0x3fffffff) | 0x80000000;
        char buf[37];
        snprintf(buf, sizeof(buf),
            "%08x-%04x-%04x-%04x-%04x%08x",
            r[0],
            (r[1] >> 16) & 0xffff,
            r[1] & 0xffff,
            (r[2] >> 16) & 0xffff,
            r[2] & 0xffff,
            r[3]);
        uuid = String(buf);
        prefs.putString("uuid", uuid);
        Serial.printf("[UUID] Generated: %s\n", uuid.c_str());
    }
    prefs.end();
    return uuid;
}

// Device registration & config polling

inline bool transitRegisterDevice(const String& uuid) {
    JsonDocument doc;
    doc["firmware"] = FIRMWARE_VERSION;
    String body;
    serializeJson(doc, body);

    String url = String(SERVER_BASE_URL) + "/api/device/" + uuid + "/register";
    HTTPClient http;
    WiFiClientSecure secureClient;
    if (url.startsWith("https://")) {
        secureClient.setInsecure();
        http.begin(secureClient, url);
    } else {
        http.begin(url);
    }
    http.setTimeout(API_TIMEOUT_MS);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("User-Agent", "TransitKeychain/" FIRMWARE_VERSION);

    int code = http.POST(body);
    if (code >= 200 && code < 300) {
        String resp = http.getString();
        JsonDocument rdoc;
        if (deserializeJson(rdoc, resp) == DeserializationError::Ok) {
            const char* tok = rdoc["access_token"];
            if (tok && strlen(tok) > 0) {
                Preferences prefs;
                prefs.begin(PREFS_TRANSIT, false);
                prefs.putString("access_token", tok);
                prefs.end();
                Serial.printf("[AUTH] Token saved: %s\n", tok);
            }
        }
    }
    http.end();
    return (code >= 200 && code < 300);
}

inline String transitGetAccessToken() {
    Preferences prefs;
    prefs.begin(PREFS_TRANSIT, true);
    String tok = prefs.getString("access_token", "");
    prefs.end();
    return tok;
}

// Authenticated GET — sends x-device-token header.
// On 401, re-registers the device (recovering a reset token) and retries once.
// At most one re-registration per boot (guards against multiple callers each triggering one).
static bool _reregisteredThisBoot = false;
static String _apiGetAuth(const String& uuid, const String& path, bool retry = true) {
    String url = String(SERVER_BASE_URL) + path;
    HTTPClient http;
    WiFiClientSecure secureClient;

    if (url.startsWith("https://")) {
        secureClient.setInsecure();
        http.begin(secureClient, url);
    } else {
        http.begin(url);
    }
    http.setTimeout(API_TIMEOUT_MS);
    http.addHeader("User-Agent", "TransitKeychain/" FIRMWARE_VERSION);
    String token = transitGetAccessToken();
    if (token.length() > 0) {
        http.addHeader("x-device-token", token);
    }

    int code = http.GET();
    String body;
    if (code == 200) {
        body = http.getString();
    } else if (code == 401 && retry && uuid.length() > 0 && !_reregisteredThisBoot) {
        http.end();
        Serial.println("[AUTH] 401 on GET — re-registering and retrying.");
        _reregisteredThisBoot = true;
        if (transitRegisterDevice(uuid)) {
            return _apiGetAuth(uuid, path, false);
        }
        return "";
    } else {
        Serial.printf("[API] GET %s -> %d\n", url.c_str(), code);
    }
    http.end();
    return body;
}

// Returns the show_token value if server requested it, empty string otherwise
inline String transitSendHeartbeat(const String& uuid, uint8_t batPct) {
    JsonDocument doc;
    doc["battery_pct"] = batPct;
    doc["firmware"]    = FIRMWARE_VERSION;
    doc["ssid"]        = WiFi.SSID();
    String body;
    serializeJson(doc, body);

    String url = String(SERVER_BASE_URL) + "/api/device/" + uuid + "/heartbeat";
    HTTPClient http;
    WiFiClientSecure secureClient;
    if (url.startsWith("https://")) {
        secureClient.setInsecure();
        http.begin(secureClient, url);
    } else {
        http.begin(url);
    }
    http.setTimeout(API_TIMEOUT_MS);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("User-Agent", "TransitKeychain/" FIRMWARE_VERSION);
    String hbToken = transitGetAccessToken();
    if (hbToken.length() > 0) {
        http.addHeader("x-device-token", hbToken);
    }

    int code = http.POST(body);
    String showToken;
    if (code >= 200 && code < 300) {
        String resp = http.getString();
        JsonDocument rdoc;
        if (deserializeJson(rdoc, resp) == DeserializationError::Ok) {
            const char* tok = rdoc["show_token"];
            if (tok && strlen(tok) > 0) {
                showToken = String(tok);
                // Also persist the latest token in case it changed
                Preferences prefs;
                prefs.begin(PREFS_TRANSIT, false);
                prefs.putString("access_token", tok);
                prefs.end();
            }
        }
    } else if (code == 401) {
        Serial.println("[AUTH] 401 on heartbeat — re-registering (token takes effect next boot).");
        _reregisteredThisBoot = true;
        transitRegisterDevice(uuid);
    } else {
        Serial.printf("[API] Heartbeat -> %d\n", code);
    }
    http.end();
    return showToken;
}

// Fetch WiFi networks from server (auth'd) and save any new ones to NVS
inline void transitSyncWifiNetworks(const String& uuid) {
    String body = _apiGetAuth(uuid, "/api/device/" + uuid + "/wifi");
    if (body.length() == 0) return;

    JsonDocument doc;
    if (deserializeJson(doc, body) != DeserializationError::Ok) return;

    JsonArray arr = doc.as<JsonArray>();
    for (JsonObject net : arr) {
        const char* ssid = net["ssid"];
        const char* pass = net["password"];
        if (ssid && strlen(ssid) > 0) {
            wifiSaveNetwork(ssid, pass ? pass : "");
        }
    }
    Serial.printf("[WIFI] Synced %d network(s) from server.\n", arr.size());
}

static bool _parseConfig(const String& json, DeviceConfig& cfg) {
    JsonDocument doc;
    if (deserializeJson(doc, json) != DeserializationError::Ok) return false;

    strlcpy(cfg.timezone,       doc["timezone"]       | "Europe/Berlin",   sizeof(cfg.timezone));
    strlcpy(cfg.otaUrl,         doc["ota_url"]        | "",                sizeof(cfg.otaUrl));
    cfg.refreshMinutes  = doc["refresh_minutes"]  | DEFAULT_REFRESH_MIN;
    cfg.shutdownMinutes = doc["shutdown_minutes"] | DEFAULT_SHUTDOWN_MIN;
    cfg.batWarnPct      = doc["bat_warn_pct"]     | DEFAULT_BAT_WARN_PCT;
    cfg.configured      = true;

    JsonArray stations = doc["stations"].as<JsonArray>();
    cfg.stationCount = 0;
    for (JsonObject s : stations) {
        if (cfg.stationCount >= 6) break;
        auto& st = cfg.stations[cfg.stationCount++];
        strlcpy(st.stopId,       s["stopId"]   | "",    sizeof(st.stopId));
        strlcpy(st.stopName,     s["stopName"] | "",    sizeof(st.stopName));
        strlcpy(st.label,        s["label"]    | "",    sizeof(st.label));
        strlcpy(st.icon,         s["icon"]     | "",    sizeof(st.icon));
        strlcpy(st.api,          s["api"]      | "vrr", sizeof(st.api));
        strlcpy(st.filterTypes,  s["filterTypes"] | "", sizeof(st.filterTypes));
        // timeWindows: [{from:"HH:MM", to:"HH:MM"}] — convert to minutes-since-midnight
        auto hhmm = [](const char* t) -> int {
            if (!t || !t[0]) return 0;
            const char* colon = strchr(t, ':');
            if (!colon) return 0;
            int h = 0;
            for (const char* p = t; p < colon; p++) h = h * 10 + (*p - '0');
            const char* mp = colon + 1;
            int m = (mp[0] && mp[1]) ? (mp[0]-'0')*10 + (mp[1]-'0') : 0;
            return h * 60 + m;
        };
        JsonObject tw = s["timeWindows"][0].as<JsonObject>();
        if (!tw.isNull()) {
            st.timeWindowStart = hhmm(tw["from"] | "00:00");
            st.timeWindowEnd   = hhmm(tw["to"]   | "23:59");
        } else {
            st.timeWindowStart = 0;
            st.timeWindowEnd   = 1440;
        }
    }
    return true;
}

inline bool transitFetchConfig(const String& uuid, DeviceConfig& cfg, bool* wasPending = nullptr) {
    if (wasPending) *wasPending = false;
    String body = _apiGetAuth(uuid, "/api/device/" + uuid + "/config");
    if (body.length() == 0) return false;
    if (body.indexOf("\"pending_setup\"") >= 0) {
        if (wasPending) *wasPending = true;
        return false;
    }
    return _parseConfig(body, cfg);
}

// Poll until web app has configured the device (max tries × interval ms)
inline bool transitPollForConfig(const String& uuid, DeviceConfig& cfg,
                                  uint32_t intervalMs = CONFIG_POLL_INTERVAL_MS,
                                  int maxTries = CONFIG_POLL_MAX_TRIES) {
    Serial.printf("[API] Polling for config (max %d tries)...\n", maxTries);
    for (int i = 0; i < maxTries; i++) {
        if (transitFetchConfig(uuid, cfg) && cfg.stationCount > 0) {
            Serial.println("[API] Config received.");
            return true;
        }
        delay(intervalMs);
    }
    return false;
}

// Save / load config to Preferences (so it survives deep sleep without re-fetching)
inline void transitSaveConfig(const DeviceConfig& cfg) {
    Preferences prefs;
    prefs.begin(PREFS_TRANSIT, false);
    prefs.putInt("refresh_min",   cfg.refreshMinutes);
    prefs.putInt("shutdown_min",  cfg.shutdownMinutes);
    prefs.putInt("bat_warn_pct",  cfg.batWarnPct);
    prefs.putInt("station_cnt",   cfg.stationCount);
    prefs.putString("timezone",   cfg.timezone);
    prefs.putString("ota_url",    cfg.otaUrl);
    for (int i = 0; i < cfg.stationCount; i++) {
        const auto& s = cfg.stations[i];
        String p = "s" + String(i) + "_";
        prefs.putString((p + "stopId").c_str(),   s.stopId);
        prefs.putString((p + "stopName").c_str(), s.stopName);
        prefs.putString((p + "label").c_str(),    s.label);
        prefs.putString((p + "icon").c_str(),     s.icon);
        prefs.putString((p + "api").c_str(),      s.api);
        prefs.putString((p + "types").c_str(),    s.filterTypes);
        prefs.putInt((p + "twS").c_str(), s.timeWindowStart);
        prefs.putInt((p + "twE").c_str(), s.timeWindowEnd);
    }
    prefs.end();
}

inline bool transitLoadConfig(const String& uuid, DeviceConfig& cfg) {
    Preferences prefs;
    prefs.begin(PREFS_TRANSIT, true);
    int cnt = prefs.getInt("station_cnt", 0);
    if (cnt == 0) { prefs.end(); return false; }

    cfg.refreshMinutes  = prefs.getInt("refresh_min",  DEFAULT_REFRESH_MIN);
    cfg.shutdownMinutes = prefs.getInt("shutdown_min", DEFAULT_SHUTDOWN_MIN);
    cfg.batWarnPct      = prefs.getInt("bat_warn_pct", DEFAULT_BAT_WARN_PCT);
    if (cnt > 6) cnt = 6;
    cfg.stationCount    = cnt;
    strlcpy(cfg.timezone, prefs.getString("timezone", "Europe/Berlin").c_str(), sizeof(cfg.timezone));
    strlcpy(cfg.otaUrl,   prefs.getString("ota_url",  "").c_str(), sizeof(cfg.otaUrl));
    strlcpy(cfg.uuid,     uuid.c_str(), sizeof(cfg.uuid));
    cfg.configured = true;

    for (int i = 0; i < cnt; i++) {
        auto& s = cfg.stations[i];
        String p = "s" + String(i) + "_";
        strlcpy(s.stopId,      prefs.getString((p+"stopId").c_str(),   "").c_str(), sizeof(s.stopId));
        strlcpy(s.stopName,    prefs.getString((p+"stopName").c_str(), "").c_str(), sizeof(s.stopName));
        strlcpy(s.label,       prefs.getString((p+"label").c_str(),    "").c_str(), sizeof(s.label));
        strlcpy(s.icon,        prefs.getString((p+"icon").c_str(),     "").c_str(), sizeof(s.icon));
        strlcpy(s.api,         prefs.getString((p+"api").c_str(),      "vrr").c_str(), sizeof(s.api));
        strlcpy(s.filterTypes, prefs.getString((p+"types").c_str(),    "").c_str(), sizeof(s.filterTypes));
        s.timeWindowStart = prefs.getInt((p+"twS").c_str(), 0);
        s.timeWindowEnd   = prefs.getInt((p+"twE").c_str(), 1440);
    }
    prefs.end();
    return true;
}

// Departures

static char _typeFromLine(const char* line) {
    if (!line[0])                                          return 'B';
    if (strncmp(line, "STR", 3) == 0)                     return 'T';
    if (line[0] == 'U')                                    return 'U';
    if (line[0] == 'S')                                    return 'S';
    if (line[0] == 'T')                                    return 'T';
    if (strncmp(line,"RE",2)==0 || strncmp(line,"RB",2)==0 ||
        strncmp(line,"IC",2)==0 || strncmp(line,"EC",2)==0) return 'R';
    return 'B';
}

inline bool transitFetchDepartures(const String& uuid, const DeviceConfig::Station& station,
                                    StationDepartures& result) {
    String path = "/api/transit/departures?stopId=" + String(station.stopId)
                + "&api=" + String(station.api)
                + "&deviceId=" + uuid;
    String body = _apiGetAuth(uuid, path);
    if (body.length() == 0) { result.ok = false; return false; }

    JsonDocument doc;
    if (deserializeJson(doc, body) != DeserializationError::Ok) { result.ok = false; return false; }

    strlcpy(result.stationName, station.label[0] ? station.label : station.stopName,
            sizeof(result.stationName));
    strlcpy(result.icon, station.icon, sizeof(result.icon));
    result.count = 0;
    result.ok = true;

    JsonArray deps = doc["departures"].as<JsonArray>();
    for (JsonObject d : deps) {
        if (result.count >= 8) break;
        Departure& dep = result.rows[result.count++];
        strlcpy(dep.line,        d["line"]        | "",      sizeof(dep.line));
        strlcpy(dep.destination, d["destination"] | "?",     sizeof(dep.destination));
        strlcpy(dep.platform,    d["platform"]    | "",      sizeof(dep.platform));
        dep.minsUntil   = d["countdown"]   | 0;
        dep.delayMins   = d["delay"]       | 0;
        dep.isCancelled = d["cancelled"]   | false;
        dep.type        = _typeFromLine(dep.line);
    }

    // Cache to Preferences for offline use — NVS keys ≤15 chars, so hash stopId
    char ckey[9];
    { uint32_t h = 5381; for (const char* p = station.stopId; *p; p++) h = h*33 ^ (uint8_t)*p;
      snprintf(ckey, sizeof(ckey), "%08lx", (unsigned long)h); }
    Preferences cache;
    cache.begin(PREFS_CACHE, false);
    // NVS string values are limited to ~4000 bytes; skip caching oversized responses
    if (body.length() < 3500) {
        if (!cache.putString(ckey, body.c_str())) {
            Serial.printf("[Cache] NVS write failed for key %s (%u bytes)\n", ckey, body.length());
        }
    } else {
        Serial.printf("[Cache] Response too large to cache (%u bytes) — skipping\n", body.length());
    }
    cache.end();

    return true;
}

inline bool transitLoadCachedDepartures(const DeviceConfig::Station& station,
                                         StationDepartures& result) {
    char ckey[9];
    { uint32_t h = 5381; for (const char* p = station.stopId; *p; p++) h = h*33 ^ (uint8_t)*p;
      snprintf(ckey, sizeof(ckey), "%08lx", (unsigned long)h); }
    Preferences cache;
    cache.begin(PREFS_CACHE, true);
    String body = cache.getString(ckey, "");
    cache.end();
    if (body.length() == 0) { result.ok = false; return false; }

    // Re-parse (same logic as fetch — inline for simplicity)
    JsonDocument doc;
    if (deserializeJson(doc, body) != DeserializationError::Ok) { result.ok = false; return false; }

    strlcpy(result.stationName, station.label[0] ? station.label : station.stopName,
            sizeof(result.stationName));
    strlcpy(result.icon, station.icon, sizeof(result.icon));
    result.count = 0;
    result.ok = true;

    JsonArray deps = doc["departures"].as<JsonArray>();
    for (JsonObject d : deps) {
        if (result.count >= 8) break;
        Departure& dep = result.rows[result.count++];
        strlcpy(dep.line,        d["line"]        | "",  sizeof(dep.line));
        strlcpy(dep.destination, d["destination"] | "?", sizeof(dep.destination));
        strlcpy(dep.platform,    d["platform"]    | "",  sizeof(dep.platform));
        dep.minsUntil   = d["countdown"]   | 0;
        dep.delayMins   = d["delay"]       | 0;
        dep.isCancelled = d["cancelled"]   | false;
        dep.type        = _typeFromLine(dep.line);
    }
    return true;
}
