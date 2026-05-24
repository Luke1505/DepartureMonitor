#include <Arduino.h>
#include <esp_sleep.h>
#include <driver/gpio.h>
#include <driver/rtc_io.h>
#include <driver/dac.h>
#include <soc/rtc_io_reg.h>
#include <soc/rtc_cntl_reg.h>
#include <rom/ets_sys.h>
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
RTC_DATA_ATTR static int      _pageIdx        = 0;
RTC_DATA_ATTR static int      _inactiveBoots  = 0;
RTC_DATA_ATTR static char     _lastUpdateStr[6] = "--:--";
RTC_DATA_ATTR static bool     _otaAvailable   = false;
RTC_DATA_ATTR static int32_t  _fetchedEpoch   = 0;
RTC_DATA_ATTR static int8_t   _timeTicksLeft  = 0;
RTC_DATA_ATTR static int8_t   _refreshMinutes = 5;

// Set before entering shutdown deep sleep; cleared when a real button press wakes us.
// Prevents ghost wakeups from cycling through handleShutdown() repeatedly.
RTC_DATA_ATTR static bool     _inShutdownSleep        = false;

// Set in setup() when BTN_D was held for ≥3s; handled in handleNormalBoot() to trigger
// a silent token refresh instead of the normal token display.
static bool _btnDLongHold = false;

// Set when an EXT1 ghost wakeup falls through as a timer wakeup (no valid epoch to re-sleep).
// Prevents the ghost from counting as an inactive timer boot and advancing auto-shutdown.
static bool _wasGhostWakeup = false;

// Written by the wake stub (runs from RTC IRAM before ROM boot, ~1ms after wakeup).
// True = BTN_A was still HIGH after discharge+re-read → real press, not a ghost.
RTC_DATA_ATTR static bool     _wakeStubBtnAConfirmed  = false;
// 0=stub didn't run, 1=BTN_A not in EXT1, 2=pin LOW after drain, 3=pin HIGH after drain
RTC_DATA_ATTR static uint8_t  _wakeStubDebug          = 0;

// Snapshotted at the very top of setup() before anything can clear RTC registers
static esp_sleep_wakeup_cause_t _wakeupCause = ESP_SLEEP_WAKEUP_UNDEFINED;
static uint64_t                 _ext1Bits    = 0;

// ── Wake stub ─────────────────────────────────────────────────────────────────
// Runs in RTC IRAM immediately at wakeup — before ROM loads the Flash app.
// Only ROM functions and direct register writes are permitted here.
// GPIO26 (BTN_A) = RTC channel 7 → register bit = 14+7 = 21.
// EXT1 status register holds RTC channel bits [17:0], so GPIO26 = bit 7.
static void RTC_IRAM_ATTR wakeStub() {
    if (REG_READ(RTC_CNTL_EXT_WAKEUP1_STATUS_REG) & BIT(7)) {
        // Drive LOW for 5ms to discharge the DAC2 output capacitor
        REG_WRITE(RTC_GPIO_ENABLE_W1TS_REG, BIT(14 + 7));
        REG_WRITE(RTC_GPIO_OUT_W1TC_REG,    BIT(14 + 7));
        ets_delay_us(5000);
        // Release to input with pulldown; wait 20ms for the line to settle
        REG_WRITE(RTC_GPIO_ENABLE_W1TC_REG, BIT(14 + 7));
        REG_SET_BIT(RTC_IO_PAD_DAC2_REG, RTC_IO_PDAC2_RDE);
        REG_CLR_BIT(RTC_IO_PAD_DAC2_REG, RTC_IO_PDAC2_RUE);
        ets_delay_us(20000);
        _wakeStubBtnAConfirmed = (REG_READ(RTC_GPIO_IN_REG) >> (14 + 7)) & 1;
        _wakeStubDebug = _wakeStubBtnAConfirmed ? 3 : 2;
    } else {
        _wakeStubBtnAConfirmed = false;
        _wakeStubDebug = 1;
    }
    esp_default_wake_deep_sleep();
}

// ── Forward declarations ──────────────────────────────────────────────────────
static void goToSleep(int refreshMinutes);
static void handleShutdown();
static void handleFirstBoot();
static void handleNormalBoot(esp_sleep_wakeup_cause_t cause);

// ── Helpers ───────────────────────────────────────────────────────────────────

