#include <Arduino.h>
#include <esp_sleep.h>
#include <driver/gpio.h>
#include <driver/rtc_io.h>
#include "config.h"
#include "led.h"
#include "battery.h"
#include "wifi_manager.h"
#include "transit_api.h"
#include "ota.h"
#include "display.h"

// ── RTC memory (survives deep sleep) ─────────────────────────────────────────
RTC_DATA_ATTR static uint32_t _bootCount      = 0;
RTC_DATA_ATTR static bool     _lastHadRed     = false;
RTC_DATA_ATTR static int      _pageIdx        = 0;   // current station page
RTC_DATA_ATTR static int      _inactiveBoots  = 0;   // boots since last user interaction
RTC_DATA_ATTR static char     _lastUpdateStr[6] = "--:--";
RTC_DATA_ATTR static bool     _otaAvailable   = false;

// ── Forward declarations ──────────────────────────────────────────────────────
static void goToSleep(int refreshMinutes);
static void handleShutdown();
static void handleFirstBoot();
static void handleNormalBoot(esp_sleep_wakeup_cause_t cause);

// ── Helpers ───────────────────────────────────────────────────────────────────

static void setupPowerLatch() {
    // Release any previous hold before reconfiguring
    rtc_gpio_hold_dis(GPIO_NUM_25);
    rtc_gpio_init(GPIO_NUM_25);
    rtc_gpio_set_direction(GPIO_NUM_25, RTC_GPIO_MODE_OUTPUT_ONLY);
    rtc_gpio_set_level(GPIO_NUM_25, 1);
    // rtc_gpio_hold_en guarantees the HIGH level is retained through deep sleep
    // (gpio_hold_en does NOT reliably hold during deep sleep on ESP32)
    rtc_gpio_hold_en(GPIO_NUM_25);
}

static void initButtons() {
    // BTN_A: active LOW (internal pull-up) → EXT0 wake on LOW
    pinMode(BTN_A, INPUT_PULLUP);
    // BTN_B/C/D: active HIGH (external 10k pull-down to GND) → EXT1 wake on ANY_HIGH
    pinMode(BTN_B, INPUT);
    pinMode(BTN_C, INPUT);
    pinMode(BTN_D, INPUT);
}

static bool isButtonA() { return digitalRead(BTN_A) == LOW; }
static bool isButtonB() { return digitalRead(BTN_B) == HIGH; }
static bool isButtonC() { return digitalRead(BTN_C) == HIGH; }

// Setup deep-sleep wakeup sources
static void configureSleepWakeup(int refreshMinutes) {
    // BTN_A (GPIO26) via EXT0: active-LOW with internal pull-up kept during sleep
    rtc_gpio_init((gpio_num_t)BTN_A);
    rtc_gpio_set_direction((gpio_num_t)BTN_A, RTC_GPIO_MODE_INPUT_ONLY);
    rtc_gpio_pullup_en((gpio_num_t)BTN_A);
    rtc_gpio_pulldown_dis((gpio_num_t)BTN_A);
    esp_sleep_enable_ext0_wakeup((gpio_num_t)BTN_A, 0);

    // BTN_B/C/D via EXT1: active-HIGH (external pull-down 10k to GND)
    // Enable RTC pull-downs so pins stay LOW during sleep without external resistors
    const gpio_num_t ext1Pins[] = {(gpio_num_t)BTN_B, (gpio_num_t)BTN_C, (gpio_num_t)BTN_D};
    for (auto pin : ext1Pins) {
        rtc_gpio_init(pin);
        rtc_gpio_set_direction(pin, RTC_GPIO_MODE_INPUT_ONLY);
        rtc_gpio_pulldown_en(pin);
        rtc_gpio_pullup_dis(pin);
    }
    uint64_t ext1Mask = (1ULL << BTN_B) | (1ULL << BTN_C) | (1ULL << BTN_D);
    esp_sleep_enable_ext1_wakeup(ext1Mask, ESP_EXT1_WAKEUP_ANY_HIGH);

    // Timer wakeup for periodic refresh
    uint64_t sleepUs = (uint64_t)refreshMinutes * 60 * 1000000ULL;
    esp_sleep_enable_timer_wakeup(sleepUs);

    Serial.printf("[PWR] Sleep for %d min, wake on BTN or timer.\n", refreshMinutes);
}

static void goToSleep(int refreshMinutes) {
    ledOff();
    Serial.flush();
    configureSleepWakeup(refreshMinutes);
    esp_deep_sleep_start();
}

static void handleShutdown() {
    Serial.println("[PWR] Shutting down.");
    displayShowShutdown();
    delay(2000);
    rtc_gpio_hold_dis(GPIO_NUM_25);
    rtc_gpio_set_level(GPIO_NUM_25, 0);
    delay(500);
    // Fallback: deep sleep with no wakeup sources
    esp_deep_sleep_start();
}

// ── First boot flow ───────────────────────────────────────────────────────────

