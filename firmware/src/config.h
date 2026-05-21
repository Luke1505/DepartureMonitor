#pragma once

// ── Firmware ────────────────────────────────────────────────────────────────
#define FIRMWARE_VERSION   "1.0.0"

// SERVER_BASE_URL can be overridden at build time via -DSERVER_BASE_URL='"http://..."'
// Use the firmware-local env for local PC testing:
//   pio run -e firmware-local -t upload
#ifndef SERVER_BASE_URL
#define SERVER_BASE_URL    "https://transit.megaluke.de"
#endif

// ── E-paper (SPI) ───────────────────────────────────────────────────────────
#define EINK_CS    5
#define EINK_DC   17
#define EINK_RST  16
#define EINK_BUSY  4
// MOSI = GPIO23, CLK = GPIO18 (hardware SPI defaults)

// ── Buttons (active LOW, internal pull-up) ──────────────────────────────────
#define BTN_A 26  // Next page / confirm
#define BTN_B 27  // Previous page / back
#define BTN_C 14  // Settings shortcut
#define BTN_D 15  // RTC GPIO, safe with pull-down (strapping: LOW = normal boot)

// ── RGB Status LED (active HIGH via PWM) ────────────────────────────────────
#define LED_R 32
#define LED_G 33
#define LED_B 13

// ── Power Management ─────────────────────────────────────────────────────────
#define PWR_HOLD 25  // HIGH = on, LOW = power cut (P-channel MOSFET gate)
#define BAT_ADC  34  // ADC1_CH6 — 1:2 divider, read 0-4095

// ── Timing ───────────────────────────────────────────────────────────────────
#define DEFAULT_REFRESH_MIN    1
#define DEFAULT_SHUTDOWN_MIN  30
#define DEFAULT_BAT_WARN_PCT   15
#define API_TIMEOUT_MS       8000
#define WIFI_CONNECT_TIMEOUT_MS 12000
#define NTP_SERVER          "pool.ntp.org"
#define NTP_UPDATE_INTERVAL_MS (3600 * 1000UL)
#define CONFIG_POLL_INTERVAL_MS 5000
#define CONFIG_POLL_MAX_TRIES    60  // 5 min

// ── Preferences namespaces ───────────────────────────────────────────────────
#define PREFS_TRANSIT "transit"
#define PREFS_WIFI    "wifi"
#define PREFS_CACHE   "cache"