static void setupPowerLatch() {
    rtc_gpio_hold_dis(GPIO_NUM_25);
    rtc_gpio_init(GPIO_NUM_25);
    rtc_gpio_set_direction(GPIO_NUM_25, RTC_GPIO_MODE_OUTPUT_ONLY);
    rtc_gpio_set_level(GPIO_NUM_25, 1);
    // rtc_gpio_hold_en retains the HIGH through deep sleep; gpio_hold_en does not
    rtc_gpio_hold_en(GPIO_NUM_25);
}

static void initButtons() {
    // GPIO26 (BTN_A) shares the DAC2 peripheral — disable its output first so it
    // doesn't fight the pull-down and produce ghost HIGH readings.
    dac_output_disable(DAC_CHANNEL_2);
    pinMode(BTN_A, INPUT_PULLDOWN);
    pinMode(BTN_B, INPUT_PULLDOWN);
    pinMode(BTN_C, INPUT_PULLDOWN);
    pinMode(BTN_D, INPUT_PULLDOWN);
}

// Shared pre-sleep routine called by every sleep path.
// Configures EXT1 wakeup pins, registers the BTN_A wake stub, and holds GPIO2 LOW.
static void prepareSleep() {
    ledOff();
    pinMode(2, OUTPUT);
    digitalWrite(2, LOW);
    gpio_hold_en(GPIO_NUM_2);

    dac_output_disable(DAC_CHANNEL_2);
    const gpio_num_t ext1Pins[] = {(gpio_num_t)BTN_A, (gpio_num_t)BTN_B,
                                   (gpio_num_t)BTN_C, (gpio_num_t)BTN_D};
    for (auto pin : ext1Pins) {
        rtc_gpio_init(pin);
        rtc_gpio_set_direction(pin, RTC_GPIO_MODE_INPUT_ONLY);
        rtc_gpio_pulldown_en(pin);
        rtc_gpio_pullup_dis(pin);
    }
    uint64_t ext1Mask = (1ULL<<BTN_A)|(1ULL<<BTN_B)|(1ULL<<BTN_C)|(1ULL<<BTN_D);
    esp_sleep_enable_ext1_wakeup(ext1Mask, ESP_EXT1_WAKEUP_ANY_HIGH);
    esp_set_deep_sleep_wake_stub(wakeStub);
}

static void goToSleep(int refreshMinutes) {
    prepareSleep();
    esp_sleep_enable_timer_wakeup((uint64_t)refreshMinutes * 60 * 1000000ULL);
    Serial.printf("[PWR] Sleep for %d min, wake on BTN or timer.\n", refreshMinutes);
    Serial.flush();
    esp_deep_sleep_start();
}