static void handleFirstBoot() {
    Serial.println("[BOOT] First boot — starting setup flow.");

    String uuid = transitGetOrCreateUuid();
    Serial.printf("[BOOT] UUID: %s\n", uuid.c_str());

    // Check if WiFi credentials already exist (e.g. portal done but config timed out)
    Preferences chk;
    chk.begin(PREFS_WIFI, true);
    int knownNets = chk.getInt("count", 0);
    chk.end();

    if (knownNets == 0) {
        // True first boot: show setup screen and open captive portal
        displayShowSetup(uuid.c_str());
        if (!wifiOpenCaptivePortal(uuid.c_str())) {
            Serial.println("[BOOT] Portal timed out. Will retry on next boot.");
            goToSleep(DEFAULT_REFRESH_MIN);
            return;
        }
        // wifiOpenCaptivePortal already connected; fall through to register + poll
    } else {
        // WiFi known but no config yet — skip portal, connect directly
        displayShowWaitingForConfig(uuid.c_str());
        if (!wifiConnect()) {
            Serial.println("[BOOT] WiFi connect failed.");
            goToSleep(DEFAULT_REFRESH_MIN);
            return;
        }
    }

    wifiSyncTime();
    transitRegisterDevice(uuid);
    displayShowWaitingForConfig(uuid.c_str());

    DeviceConfig cfg;
    memset(&cfg, 0, sizeof(cfg));
    strlcpy(cfg.uuid, uuid.c_str(), sizeof(cfg.uuid));

    if (!transitPollForConfig(uuid, cfg)) {
        Serial.println("[BOOT] Config polling timed out.");
        goToSleep(DEFAULT_REFRESH_MIN);
        return;
    }

    transitSaveConfig(cfg);
    Serial.println("[BOOT] Config saved. Starting normal operation.");

    // Fetch and show first departures
    if (cfg.stationCount > 0) {
        StationDepartures deps;
        WeatherData weather = {};
        transitFetchDepartures(uuid, cfg.stations[0], deps);
        if (cfg.stations[0].lat != 0.0f) {
            transitFetchWeather(uuid, cfg.stations[0].lat, cfg.stations[0].lon, weather);
        }

        uint8_t bat = batteryReadPercent();
        String t = wifiGetTimeString(15);
        strlcpy(_lastUpdateStr, t.c_str(), sizeof(_lastUpdateStr));

        displayShowDepartures(deps, weather, bat, batteryIsCharging(),
                              t.c_str(), 0, cfg.stationCount,
                              false, _lastHadRed, _lastHadRed);
    }

    goToSleep(cfg.refreshMinutes);
}

// ── Normal boot (timer / button wakeup) ──────────────────────────────────────

