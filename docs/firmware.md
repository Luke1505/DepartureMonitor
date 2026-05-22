# Firmware

The firmware runs on an ESP32 using the Arduino framework (PlatformIO). It drives a 2.13″ e-ink display and shows upcoming public-transport departures fetched from the backend. The device spends nearly all its time in deep sleep; it wakes on a timer or a button press, fetches fresh data over WiFi, refreshes the display, and goes back to sleep.

---

## Hardware

### ESP32 pinout

| Signal      | GPIO | Notes |
|-------------|------|-------|
| E-ink CS    | 5    | SPI chip select |
| E-ink DC    | 17   | Data/command |
| E-ink RST   | 16   | Hardware reset |
| E-ink BUSY  | 4    | Busy indicator |
| Battery ADC | 34   | ADC1_CH6, 1:2 voltage divider |
| BTN_A       | 26   | Active HIGH, external 10 kΩ pull-down; EXT1 (ANY_HIGH) |
| BTN_B       | 27   | Active HIGH, external 10 kΩ pull-down; EXT1 (ANY_HIGH) |
| BTN_C       | 14   | Active HIGH, external 10 kΩ pull-down; EXT1 (ANY_HIGH) |
| BTN_D       | 15   | Active HIGH, external 10 kΩ pull-down; EXT1 (ANY_HIGH) |

### E-ink display

- **Model:** GxEPD2_213_Z98c (BWR) or GxEPD2_213_BN (BW, selected with `-DDISPLAY_BW`)
- **Resolution:** 250 × 122 px (after `setRotation(1)`)
- **Colors:** White, Black, Red (BW build maps Red → Black)
- **Refresh:** partial refresh used for most screens; full refresh forced when red pixels change

### Battery monitoring

- ADC averages 16 samples on GPIO 34 through a 1:2 divider.
- Voltage formula: `voltage = (avg_adc / 4095.0) × 3.3 × 2.0`
- Charging detected if voltage > 4.25 V.
- Low-battery warning threshold: configurable, default **15 %**.

| Voltage (mV) | Capacity |
|---|---|
| ≥ 4200 | 100 % |
| 4000 | 80 % |
| 3800 | 60 % |
| 3600 | 30 % |
| 3400 | 10 % |
| 3200 | 2 % |
| < 3000 | 0 % |

---

## PlatformIO environments

```ini
# firmware/platformio.ini
[env:esp32dev]          ; local dev — Serial debug enabled (CORE_DEBUG_LEVEL=3)
[env:firmware-custom]   ; cloud build via build-worker — flags injected from EXTRA_FLAGS env var
```

The `firmware-custom` environment reads build flags at compile time from the `EXTRA_FLAGS` environment variable (set by the build-worker service):

| Flag | Purpose |
|------|---------|
| `-DDISPLAY_BW` | Build for BW-only display (omit for default BWR) |
| `-DDISPLAY_BWR` | Explicit BWR (default, can be omitted) |
| `-DLANG_DE` | German UI strings |
| `-DLANG_EN` | English UI strings |
| `-DLANG_FR` | French UI strings |
| `-DSERVER_BASE_URL='"https://…"'` | Backend URL embedded in firmware |
| `-DFIRMWARE_VERSION='"1.2.3"'` | Version string used for OTA comparison |

---

## Boot flow

On every wakeup the firmware checks `esp_sleep_get_wakeup_cause()`:

1. **First boot** (`_bootCount == 0`) — initialise NVS, generate UUID + access token, show `displayShowLoading`.
2. **BTN_A wakeup** — increment `_pageIdx` (wraps after config is loaded).
3. **BTN_B wakeup** — decrement `_pageIdx`.
4. **BTN_C wakeup** — show the access-code QR screen (`displayShowAccessCode`), then sleep.
5. **BTN_D wakeup** — open captive portal for WiFi/OTA configuration, then sleep.
6. **Timer wakeup** — normal refresh cycle.

After determining the page, the firmware:

- Connects to WiFi (tries all saved networks via `WiFiMulti`).
- Fetches `DeviceConfig` from NVS; falls back to cached departures if offline.
- Fetches fresh departures from the backend (respects the configured time-window per station).
- Renders the departure screen and saves data to NVS cache.
- Checks for OTA updates; downloads and applies if available (shows progress bar on display).
- Calculates next sleep duration from `refresh_min` and goes to deep sleep.

The device enters a permanent shutdown (no-wakeup deep sleep) after `shutdown_min` minutes of inactivity (`_inactiveBoots` counter, persisted in RTC memory).

### RTC variables (survive deep sleep)

| Variable | Type | Purpose |
|---|---|---|
| `_bootCount` | `uint32_t` | Total wakeup count |
| `_pageIdx` | `int` | Current station page |
| `_lastHadRed` | `bool` | Whether last frame used red pixels (drives full/partial refresh decision) |
| `_inactiveBoots` | `uint32_t` | Consecutive boots without user interaction |
| `_lastUpdateStr` | `char[20]` | Timestamp of last successful fetch |
| `_otaAvailable` | `bool` | OTA flag shown in header |

---

## NVS storage layout

All persistent state is stored in ESP32 NVS flash.

### Namespaces

