#pragma once
#include <Arduino.h>
#include "config.h"

// LiPo voltage-to-percentage curve (voltage in mV → percent)
static const struct { uint16_t mv; uint8_t pct; } kBatCurve[] = {
    {4200, 100}, {4000, 80}, {3800, 60}, {3600, 30},
    {3400, 10},  {3200,  2}, {3000,  0}
};

inline float batteryReadVoltage() {
    // 10-sample average of 12-bit ADC (1:2 divider → multiply by 2)
    long sum = 0;
    for (int i = 0; i < 10; i++) {
        sum += analogRead(BAT_ADC);
        delayMicroseconds(500);
    }
    return (sum / 10.0f) / 4095.0f * 3.3f * 2.0f;
}

inline uint8_t batteryVoltageToPercent(float voltage) {
    uint16_t mv = (uint16_t)(voltage * 1000.0f);
    const int n = sizeof(kBatCurve) / sizeof(kBatCurve[0]);
    if (mv >= kBatCurve[0].mv) return 100;
    if (mv <= kBatCurve[n - 1].mv) return 0;
    for (int i = 0; i < n - 1; i++) {
        if (mv <= kBatCurve[i].mv && mv > kBatCurve[i + 1].mv) {
            float frac = (float)(kBatCurve[i].mv - mv) /
                         (float)(kBatCurve[i].mv - kBatCurve[i + 1].mv);
            return (uint8_t)(kBatCurve[i].pct - frac * (kBatCurve[i].pct - kBatCurve[i + 1].pct));
        }
    }
    return 0;
}

inline uint8_t batteryReadPercent() {
    return batteryVoltageToPercent(batteryReadVoltage());
}

inline bool batteryIsCharging() {
    // Reading above 4.25 V typically means USB is connected and charging
    return batteryReadVoltage() > 4.25f;
}