static void handleNormalBoot(esp_sleep_wakeup_cause_t cause) {
    String uuid = transitGetOrCreateUuid();

    DeviceConfig cfg;
    memset(&cfg, 0, sizeof(cfg));
    if (!transitLoadConfig(uuid, cfg)) {
        Serial.println("[BOOT] No config in NVS — showing waiting screen.");
        displayShowWaitingForConfig(uuid.c_str());
        goToSleep(DEFAULT_REFRESH_MIN);
        return;
    }
    strlcpy(cfg.uuid, uuid.c_str(), sizeof(cfg.uuid));

    // ── Handle button wakeup ──────────────────────────────────────────────────
    if (cause == ESP_SLEEP_WAKEUP_EXT0) {
        // BTN_A: next page
        _pageIdx = (_pageIdx + 1) % max(cfg.stationCount, 1);
        _inactiveBoots = 0;
        Serial.printf("[BTN] A pressed → page %d\n", _pageIdx);
    } else if (cause == ESP_SLEEP_WAKEUP_EXT1) {
        uint64_t bits = esp_sleep_get_ext1_wakeup_status();
        if (bits & (1ULL << BTN_B)) {
            // BTN_B: previous page (active HIGH)
            _pageIdx = (_pageIdx - 1 + max(cfg.stationCount, 1)) % max(cfg.stationCount, 1);
            _inactiveBoots = 0;
            Serial.printf("[BTN] B pressed → page %d\n", _pageIdx);
        } else if (bits & (1ULL << BTN_C)) {
            // BTN_C: force OTA check (active HIGH)
            _inactiveBoots = 0;
            Serial.println("[BTN] C pressed → OTA check");
        } else if (bits & (1ULL << BTN_D)) {
            // BTN_D: reserved (active HIGH)
            _inactiveBoots = 0;
        }
    } else {
        // Timer wakeup
        _inactiveBoots++;
        Serial.printf("[BOOT] Timer wakeup, inactive boots: %d\n", _inactiveBoots);
    }

    // ── Auto-shutdown after inactivity ───────────────────────────────────────
    if (cfg.shutdownMinutes > 0) {
        int inactiveMinutes = _inactiveBoots * cfg.refreshMinutes;
        if (inactiveMinutes >= cfg.shutdownMinutes) {
            Serial.println("[PWR] Auto-shutdown due to inactivity.");
            handleShutdown();
            return;
        }
    }

    // ── Battery check ─────────────────────────────────────────────────────────
    uint8_t bat = batteryReadPercent();
    Serial.printf("[BAT] %d%%\n", bat);
    if (bat <= cfg.batWarnPct && bat > 0) {
        displayShowLowBattery(bat);
        delay(3000);
    }

    // ── WiFi connect ──────────────────────────────────────────────────────────
    bool connected = wifiConnect();

    if (!connected) {
        Serial.println("[WIFI] Offline — showing cached data.");
        int pageForDisplay = min(_pageIdx, cfg.stationCount - 1);
        StationDepartures cached;
        if (transitLoadCachedDepartures(cfg.stations[pageForDisplay], cached)) {
            WeatherData noWeather = {};
            displayShowDepartures(cached, noWeather, bat, batteryIsCharging(),
                                  _lastUpdateStr, pageForDisplay, cfg.stationCount,
                                  _otaAvailable, _lastHadRed, _lastHadRed);
        } else {
            displayShowNoSignal(_lastUpdateStr);
        }
        goToSleep(cfg.refreshMinutes);
        return;
    }

    // ── Time sync (every boot while online) ──────────────────────────────────
    wifiSyncTime(cfg.timezone);

    // ── Refresh config from server (picks up web UI changes immediately) ──────
    {
        DeviceConfig freshCfg;
        memset(&freshCfg, 0, sizeof(freshCfg));
        if (transitFetchConfig(uuid, freshCfg) && freshCfg.stationCount > 0) {
            strlcpy(freshCfg.uuid, uuid.c_str(), sizeof(freshCfg.uuid));
            cfg = freshCfg;
            transitSaveConfig(cfg);
            Serial.println("[CFG] Config refreshed from server.");
        }
    }

    // ── Heartbeat ─────────────────────────────────────────────────────────────
    transitSendHeartbeat(uuid, bat);

    // ── Sync WiFi networks from server ────────────────────────────────────────
    transitSyncWifiNetworks(uuid);

    // ── OTA check (on timer wakeup or BTN_C) ─────────────────────────────────
    if (cause == ESP_SLEEP_WAKEUP_TIMER || (cause == ESP_SLEEP_WAKEUP_EXT1 &&
        (esp_sleep_get_ext1_wakeup_status() & (1ULL << BTN_C)))) {
        OtaInfo ota;
        if (otaCheckForUpdate(ota)) {
            _otaAvailable = ota.available;
            if (ota.available) {
                displayShowOtaProgress(ota.version, 0, 0);
                otaApplyUpdate(ota.url, [&](size_t done, size_t total) {
                    displayShowOtaProgress(ota.version, done, total);
                });
                // otaApplyUpdate reboots if successful; if we get here it failed
                _otaAvailable = false;
            }
        }
    }

    // ── Fetch departures for current page ─────────────────────────────────────
    int pageForDisplay = min(_pageIdx, cfg.stationCount - 1);
    StationDepartures deps;
    bool fetchOk = transitFetchDepartures(uuid, cfg.stations[pageForDisplay], deps);
    if (!fetchOk) {
        // Fall back to cached
        transitLoadCachedDepartures(cfg.stations[pageForDisplay], deps);
    }

    // ── Weather for current station ───────────────────────────────────────────
    WeatherData weather = {};
    transitFetchWeather(uuid, cfg.stations[pageForDisplay].lat,
                        cfg.stations[pageForDisplay].lon, weather);

    // ── Draw departures ───────────────────────────────────────────────────────
    String timeNow = wifiGetTimeString(15);
    strlcpy(_lastUpdateStr, timeNow.c_str(), sizeof(_lastUpdateStr));
    displayShowDepartures(deps, weather, bat, batteryIsCharging(),
                          timeNow.c_str(), pageForDisplay, cfg.stationCount,
                          _otaAvailable, _lastHadRed, _lastHadRed);

    goToSleep(cfg.refreshMinutes);
}

// ── Arduino entry points ──────────────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    delay(100);

    setupPowerLatch();
    initButtons();
    ledInit();
    analogSetAttenuation(ADC_11db);  // Full 0-3.3 V range for battery ADC

    _bootCount++;
    Serial.printf("\n=== Transit Keychain v%s  boot #%lu ===\n",
                  FIRMWARE_VERSION, (unsigned long)_bootCount);

    displayInit();

    esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
    Serial.printf("[BOOT] Wakeup cause: %d\n", (int)cause);

    // Cold boot or unknown = first boot check
    if (cause == ESP_SLEEP_WAKEUP_UNDEFINED) {
        Preferences chk;
        chk.begin(PREFS_WIFI, true);
        int knownNets = chk.getInt("count", 0);
        chk.end();

        Preferences tcfg;
        tcfg.begin(PREFS_TRANSIT, true);
        int stationCnt = tcfg.getInt("station_cnt", 0);
        tcfg.end();

        if (knownNets == 0 || stationCnt == 0) {
            handleFirstBoot();
            return;
        }
    }

    handleNormalBoot(cause);
}

void loop() {
    // All work done in setup(); deep sleep is entered at the end.
    // loop() should never be reached.
    delay(1000);
}