| Namespace constant | Key | Contents |
|---|---|---|
| `PREFS_TRANSIT` (`"transit"`) | `uuid`, `access_token` | Device identity |
| | `refresh_min`, `shutdown_min`, `bat_warn_pct` | Timing / thresholds |
| | `station_cnt`, `timezone`, `ota_url` | Config |
| | `sN_stopId`, `sN_stopName`, `sN_label`, … | Per-station entries (prefix `sN_`) |
| `PREFS_WIFI` (`"wifi"`) | `count`, `ssid_N`, `pass_N` | Saved WiFi networks (FIFO, max 5) |
| `PREFS_CACHE` (`"cache"`) | `<djb2-hash>` | Cached departure JSON per stop |

### Per-station NVS keys (prefix `sN_`)

`stopId`, `stopName`, `label`, `icon`, `api`, `types` (String); `twS`, `twE` (Int, time-window start/end in minutes from midnight).

### Cache key generation

Cache keys are derived from the stop ID using a DJB2 hash, formatted as an 8-character hex string. This keeps every key under the 15-character NVS key limit.

---

## Device configuration (`DeviceConfig`)

Holds all user-configurable settings loaded from NVS:

| Field | Default | Description |
|---|---|---|
| `refreshMin` | 1 | Refresh interval in minutes |
| `shutdownMin` | 30 | Inactivity timeout before permanent sleep |
| `batWarnPct` | 15 | Low-battery warning threshold |
| `timezone` | `"UTC"` | POSIX timezone string (converted from city name) |
| `otaUrl` | `SERVER_BASE_URL` | OTA server base URL |
| `stationCount` | 0 | Number of configured stations (max 6) |
| `stations[]` | — | Array of up to 6 `StationConfig` entries |

---

## WiFi and captive portal

- The firmware stores up to **5 WiFi networks** in NVS (FIFO eviction when full).
- On each boot it attempts connection using `WiFiMulti` (tries all saved networks).
- If no networks are saved, or BTN_D is pressed, a **captive portal** AP is opened with SSID `departure-XXXX` (first 4 characters of the device UUID).
- The setup screen shows a QR code encoding `WIFI:T:nopass;S:departure-XXXX;;` for easy phone joining.
- After joining the AP, the phone is redirected to the device's captive portal page to enter WiFi credentials and the server URL.

---

## Display screens

All screens use FreeSans(Bold)9pt7b. The 3-colour display uses red for alerts and status indicators; the BW build maps red to black.

| Function | Refresh | Description |
|---|---|---|
| `displayShowLoading(message)` | Full | Boot splash with "Transit Keychain" heading and empty progress bar |
| `displayShowSetup(uuid)` | Full | WiFi setup: QR encodes `WIFI:T:nopass;S:departure-XXXX;;` + pairing instructions |
| `displayShowWaitingForConfig(uuid)` | Full | No stations configured: QR encodes `SERVER_BASE_URL/setup/<uuid>` |
| `displayShowAccessCode(uuid, token)` | Full | Shows 8-char token formatted as `XXXX-XXXX` + QR linking to `SERVER_BASE_URL/device/<uuid>?token=<token>` |
| `displayShowDepartures(…)` | Partial\* | Main screen: header (station icon + name + time + battery), 4 departure rows, footer (page indicator + battery %) |
| `displayShowNoSignal(lastTime)` | Partial | "No WiFi" with last-update timestamp if available |
| `displayShowOfflineClock(time24, lastUpdate)` | Partial | Large centered clock + offline footer |
| `displayShowLowBattery(pct)` | Full | Red warning with numeric battery level |
| `displayShowShutdown()` | Full | "Shutting down" message |
| `displayShowOtaProgress(version, done, total)` | Full | Version string + red fill progress bar |

\* Full refresh is forced when any red pixel appears or disappears (cancelled/delayed departures, OTA badge, low battery).

### Departure row layout (250 × 122 px)

```
┌────────────────────────────────────────────────────────────────┐  y=0
│ [icon] Station Name                          OTA 14:32  [bat] │  y=0–18  (header)
├────────────────────────────────────────────────────────────────┤  y=18
│ [U] U6   Garching Forschungszentrum              3m           │  y=22–42
│ [B] 100  Airport Terminal 1                      12m+2 (red)  │  y=42–62
│ [T] 17   Scheidplatz                             NOW  (red)   │  y=62–82
│ [S] S1   Ostbahnhof                             1h5          │  y=82–102
├────────────────────────────────────────────────────────────────┤  y=105
│ +                    2/3                              84%      │  y=119   (footer)
└────────────────────────────────────────────────────────────────┘
```

- Type badge: 14 × 14 px bitmap (`U`/`T` → tram, `S`/`R` → train, else bus)
- Station icons (12 × 12 px, red): `house` (default), `briefcase`, `star`, `shopping-cart`, `dumbbell`, `utensils`, `graduation-cap`, `cross`
- Time label: `Nm` (minutes), `NhM` (hours + minutes), `NOW` (red), `CNCL` (red), `+N` suffix for delay (red)
- Battery icon: 18 × 9 px; fill turns red at ≤ 15 %; lightning bolt overlay when charging

---

## OTA updates

1. On each normal boot, `otaCheckForUpdate()` GETs `SERVER_BASE_URL/api/firmware/latest`.
2. The response version string is compared to the compiled `FIRMWARE_VERSION`.
3. If a newer version is available, `_otaAvailable` is set (persists in RTC) and `"OTA"` appears in red in the header.
4. `otaApplyUpdate()` downloads `SERVER_BASE_URL/api/firmware/download/<version>/firmware.bin`, streams it via the Arduino `Update` library, and reboots on success.
5. Download progress is shown via `displayShowOtaProgress`.
