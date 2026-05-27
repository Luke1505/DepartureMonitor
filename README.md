# Transit Keychain — ESP32 Departure Monitor

A wearable / keychain-sized e-ink display showing real-time public transit departures, powered by an ESP32 and the [transit.megaluke.de](https://transit.megaluke.de) web portal.

**Live portal:** [transit.megaluke.de](https://transit.megaluke.de)

---

## Table of Contents

1. [Hardware BOM](#hardware-bom)
2. [Pin Map](#pin-map)
3. [Wiring Diagram](#wiring-diagram)
4. [Building & Flashing](#building--flashing)
5. [First Boot Flow](#first-boot-flow)
6. [Button Actions](#button-actions)
7. [LED Status](#led-status)
8. [Device Token Auth](#device-token-auth)
9. [Display Screens](#display-screens)
10. [Web Portal](#web-portal)
11. [Self-Hosting](#self-hosting)
12. [Wokwi Simulation](#wokwi-simulation)
13. [Project Structure](#project-structure)
14. [License](#license)

---

## Hardware BOM

| # | Component | Spec | Notes |
|---|-----------|------|-------|
| 1 | ESP32 DevKit V1 | 38-pin | Any ESP32-WROOM-32 module works |
| 2 | E-paper display | WeAct 2.13" BWR (GxEPD2_213_Z98c) | 122×250 px, Black/White/Red |
| 3 | LiPo battery | 3.7 V, 400–1000 mAh | With JST-PH 2-pin connector |
| 4 | TP4056 charging module | USB-C variant | For battery charging |
| 5 | AO3401 P-Channel MOSFET | SOT-23 | Power latch |
| 6 | Tactile push-buttons | 6×6 mm, 4× | Navigation: A/B/C/D |
| 7 | RGB LED | Common cathode | Status indicator |
| 8 | Resistors | 220 Ω, 3× | LED current limiting |
| 9 | Resistors | 10 kΩ, 2× | Voltage divider for battery ADC |
| 10 | Slide potentiometer | 10 kΩ | Wokwi simulation of battery level only |

---

## Pin Map

| GPIO | Function | Notes |
|------|----------|-------|
| 23 | EINK MOSI (SPI) | Hardware SPI |
| 18 | EINK CLK (SPI) | Hardware SPI |
| 5 | EINK CS | Chip select |
| 17 | EINK DC | Data/Command |
| 16 | EINK RST | Reset |
| 4 | EINK BUSY | Busy signal |
| 26 | BTN_A | Next page — **active LOW**, internal pull-up, EXT0 wakeup |
| 27 | BTN_B | Previous page — **active HIGH**, external 10k pull-down to GND, EXT1 wakeup |
| 14 | BTN_C | Force OTA / refresh — **active HIGH**, external 10k pull-down, EXT1 wakeup |
| **15** | **BTN_D** | **Show access token — active HIGH, external 10k pull-down, EXT1 wakeup** |
| 25 | PWR_HOLD | Power latch (HIGH = on, LOW = cut power) |
| 34 | BAT_ADC | Battery voltage via 1:2 divider (ADC1_CH6) |
| 32 | LED_R | Red LED channel (active HIGH via 220 Ω) |
| 33 | LED_G | Green LED channel (active HIGH via 220 Ω) |
| 13 | LED_B | Blue LED channel (active HIGH via 220 Ω) |

> **⚠ BTN_D changed:** BTN_D is **GPIO 15**, not GPIO 12. GPIO 15 is an RTC-capable GPIO that is safe to use with an external pull-down resistor and will not interfere with boot strapping.

> **Button wiring:**
> - **BTN_A** (GPIO 26): connect between GPIO 26 and GND. Internal pull-up keeps it HIGH; press pulls LOW.
> - **BTN_B / C / D**: connect between the GPIO and VCC (+3.3 V). Add an external 10 kΩ pull-down to GND. Press pulls HIGH.  
>   External pull-downs are required for reliable EXT1 deep-sleep wakeup — internal pull-ups are disabled during sleep.

### Battery voltage divider

Connect the LiPo positive terminal through two 10 kΩ resistors in series to GND. The midpoint connects to GPIO 34. The ADC reads half the battery voltage; firmware doubles it.

```
VBAT ──── R1 (10k) ──┬── R2 (10k) ──── GND
                     │
                  GPIO34
```

---

## Wiring Diagram

```
                          ┌─────────────────────────────────────┐
                          │          ESP32 DevKit V1             │
                          │                                      │
  3.3V ──┬─────────────── │ 3V3                      GND ─────┬─ │ ─── GND
         │                │                                   │  │
  ┌──────┴──────────────  │ GPIO23 ──── MOSI (e-ink)          │  │
  │  e-ink display        │ GPIO18 ──── CLK  (e-ink)          │  │
  │  WeAct 2.13" BWR      │ GPIO5  ──── CS   (e-ink)          │  │
  │                       │ GPIO17 ──── DC   (e-ink)          │  │
  │                       │ GPIO16 ──── RST  (e-ink)          │  │
  └──────────────────────  │ GPIO4  ──── BUSY (e-ink)          │  │
                           │                                   │  │
  ┌── BTN_A ──────────────  │ GPIO26 ──[internal pull-up]       │  │
  │   (GND side)            │           press = LOW             │  │
  │                         │                                   │  │
  ├── BTN_B ── 10k ── GND   │ GPIO27 ──────────────── BTN_B ──3V3  │
  ├── BTN_C ── 10k ── GND   │ GPIO14 ──────────────── BTN_C ──3V3  │
  └── BTN_D ── 10k ── GND   │ GPIO15 ──────────────── BTN_D ──3V3  │
                             │                                      │
  RGB LED (common cathode):  │ GPIO32 ── 220Ω ── LED_R             │
    R ── 220Ω ── GPIO32      │ GPIO33 ── 220Ω ── LED_G             │
    G ── 220Ω ── GPIO33      │ GPIO13 ── 220Ω ── LED_B             │
    B ── 220Ω ── GPIO13      │                                      │
    Cathode ──── GND         │                                      │
                             │                                      │
  Battery circuit:           │ GPIO25 ──── PWR_HOLD (AO3401 gate)  │
    VBAT ──┬── TP4056 ───────│────────── 5V (USB charging)         │
           │                 │                                      │
           ├── AO3401 ───────│── PWR_HOLD (HIGH = FET on = 3V3 on) │
           │                 │                                      │
           ├── R1(10k)──┬────│ GPIO34 (BAT_ADC)                    │
                        R2(10k)                                     │
                        │    │                                      │
                       GND   └──────────────────────────────────────┘
```

---

## Building & Flashing

### Prerequisites

- [PlatformIO](https://platformio.org/) (VS Code extension or CLI)
- USB cable connected to the ESP32 DevKit

### Build only

```bash
cd firmware
pio run
```

### Flash (USB)

```bash
cd firmware
pio run -t upload
```

### Monitor serial output

```bash
cd firmware
pio device monitor
```

Baud rate is **115200**. The monitor shows boot cause, WiFi status, battery percentage, and API responses.

### Build, flash, and monitor in one step

```bash
cd firmware
pio run -t upload && pio device monitor
```

### Build environments

| Environment | Use case |
|-------------|----------|
| `esp32dev` | Local dev / direct USB flash — debug level 3 enabled |
| `firmware-custom` | Cloud build (build-worker) — display type, language, and server URL injected via `EXTRA_FLAGS` |

---

## First Boot Flow

1. **Power on** — press the power button (or connect USB); the RGB LED lights up blue.
2. **Cold boot detected** — no WiFi credentials or station config found in NVS.
3. **Captive portal opens** — the device broadcasts a WiFi AP named `departure-XXXX` (XXXX = first 4 chars of the device UUID). The LED turns purple.
4. **Connect your phone or laptop** to that AP.
5. A browser popup appears automatically (or navigate to `192.168.4.1`) showing the WiFiManager configuration page.
6. **Enter your home WiFi credentials** and tap Save.
7. The device connects to your WiFi and the e-ink display shows the setup URL:
   ```
   transit.megaluke.de/setup/<uuid>
   ```
8. **Open that URL** on any browser — select up to **6 stations**, set your timezone, refresh interval, and other options.
9. The device polls the server every 5 seconds (up to 5 minutes). Once it receives a valid config it fetches the first departures and renders them.
10. The device enters **deep sleep** and wakes on the configured interval (default: **1 minute** in firmware, typically set to **3 minutes** via the web portal) or on a button press.

---

## Button Actions

| Button | GPIO | Wake source | Action |
|--------|------|-------------|--------|
| A | 26 | EXT0 (LOW) | Next station page |
| B | 27 | EXT1 (HIGH) | Previous station page |
| C | 14 | EXT1 (HIGH) | Force OTA check + immediate data refresh |
| D | 15 | EXT1 (HIGH) | Show device access token (QR code + code) |

> Page cycling wraps around all configured stations (hard limit: **6 stations**).  
> BTN_D works fully **offline** — the token is read from NVS and does not require WiFi.

---

## LED Status

| Color | Meaning |
|-------|---------|
| 🔵 Blue | Connecting to WiFi |
| 🟣 Purple | Captive portal active (setup mode) |
| 🟢 Green (flash) | Connected / data fetched OK |
| 🟡 Yellow | Fetching data from server |
| 🩵 Cyan | OTA firmware update in progress |
| 🔴 Red | Error (WiFi failed, API error, etc.) |

The LED is off during deep sleep to conserve battery.

---

## Device Token Auth

The access token system lets the web portal verify that the person configuring a device physically has it in their hands.

### How it works

1. Every device generates a persistent **8-character hex token** stored in NVS (e.g. `a3f9b21c`).
2. The token is displayed on screen as **`A3F9-B21C`** (formatted with a hyphen for readability) alongside a QR code encoding `transit.megaluke.de/device/<uuid>`.
3. The token screen is shown in two situations:
   - The user presses **BTN_D** (GPIO 15) at any time.
   - The server responds to a heartbeat request with `showToken: true` (triggered from the web portal's device management page).
4. To authenticate, visit **`transit.megaluke.de/device/<uuid>`** and type the 8-character code displayed on the device.
5. Once verified, the browser **caches** the auth token so you won't be asked again on that device.
6. If the device is lost or compromised, an admin can **regenerate** the token from the portal, invalidating all previously cached sessions.

---

## Display Screens

| Screen | When shown |
|--------|------------|
| **Departures** | Normal operation — lists next departures for the current station page |
| **Offline clock** | WiFi unavailable — shows cached departures with last-update time |
| **Setup / waiting for config** | First boot, no station config yet — shows `transit.megaluke.de/setup/<uuid>` |
| **Access code** | BTN_D pressed or server-requested — shows QR code + `XXXX-XXXX` token |
| **OTA progress** | Firmware update downloading — shows version and progress bar |
| **Low battery warning** | Battery ≤ configured warn threshold (default 15%) — shown briefly before departures |
| **Shutdown** | Auto-shutdown after configured inactivity period — shown for 2 s before power cut |

---

## Web Portal

The companion portal at **[transit.megaluke.de](https://transit.megaluke.de)** provides:

- Add and manage devices
- Configure up to **6 stations** per device (hard limit enforced by firmware)
- Set refresh interval, timezone, display type (BW or BWR), and language
- Manage saved WiFi networks pushed to devices over-the-air
- Trigger and monitor OTA firmware updates
- Authenticate devices via the token system

---

## Self-Hosting

The full stack runs via Docker Compose. A build-worker container compiles per-device firmware binaries on demand.

### Quick start

```bash
cp .env.example .env
# Edit .env — set DB_PASSWORD, ADMIN_SECRET, SITE_PASSWORD
docker compose up -d
```

### Services

| Service | Description | Port |
|---------|-------------|------|
| `postgres` | PostgreSQL 16 database | internal |
| `backend` | Node.js API + OTA server | 3000 |
| `build-worker` | PlatformIO build container | internal |

### Environment variables (`.env.example`)

| Variable | Description |
|----------|-------------|
| `DB_PASSWORD` | PostgreSQL password |
| `DATABASE_URL` | Full Postgres connection string |
| `PORT` | Backend HTTP port (default `3000`) |
| `ADMIN_SECRET` | Long random string for admin API access |
| `SITE_PASSWORD` | Password for the web portal login |
| `OTA_DIR` | Directory where compiled firmware binaries are stored |
| `RATE_LIMIT_WINDOW_MS` | Rate-limiter window in ms (default `60000`) |
| `RATE_LIMIT_MAX` | Max requests per window (default `60`) |

For advanced configuration, reverse-proxy setup, and production hardening see **[docs/self-hosting.md](docs/self-hosting.md)**.

---

## Wokwi Simulation

Open `diagram.json` in [Wokwi](https://wokwi.com) or use the **VS Code Wokwi extension**.

Build the firmware first so the binary exists:

```bash
cd firmware
pio run
```

`wokwi.toml` points to `.pio/build/esp32dev/firmware.bin` — Wokwi picks it up automatically.

The **slide potentiometer** in the diagram simulates battery voltage on GPIO 34 (slide up = higher voltage = higher battery percentage).

> Note: the weather feature has been removed from the firmware; the simulation diagram may still contain a DHT sensor placeholder that is no longer used.

---

## Project Structure

```
DepartureMonitor/
├── firmware/                  # ESP32 PlatformIO project
│   ├── platformio.ini         # Build environments (esp32dev, firmware-custom)
│   └── src/
│       ├── main.cpp           # Boot logic, sleep/wakeup, page navigation
│       ├── config.h           # Pin defines, timing constants, server URL
│       ├── display.h          # E-ink screen rendering
│       ├── transit_api.h      # REST client: config, departures, heartbeat
│       ├── wifi_manager.h     # WiFiManager captive portal + NTP sync
│       ├── ota.h              # OTA update check and apply
│       ├── battery.h          # ADC read, percent calculation, charge detect
│       ├── led.h              # RGB LED helpers
│       └── strings.h          # Localisation strings
├── backend/                   # Node.js API server
│   ├── src/                   # Route handlers, DB models, OTA logic
│   └── Dockerfile
├── build-worker/              # PlatformIO build container (compiles firmware per device)
├── frontend/                  # React + Vite + Tailwind web portal
├── scripts/                   # Utility scripts
├── diagram.json               # Wokwi circuit diagram
├── wokwi.toml                 # Wokwi project config
├── docker-compose.yml         # Production stack
├── docker-compose.dev.yml     # Development overrides
└── .env.example               # Environment variable template
```

---

## License

MIT © 2024 Transit Keychain Contributors
