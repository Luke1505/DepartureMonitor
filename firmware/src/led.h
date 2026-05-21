#pragma once
#include <Arduino.h>
#include "config.h"

inline void ledInit() {
    pinMode(LED_R, OUTPUT);
    pinMode(LED_G, OUTPUT);
    pinMode(LED_B, OUTPUT);
    digitalWrite(LED_R, LOW);
    digitalWrite(LED_G, LOW);
    digitalWrite(LED_B, LOW);
}

inline void ledSet(bool r, bool g, bool b) {
    digitalWrite(LED_R, r ? HIGH : LOW);
    digitalWrite(LED_G, g ? HIGH : LOW);
    digitalWrite(LED_B, b ? HIGH : LOW);
}

inline void ledOff() { ledSet(false, false, false); }

// Blocking flash: on for onMs, then off
inline void ledFlash(bool r, bool g, bool b, uint32_t onMs = 100) {
    ledSet(r, g, b);
    delay(onMs);
    ledOff();
}

// Blocking blink n times
inline void ledBlink(bool r, bool g, bool b, int times = 3, uint32_t periodMs = 300) {
    for (int i = 0; i < times; i++) {
        ledSet(r, g, b);
        delay(periodMs / 2);
        ledOff();
        if (i < times - 1) delay(periodMs / 2);
    }
}

// Named helpers
inline void ledWifi()     { ledSet(false, false, true);  }  // blue   = connecting WiFi
inline void ledOta()      { ledSet(false, true,  true);  }  // cyan   = OTA in progress
inline void ledError()    { ledSet(true,  false, false); }  // red    = error
inline void ledOk()       { ledSet(false, true,  false); }  // green  = connected / ok
inline void ledSetup()    { ledSet(true,  false, true);  }  // purple = captive portal
inline void ledWorking()  { ledSet(true,  true,  false); }  // yellow = fetching data
