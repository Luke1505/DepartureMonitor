#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include "config.h"
#include "led.h"

// ── Persistent multi-network storage ─────────────────────────────────────────

inline void wifiSaveNetwork(const char* ssid, const char* password) {
    Preferences prefs;
    prefs.begin(PREFS_WIFI, false);
    int count = prefs.getInt("count", 0);

    // Check if SSID already stored; update password if so
    for (int i = 0; i < count; i++) {
        String key = "ssid_" + String(i);
        if (prefs.getString(key.c_str(), "") == String(ssid)) {
            prefs.putString(("pass_" + String(i)).c_str(), password);
            prefs.end();
            return;
        }
    }

    // Add new entry (cap at 5 networks, evict oldest)
    if (count >= 5) {
        for (int i = 0; i < 4; i++) {
            prefs.putString(("ssid_" + String(i)).c_str(),
                prefs.getString(("ssid_" + String(i + 1)).c_str(), "").c_str());
            prefs.putString(("pass_" + String(i)).c_str(),
                prefs.getString(("pass_" + String(i + 1)).c_str(), "").c_str());
        }
        count = 4;
    }

    prefs.putString(("ssid_" + String(count)).c_str(), ssid);
    prefs.putString(("pass_" + String(count)).c_str(), password);
    prefs.putInt("count", count + 1);
    prefs.end();
    Serial.printf("[WIFI] Saved network: %s\n", ssid);
}

// ── Connect to any known network ─────────────────────────────────────────────

inline bool wifiConnect() {
    WiFiMulti wifiMulti;

    Preferences prefs;
    prefs.begin(PREFS_WIFI, true);
    int count = prefs.getInt("count", 0);
    for (int i = 0; i < count; i++) {
        String ssid = prefs.getString(("ssid_" + String(i)).c_str(), "");
        String pass = prefs.getString(("pass_" + String(i)).c_str(), "");
        if (ssid.length() > 0) {
            wifiMulti.addAP(ssid.c_str(), pass.c_str());
            Serial.printf("[WIFI] Known network: %s\n", ssid.c_str());
        }
    }
    prefs.end();

    if (count == 0) {
        Serial.println("[WIFI] No saved networks.");
        return false;
    }

    ledWifi();
    Serial.print("[WIFI] Connecting");
    uint32_t start = millis();
    while (wifiMulti.run() != WL_CONNECTED) {
        if (millis() - start > WIFI_CONNECT_TIMEOUT_MS) {
            Serial.println("\n[WIFI] Timeout.");
            ledOff();
            return false;
        }
        Serial.print('.');
        delay(300);
    }

    Serial.printf("\n[WIFI] Connected: %s  IP: %s\n",
                  WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
    ledOk();
    delay(200);
    ledOff();
    return true;
}

// ── First-boot captive portal (blocking) ─────────────────────────────────────
// Shows WiFiManager AP, saves credentials, calls onConnected when done.

inline bool wifiOpenCaptivePortal(const char* uuid) {
    WiFiManager wm;
    wm.setConfigPortalTimeout(300);  // 5 min timeout

    String apName = String("departure-") + String(uuid).substring(0, 4);
    Serial.printf("[WIFI] Starting captive portal: %s\n", apName.c_str());

    ledSetup();
    bool connected = wm.startConfigPortal(apName.c_str());
    ledOff();

    if (!connected) {
        Serial.println("[WIFI] Captive portal timed out.");
        return false;
    }

    // Persist credentials so wifiConnect() can use them on next boot
    String ssid = WiFi.SSID();
    String pass = WiFi.psk();
    if (ssid.length() > 0) {
        wifiSaveNetwork(ssid.c_str(), pass.c_str());
    }

    Serial.printf("[WIFI] Portal connected: %s\n", ssid.c_str());
    return true;
}

// ── Sync system time via NTP ──────────────────────────────────────────────────

// Map config timezone name → POSIX TZ string for ESP32
static const char* _posixTz(const char* tz) {
    if (strstr(tz, "Berlin") || strstr(tz, "Vienna") || strstr(tz, "Paris"))
        return "CET-1CEST,M3.5.0,M10.5.0/3";
    if (strstr(tz, "London"))
        return "GMT0BST,M3.5.0/1,M10.5.0";
    if (strstr(tz, "New_York") || strstr(tz, "Toronto"))
        return "EST5EDT,M3.2.0,M11.1.0";
    if (strstr(tz, "Chicago"))
        return "CST6CDT,M3.2.0,M11.1.0";
    if (strstr(tz, "Denver"))
        return "MST7MDT,M3.2.0,M11.1.0";
    if (strstr(tz, "Los_Angeles") || strstr(tz, "Vancouver"))
        return "PST8PDT,M3.2.0,M11.1.0";
    if (strstr(tz, "UTC") || strstr(tz, "GMT"))
        return "UTC0";
    return "CET-1CEST,M3.5.0,M10.5.0/3";  // fallback: Berlin
}

inline bool wifiSyncTime(const char* timezone = "Europe/Berlin") {
    configTzTime(_posixTz(timezone), NTP_SERVER);

    Serial.print("[NTP] Waiting for time");
    uint32_t start = millis();
    struct tm ti;
    while (!getLocalTime(&ti)) {
        if (millis() - start > 8000) {
            Serial.println(" timeout");
            return false;
        }
        Serial.print('.');
        delay(500);
    }
    Serial.printf(" %04d-%02d-%02d %02d:%02d:%02d\n",
        ti.tm_year + 1900, ti.tm_mon + 1, ti.tm_mday,
        ti.tm_hour, ti.tm_min, ti.tm_sec);
    return true;
}

inline String wifiGetTimeString(int offsetSecs = 0) {
    struct tm ti;
    if (!getLocalTime(&ti)) return "--:--";
    time_t t = mktime(&ti) + offsetSecs;
    struct tm* adj = localtime(&t);
    char buf[6];
    snprintf(buf, sizeof(buf), "%02d:%02d", adj->tm_hour, adj->tm_min);
    return String(buf);
}
