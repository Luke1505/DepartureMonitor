#pragma once
#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <Update.h>
#include "config.h"
#include "led.h"

struct OtaInfo {
    char version[32];
    char url[256];
    char cacheKey[64];
    bool available;
    bool building;
};

// Returns false only on network/parse failure; info.building=true is a valid non-error result.
inline bool otaCheckForUpdate(OtaInfo& info, const String& uuid) {
    memset(&info, 0, sizeof(info));

    String url = String(SERVER_BASE_URL) + "/api/firmware/ota-check?deviceId=" + uuid;
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

    Preferences prefs;
    prefs.begin(PREFS_TRANSIT, true);
    String token     = prefs.getString("access_token", "");
    String storedKey = prefs.getString("ota_key", "");
    prefs.end();

    if (token.length() > 0) http.addHeader("x-device-token", token);

    int code = http.GET();
    if (code != 200) {
        Serial.printf("[OTA] Check failed: %d\n", code);
        http.end();
        return false;
    }

    String body = http.getString();
    http.end();

    JsonDocument doc;
    if (deserializeJson(doc, body) != DeserializationError::Ok) return false;

    if (doc["building"] | false) {
        info.building = true;
        Serial.println("[OTA] Build in progress — will check next boot.");
        return true;
    }

    if (!(doc["available"] | false)) {
        Serial.println("[OTA] No build available.");
        return true;
    }

    const char* cacheKey = doc["cache_key"] | "";
    const char* dlUrl    = doc["url"]        | "";
    const char* ver      = doc["version"]    | "";

    strlcpy(info.cacheKey, cacheKey, sizeof(info.cacheKey));
    strlcpy(info.version,  ver,      sizeof(info.version));

    // Only update if build worker returned a cache key we haven't installed yet
    info.available = (strlen(cacheKey) > 0 && strcmp(cacheKey, storedKey.c_str()) != 0);

    if (info.available) {
        String fullUrl = String(dlUrl);
        if (fullUrl.startsWith("/")) fullUrl = String(SERVER_BASE_URL) + fullUrl;
        strlcpy(info.url, fullUrl.c_str(), sizeof(info.url));
        Serial.printf("[OTA] New build available: %s (prev: %s)\n", cacheKey, storedKey.c_str());
    } else {
        Serial.printf("[OTA] Already at current build: %s\n", cacheKey);
    }

    return true;
}

// progress_cb: called with bytes done and total; pass nullptr to skip
inline bool otaApplyUpdate(const char* firmwareUrl, const char* cacheKey,
                            std::function<void(size_t, size_t)> progress_cb = nullptr) {
    HTTPClient http;
    WiFiClientSecure secureClient;
    Serial.printf("[OTA] Downloading: %s\n", firmwareUrl);
    String urlStr = String(firmwareUrl);
    if (urlStr.startsWith("https://")) {
        secureClient.setInsecure();
        http.begin(secureClient, urlStr);
    } else {
        http.begin(urlStr);
    }
    http.setTimeout(60000);
    int code = http.GET();
    if (code != 200) {
        Serial.printf("[OTA] HTTP error: %d\n", code);
        http.end();
        return false;
    }

    int contentLen = http.getSize();
    Serial.printf("[OTA] Firmware size: %d bytes\n", contentLen);

    if (!Update.begin(contentLen > 0 ? contentLen : UPDATE_SIZE_UNKNOWN)) {
        Serial.println("[OTA] Not enough space.");
        http.end();
        return false;
    }

    WiFiClient* stream = http.getStreamPtr();
    size_t written = 0;
    uint8_t buf[512];

    bool unknownLen = (contentLen <= 0);
    uint32_t lastProgress = millis();
    while (http.connected() && (unknownLen || written < (size_t)contentLen)) {
        int avail = stream->available();
        if (avail > 0) {
            lastProgress = millis();
            int toRead = min(avail, (int)sizeof(buf));
            int n = stream->readBytes(buf, toRead);
            size_t w = Update.write(buf, n);
            if (w != (size_t)n) {
                Serial.printf("[OTA] Write error at %u\n", written);
                Update.abort();
                http.end();
                return false;
            }
            written += w;
            ledOta();
            if (progress_cb) progress_cb(written, unknownLen ? 0 : (size_t)contentLen);
        } else {
            if (millis() - lastProgress > 15000) {
                Serial.println("[OTA] Stalled download — aborting.");
                Update.abort();
                http.end();
                return false;
            }
            delay(1);
        }
        if (Update.isFinished()) break;
    }
    http.end();

    // For unknown-length streams the loop exits when the connection closes, not when
    // isFinished() is true. Guard here so a truncated download is never flashed.
    if (unknownLen && !Update.isFinished()) {
        Serial.println("[OTA] Stream ended before firmware complete — aborting.");
        Update.abort();
        ledError();
        return false;
    }

    if (!Update.end(unknownLen)) {
        Serial.printf("[OTA] Update error: %d\n", Update.getError());
        Update.abort();
        ledError();
        return false;
    }

    // Persist the installed cache key — next boot's check will skip this exact build
    Preferences prefs;
    prefs.begin(PREFS_TRANSIT, false);
    prefs.putString("ota_key", cacheKey);
    prefs.end();

    Serial.println("[OTA] Update complete — rebooting.");
    ledOk();
    delay(500);
    ESP.restart();
    return true;
}