static void handleShutdown() {
    Serial.println("[PWR] Shutting down — deep sleep until button press.");
    displayShowShutdown();
    delay(2000);
    _inShutdownSleep = true;
    prepareSleep();
    Serial.flush();
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
        displayShowSetup(uuid.c_str());
        if (!wifiOpenCaptivePortal(uuid.c_str())) {
            Serial.println("[BOOT] Portal timed out. Will retry on next boot.");
            goToSleep(DEFAULT_REFRESH_MIN);
            return;
        }
    } else {
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

    if (cfg.stationCount > 0) {
        StationDepartures deps = {};
        transitFetchDepartures(uuid, cfg.stations[0], deps);

        uint8_t bat; bool charging;
        batteryRead(bat, charging);
        String t = wifiGetTimeString(15);
        strlcpy(_lastUpdateStr, t.c_str(), sizeof(_lastUpdateStr));

        displayShowDepartures(deps, bat, charging,
                              t.c_str(), 0, cfg.stationCount,
                              false, _lastHadRed, _lastHadRed);

        _fetchedEpoch   = (int32_t)time(nullptr);
        _refreshMinutes = (int8_t)cfg.refreshMinutes;
        _timeTicksLeft  = (cfg.refreshMinutes > 1) ? cfg.refreshMinutes - 1 : 0;
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

    // ── Time-only intermediate refresh ────────────────────────────────────────
    // On timer wakeups between full data fetches: redraw with updated clock,
    // no WiFi. Skips config refresh, heartbeat, OTA check, and departure fetch.
    if (cause == ESP_SLEEP_WAKEUP_TIMER && _timeTicksLeft > 0) {
        _timeTicksLeft--;
        int n = max(cfg.stationCount, 1);
        int pageForDisplay = ((_pageIdx % n) + n) % n;
        wifiSyncTime(cfg.timezone);
        String timeNow = wifiGetTimeString();
        int elapsedMins = (_fetchedEpoch > 0)
            ? (int)((time(nullptr) - (time_t)_fetchedEpoch + 30) / 60) : 0;
        StationDepartures cached = {};
        if (transitLoadCachedDepartures(cfg.stations[pageForDisplay], cached)) {
            for (int i = 0; i < cached.count; i++) cached.rows[i].minsUntil -= elapsedMins;
            uint8_t bat; bool charging;
            batteryRead(bat, charging);
            displayShowDepartures(cached, bat, charging,
                                  timeNow.c_str(), pageForDisplay, cfg.stationCount,
                                  _otaAvailable, _lastHadRed, _lastHadRed);
        } else {
            _lastHadRed = false;
        }
        goToSleep(1);
        return;
    }

    // ── Handle button wakeup ──────────────────────────────────────────────────
    if (cause == ESP_SLEEP_WAKEUP_EXT1) {
        uint64_t bits = _ext1Bits;
        Serial.printf("[BTN] EXT1 wakeup, bits=0x%llx\n", bits);
        if (bits & (1ULL << BTN_A)) {
            _pageIdx++;
            _inactiveBoots = 0;
            Serial.printf("[BTN] A pressed → page %d (pre-norm)\n", _pageIdx);
        } else if (bits & (1ULL << BTN_B)) {
            _pageIdx--;
            _inactiveBoots = 0;
            Serial.printf("[BTN] B pressed → page %d (pre-norm)\n", _pageIdx);
        } else if (bits & (1ULL << BTN_C)) {
            _inactiveBoots = 0;
            Serial.println("[BTN] C pressed → force refresh");
        } else if (bits & (1ULL << BTN_D)) {
            _inactiveBoots = 0;
            if (_btnDLongHold) {
                _btnDLongHold = false;
                Serial.println("[BTN] D long-hold → silent token refresh");
                displayShowLoading("Refreshing token...");
                if (wifiConnect()) {
                    if (transitRegisterDevice(uuid)) {
                        displayShowLoading("Token refreshed.");
                    } else {
                        displayShowLoading("Refresh failed.");
                    }
                } else {
                    displayShowLoading("No WiFi.");
                }
                delay(2000);
                _timeTicksLeft = 0;
                goToSleep(1);
                return;
            }
            Serial.println("[BTN] D pressed → show access token");
            String token = transitGetAccessToken();
            if (token.length() > 0) {
                displayShowAccessCode(uuid.c_str(), token.c_str());
            } else {
                displayShowLoading("No token yet.");
            }
            _timeTicksLeft = 0;
            goToSleep(1);
            return;
        }
    } else {
        if (cause == ESP_SLEEP_WAKEUP_UNDEFINED) {
            _inactiveBoots = 0;
            Serial.println("[BOOT] Cold boot (power-on)");
        } else if (_wasGhostWakeup) {
            _wasGhostWakeup = false;
            Serial.println("[BOOT] Ghost wakeup (no epoch) — not counting as inactive");
        } else {
            _inactiveBoots++;
            Serial.printf("[BOOT] Timer wakeup, inactive boots: %d\n", _inactiveBoots);
        }
    }

    // ── Auto-shutdown after inactivity ────────────────────────────────────────
    if (cfg.shutdownMinutes > 0) {
        int inactiveMinutes = _inactiveBoots * cfg.refreshMinutes;
        if (inactiveMinutes >= cfg.shutdownMinutes) {
            Serial.println("[PWR] Auto-shutdown due to inactivity.");
            handleShutdown();
            return;
        }
    }

    // ── Battery check ─────────────────────────────────────────────────────────
    uint8_t bat; bool charging;
    batteryRead(bat, charging);
    Serial.printf("[BAT] %d%%\n", bat);
    if (bat <= cfg.batWarnPct && bat > 0) {
        displayShowLowBattery(bat);
        delay(3000);
    }

    // ── WiFi connect ──────────────────────────────────────────────────────────
    if (!wifiConnect()) {
        Serial.println("[WIFI] Offline — showing cached data.");
        int n = max(cfg.stationCount, 1);
        int pageForDisplay = ((_pageIdx % n) + n) % n;
        _pageIdx = pageForDisplay;
        StationDepartures cached = {};
        if (transitLoadCachedDepartures(cfg.stations[pageForDisplay], cached)) {
            displayShowDepartures(cached, bat, charging,
                                  _lastUpdateStr, pageForDisplay, cfg.stationCount,
                                  _otaAvailable, _lastHadRed, _lastHadRed);
        } else {
            _lastHadRed = false;
            displayShowNoSignal(_lastUpdateStr);
        }
        goToSleep(cfg.refreshMinutes);
        return;
    }

    // ── Time sync ─────────────────────────────────────────────────────────────
    wifiSyncTime(cfg.timezone);

    // ── Config refresh / heartbeat / WiFi sync (timer wakeup only) ───────────
    // Skip on button press — we want fresh departures fast.
    if (cause == ESP_SLEEP_WAKEUP_TIMER) {
        DeviceConfig freshCfg;
        memset(&freshCfg, 0, sizeof(freshCfg));
        bool cfgPending = false;
        if (transitFetchConfig(uuid, freshCfg, &cfgPending) && freshCfg.stationCount > 0) {
            strlcpy(freshCfg.uuid, uuid.c_str(), sizeof(freshCfg.uuid));
            cfg = freshCfg;
            transitSaveConfig(cfg);
            Serial.println("[CFG] Config refreshed from server.");
        } else if (cfgPending) {
            Serial.println("[CFG] Server returned pending_setup — re-registering device.");
            transitRegisterDevice(uuid);
        } else {
            Serial.println("[CFG] Config fetch failed (network?) — keeping cached config.");
        }

        String showToken = transitSendHeartbeat(uuid, bat);
        if (showToken.length() > 0) {
            Serial.printf("[AUTH] Server requested token display: %s\n", showToken.c_str());
            displayShowAccessCode(uuid.c_str(), showToken.c_str());
            goToSleep(1);
            return;
        }

        transitSyncWifiNetworks(uuid);

        OtaInfo ota;
        if (otaCheckForUpdate(ota, uuid)) {
            _otaAvailable = ota.available;
            if (ota.available) {
                displayShowOtaProgress(ota.version, 0, 0);
                otaApplyUpdate(ota.url, ota.cacheKey, [&](size_t done, size_t total) {
                    displayShowOtaProgress(ota.version, done, total);
                });
                _otaAvailable = false; // only reached if OTA failed
            }
        }
    }

    // ── Fetch + display departures ────────────────────────────────────────────
    int n = max(cfg.stationCount, 1);
    int pageForDisplay = ((_pageIdx % n) + n) % n;
    _pageIdx = pageForDisplay;
    StationDepartures deps = {};
    if (!transitFetchDepartures(uuid, cfg.stations[pageForDisplay], deps)) {
        transitLoadCachedDepartures(cfg.stations[pageForDisplay], deps);
    }

    String timeNow = wifiGetTimeString(15);
    strlcpy(_lastUpdateStr, timeNow.c_str(), sizeof(_lastUpdateStr));
    displayShowDepartures(deps, bat, charging,
                          timeNow.c_str(), pageForDisplay, cfg.stationCount,
                          _otaAvailable, _lastHadRed, _lastHadRed);

    _fetchedEpoch   = (int32_t)time(nullptr);
    _refreshMinutes = (int8_t)cfg.refreshMinutes;
    _timeTicksLeft  = (cfg.refreshMinutes > 1) ? cfg.refreshMinutes - 1 : 0;

    goToSleep(cfg.refreshMinutes);
}

// Increase loopTask stack: DeviceConfig + StationDepartures structs are large (~2KB each)
SET_LOOP_TASK_STACK_SIZE(24 * 1024);

// ── Arduino entry points ──────────────────────────────────────────────────────

void setup() {
    // Snapshot wakeup registers FIRST — before anything can clear them.
    _wakeupCause = esp_sleep_get_wakeup_cause();
    _ext1Bits    = esp_sleep_get_ext1_wakeup_status();

    gpio_hold_dis(GPIO_NUM_2);
    pinMode(2, OUTPUT);
    digitalWrite(2, LOW);

    // ── EXT1 ghost filter ─────────────────────────────────────────────────────
    // BTN_A (GPIO26/DAC2): wake stub ran discharge+re-read at ~25ms; result in
    //   _wakeStubBtnAConfirmed. Any tap longer than ~25ms is accepted.
    // BTN_B (GPIO27): floats HIGH during sleep on this board — runtime re-read.
    // BTN_C/D: no ghost issues; trust EXT1 directly.
    if (_wakeupCause == ESP_SLEEP_WAKEUP_EXT1 && _ext1Bits != 0) {
        uint64_t confirmed = 0;

        if (_ext1Bits & (1ULL << BTN_A)) {
            if (_wakeStubBtnAConfirmed) confirmed |= (1ULL << BTN_A);
            _wakeStubBtnAConfirmed = false;
        }
        if (_ext1Bits & (1ULL << BTN_B)) {
            rtc_gpio_set_direction(GPIO_NUM_27, RTC_GPIO_MODE_INPUT_ONLY);
            rtc_gpio_pulldown_en(GPIO_NUM_27);
            delay(10);
            if (rtc_gpio_get_level(GPIO_NUM_27)) confirmed |= (1ULL << BTN_B);
        }
        if (_ext1Bits & (1ULL << BTN_C)) confirmed |= (1ULL << BTN_C);
        if (_ext1Bits & (1ULL << BTN_D)) confirmed |= (1ULL << BTN_D);

        _ext1Bits = confirmed;
    }

    Serial.begin(115200);
    delay(100);

    if (_wakeupCause == ESP_SLEEP_WAKEUP_EXT1)
        Serial.printf("[STUB] debug=%u ext1=0x%llx\n", _wakeStubDebug, _ext1Bits);
    _wakeStubDebug = 0;

    setupPowerLatch();
    initButtons();

    // ── BTN_D long-hold detection ─────────────────────────────────────────────
    // If BTN_D woke us, sample the pin for up to 3s. A continuous hold triggers
    // silent token refresh instead of the normal token-display shortcut.
    if (_wakeupCause == ESP_SLEEP_WAKEUP_EXT1 && (_ext1Bits & (1ULL << BTN_D))) {
        uint32_t held = 0;
        while (digitalRead(BTN_D) && held < 3000) { delay(100); held += 100; }
        _btnDLongHold = (held >= 3000);
        if (_btnDLongHold) Serial.println("[BTN] D long-hold detected.");
    }

    // ── Shutdown-sleep ghost guard ────────────────────────────────────────────
    // In shutdown sleep there's no timer, so any ghost wakeup must go straight
    // back to sleep without touching the display or incrementing counters.
    if (_inShutdownSleep) {
        if (_ext1Bits == 0) {
            prepareSleep();
            esp_deep_sleep_start();
        }
        // Real button press — exit shutdown sleep and boot normally.
        _inShutdownSleep = false;
        _inactiveBoots   = 0;
    }

    // ── Normal ghost guard ────────────────────────────────────────────────────
    // EXT1 fired but all pins resolved LOW — go back to sleep for the remaining
    // interval rather than running a full boot cycle.
    if (_wakeupCause == ESP_SLEEP_WAKEUP_EXT1 && _ext1Bits == 0) {
        time_t now = time(nullptr);
        int32_t remainSecs = (int32_t)((time_t)_fetchedEpoch + _refreshMinutes * 60 - now);
        if (_fetchedEpoch > 0 && now > 1000000L && remainSecs > 10) {
            prepareSleep();
            esp_sleep_enable_timer_wakeup((uint64_t)remainSecs * 1000000ULL);
            esp_deep_sleep_start();
        }
        _wasGhostWakeup = true;
        _wakeupCause = ESP_SLEEP_WAKEUP_TIMER;
        Serial.println("[BTN] EXT1 ghost wakeup — treating as timer");
    }

    ledInit();
    analogSetAttenuation(ADC_11db);

    _bootCount++;
    Serial.printf("\n=== Transit Keychain v%s  boot #%lu ===\n",
                  FIRMWARE_VERSION, (unsigned long)_bootCount);

    displayInit();

    esp_sleep_wakeup_cause_t cause = _wakeupCause;
    Serial.printf("[BOOT] Wakeup cause: %d  EXT1 bits: 0x%llx\n", (int)cause, _ext1Bits);

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
    // All work is done in setup(); deep sleep is entered before loop() runs.
    delay(1000);
}
