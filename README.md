# Transit Keychain — ESP32 Departure Monitor

A wearable / keychain-sized e-ink display showing real-time public transit departures, powered by an ESP32 and the [transit.megaluke.de](https://transit.megaluke.de) web portal.

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
| 10 | Slide potentiometer | 10 kΩ | Wokwi simulation of battery level |

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
| 26 | BTN_A | Next page / confirm — **active LOW**, internal pull-up, EXT0 wakeup |
| 27 | BTN_B | Previous page — **active HIGH**, external 10k pull-down to GND, EXT1 wakeup |
| 14 | BTN_C | OTA check / settings — **active HIGH**, external 10k pull-down, EXT1 wakeup |
| 12 | BTN_D | Reserved — **active HIGH**, external 10k pull-down; ⚠ strapping pin |
| 25 | PWR_HOLD | Power latch (HIGH = on, LOW = cut power) |
| 34 | BAT_ADC | Battery voltage via 1:2 divider |
| 32 | LED_R | Red LED channel (active HIGH via 220 Ω) |
| 33 | LED_G | Green LED channel (active HIGH via 220 Ω) |
| 13 | LED_B | Blue LED channel (active HIGH via 220 Ω) |

> **Button wiring:**
> - **BTN_A** (GPIO26): connect between GPIO26 and GND. Internal pull-up keeps it HIGH; press pulls LOW.
> - **BTN_B/C/D**: connect between GPIO and VCC (+3.3 V). Add external 10 kΩ pull-down to GND. Press pulls HIGH.  
>   External pull-downs are required for reliable EXT1 deep-sleep wakeup — internal pull-ups are disabled during sleep.

### Battery voltage divider
Connect the LiPo positive terminal through two 10 kΩ resistors in series to GND. The midpoint connects to GPIO34. The ADC reads half the battery voltage; firmware doubles it.

```
VBAT ──── R1 (10k) ──┬── R2 (10k) ──── GND
                     │
                  GPIO34
```

---

## Building & Flashing

### Prerequisites
- [PlatformIO](https://platformio.org/) (VS Code extension or CLI)

### Build
```bash
cd firmware
pio run
```

### Flash (USB)
```bash
cd firmware
pio run --target upload
```

### Monitor serial
```bash
cd firmware
pio device monitor
```

### Build & flash in one step
```bash
cd firmware
pio run -t upload && pio device monitor
```

---

## First Boot Flow

1. **Power on** — device boots, RGB LED shows purple (setup mode)
2. **Captive portal** — WiFi network `departure-XXXX` appears (X = first 4 chars of UUID)
3. **Connect** your phone/laptop to that AP
4. A browser popup (or navigate to `192.168.4.1`) shows the WiFiManager page
5. **Enter your WiFi credentials** and save
6. Device connects to your WiFi; display shows the setup URL:
   ```
   transit.megaluke.de/setup/<uuid>
   ```
7. **Open the URL** on your phone — configure stations, APIs, display settings
8. Device polls every 5 seconds; once configured, **fetches and shows departures**
9. Goes to deep sleep, wakes every N minutes (default: 3) to refresh

---

## Button Actions

| Button | Wake | Action |
|--------|------|--------|
| A | EXT0 | Next station page |
| B | EXT1 | Previous station page |
| C | EXT1 | Force OTA check + immediate refresh |
| D | EXT1 | (reserved) |

---

## LED Status

| Color | Meaning |
|-------|---------|
| Blue | Connecting to WiFi |
| Purple | Captive portal active |
| Green (flash) | Connected / OK |
| Yellow | Fetching data |
| Cyan | OTA update in progress |
| Red | Error |

---

## Wokwi Simulation

Open `diagram.json` in [Wokwi](https://wokwi.com) or use the VS Code Wokwi extension.  
Build the firmware first (`pio run`) — `wokwi.toml` points to `.pio/build/esp32dev/firmware.bin`.

The slide potentiometer simulates battery voltage on GPIO34 (slide up = higher voltage).

---

## Web Portal

The companion web portal at **transit.megaluke.de** is a React/Node.js app:

- Manage devices, stations, WiFi networks, API keys
- Push over-the-air firmware updates
- View departure analytics

See `transit-web/README.md` for self-hosting instructions.

---

## License

MIT © 2024 Transit Keychain Contributors
