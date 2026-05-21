#pragma once
#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Update.h>
#include "config.h"
#include "led.h"

struct OtaInfo {
    char version[16];
    char url[256];
    bool available;
};

inline bool otaCheckForUpdate(OtaInfo& info) {
    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    String url = String(SERVER_BASE_URL) + "/api/firmware/latest";
    http.begin(client, url);
    http.setTimeout(API_TIMEOUT_MS);
    int code = http.GET();
    if (code != 200) {
        http.end();
        info.available = false;
        return false;
    }

    String body = http.getString();
    http.end();

    JsonDocument doc;
    if (deserializeJson(doc, body) != DeserializationError::Ok) {
        info.available = false;
        return false;
    }

    const char* latest = doc["version"] | "";
    strlcpy(info.version, latest, sizeof(info.version));

    // Simple semver compare: update if latest != current
    info.available = (strcmp(latest, FIRMWARE_VERSION) != 0 && strlen(latest) > 0);

    if (info.available) {
        // Build download URL from manifest path
        String downloadUrl = String(SERVER_BASE_URL) + "/api/firmware/download/"
                           + String(latest) + "/firmware.bin";
        strlcpy(info.url, downloadUrl.c_str(), sizeof(info.url));
        Serial.printf("[OTA] Update available: %s → %s\n", FIRMWARE_VERSION, latest);
    } else {
        Serial.printf("[OTA] Already at latest: %s\n", FIRMWARE_VERSION);
    }
    return true;
}

// progress_cb: called with bytes done and total; pass nullptr to skip
inline bool otaApplyUpdate(const char* firmwareUrl,
                            std::function<void(size_t, size_t)> progress_cb = nullptr) {
    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    Serial.printf("[OTA] Downloading: %s\n", firmwareUrl);
    http.begin(client, firmwareUrl);
    http.setTimeout(60000);  // 60 s for large binary
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

    while (http.connected() && written < (size_t)contentLen) {
        int avail = stream->available();
        if (avail > 0) {
            int toRead = min(avail, (int)sizeof(buf));
            int n = stream->readBytes(buf, toRead);
            Update.write(buf, n);
            written += n;
            ledOta();
            if (progress_cb) progress_cb(written, contentLen);
        } else {
            delay(1);
        }
    }
    http.end();

    if (!Update.end(true)) {
        Serial.printf("[OTA] Update error: %d\n", Update.getError());
        ledError();
        return false;
    }

    Serial.println("[OTA] Update complete — rebooting.");
    ledOk();
    delay(500);
    ESP.restart();
    return true;  // Never reached
}
