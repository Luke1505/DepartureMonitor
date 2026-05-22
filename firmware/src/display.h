#pragma once
#include <Arduino.h>
#include <SPI.h>
#include <GxEPD2_3C.h>
#include <Fonts/FreeSansBold9pt7b.h>
#include <Fonts/FreeSans9pt7b.h>
#include <qrcode.h>
#include "config.h"
#include "transit_api.h"
#include "strings.h"

// ── Global display instance ───────────────────────────────────────────────────
#ifdef DISPLAY_BW
#include <GxEPD2_BW.h>
GxEPD2_BW<GxEPD2_213_BN, GxEPD2_213_BN::HEIGHT> display(
    GxEPD2_213_BN(EINK_CS, EINK_DC, EINK_RST, EINK_BUSY));
// BW-only: red color maps to black
#define GxEPD_RED GxEPD_BLACK
#else
// Default: BWR 3-color
GxEPD2_3C<GxEPD2_213_Z98c, GxEPD2_213_Z98c::HEIGHT> display(
    GxEPD2_213_Z98c(EINK_CS, EINK_DC, EINK_RST, EINK_BUSY));
#endif

// ── Layout constants ──────────────────────────────────────────────────────────
static const int DW = 250;          // display width  (after rotation=1)
static const int DH = 122;          // display height

// FreeSans(Bold)9pt7b proportional font, ~11px avg advance
// Badge(14) + gap(4) → COL_LINE=20; line(4ch≈52px) + gap(6) → COL_DEST=78
// Station icon(12) + gap(3) → name at x=17

// Header (font baseline at y=13, ascent≈11px up, desc≈3px down → glyphs y=2..16)
static const int HDR_BASE = 13;     // text baseline
static const int HDR_SICON_X = 2;   // station icon x
static const int HDR_NAME_X  = 17;  // station name x (after 12px icon + 3px gap)
static const int BAT_Y    = 4;      // battery icon top

// Single divider right after header
static const int DIV1_Y   = 18;

// Departure rows: 4 rows × 20px, starting at y=22
static const int ROW_BASE = 22;
static const int ROW_H    = 20;
static const int ROW_CNT  = 4;

// Departure row horizontal columns
static const int COL_BADGE = 2;     // type badge x (14×14)
static const int COL_LINE  = 20;    // line number x (after 14px icon + 4px gap)
static const int COL_DEST  = 58;    // destination x (tight after line number)
static const int COL_RIGHT = 248;   // right edge for combined time string

// Footer divider at y=105 (rows end at 22+4×20=102, +3px gap)
static const int DIV2_Y   = 105;
static const int FTR_Y    = 119;    // footer text baseline

// ── Transport type icons (14×14 px, black-on-white) ──────────────────────────
// Generated from Lucide SVGs via sharp. drawBitmap renders 1-bits in black.
// 2 bytes per row (14 bits used, 2 bits zero-padded).

static const uint8_t ICON_BUS[] PROGMEM = {
  0x00, 0x00,
  0x00, 0x00,
  0x00, 0x00,
  0x7F, 0xF0,
  0x48, 0x90,
  0x48, 0x88,
  0xFF, 0xF8,
  0xFF, 0xF8,
  0x40, 0x08,
  0x58, 0xE8,
  0x7F, 0xB8,
  0x18, 0xE0,
  0x00, 0x00,
  0x00, 0x00
};

static const uint8_t ICON_TRAIN[] PROGMEM = {
  0x00, 0x00,
  0x0F, 0xC0,
  0x18, 0x60,
  0x38, 0x70,
  0x28, 0x50,
  0x24, 0x90,
  0x27, 0x90,
  0x20, 0x10,
  0x2C, 0xD0,
  0x20, 0x10,
  0x1C, 0xE0,
  0x0F, 0xC0,
  0x10, 0x20,
  0x00, 0x00
};

static const uint8_t ICON_TRAM[] PROGMEM = {
  0x00, 0x00,
  0x1F, 0xE0,
  0x23, 0x10,
  0x23, 0x10,
  0x23, 0x10,
  0x23, 0x10,
  0x3F, 0xF0,
  0x20, 0x10,
  0x28, 0x50,
  0x20, 0x10,
  0x38, 0x70,
  0x1F, 0xE0,
  0x10, 0x20,
  0x00, 0x00
};

// ── Station icons (12×12 px, black-on-white) ──────────────────────────────────
// Used in header to show station type (house, briefcase, star, etc.)

static const uint8_t SICON_HOUSE[] PROGMEM = {
  0x00, 0x00,
  0x06, 0x00,
  0x19, 0x80,
  0x30, 0xC0,
  0x40, 0x20,
  0x40, 0x20,
  0x4F, 0x20,
  0x49, 0x20,
  0x49, 0x20,
  0x49, 0x20,
  0x69, 0x60,
  0x1F, 0x80
};

static const uint8_t SICON_BRIEFCASE[] PROGMEM = {
  0x00, 0x00,
  0x0F, 0x00,
  0x09, 0x00,
  0x7F, 0xE0,
  0x59, 0xA0,
  0xD9, 0xB0,
  0xD9, 0xB0,
  0xD9, 0xB0,
  0xD9, 0xB0,
  0x59, 0xA0,
  0x7F, 0xE0,
  0x00, 0x00
};

static const uint8_t SICON_STAR[] PROGMEM = {
  0x00, 0x00,
  0x06, 0x00,
  0x06, 0x00,
  0x09, 0x00,
  0x79, 0xE0,
  0x60, 0x60,
  0x30, 0xC0,
  0x10, 0x80,
  0x10, 0x80,
  0x1F, 0x80,
  0x30, 0xC0,
  0x00, 0x00
};

static const uint8_t SICON_CART[] PROGMEM = {
  0x00, 0x00,
  0x60, 0x00,
  0x20, 0x00,
  0x3F, 0xE0,
  0x20, 0x20,
  0x20, 0x20,
  0x10, 0x20,
  0x10, 0x60,
  0x0F, 0x80,
  0x00, 0x00,
  0x18, 0x40,
  0x00, 0x00
};

static const uint8_t SICON_DUMBBELL[] PROGMEM = {
  0x00, 0x00,
  0x7E, 0x00,
  0x4A, 0x00,
  0x46, 0x00,
  0x6C, 0x00,
  0x5C, 0xE0,
  0x73, 0xA0,
  0x03, 0x60,
  0x06, 0x20,
  0x05, 0x20,
  0x07, 0xE0,
  0x00, 0x00
};

static const uint8_t SICON_UTENSILS[] PROGMEM = {
  0x00, 0x00,
  0x54, 0xE0,
  0x54, 0xA0,
  0x54, 0xA0,
  0x55, 0xA0,
  0x7D, 0xA0,
  0x10, 0xA0,
  0x10, 0xE0,
  0x10, 0x20,
  0x10, 0x20,
  0x10, 0x20,
  0x00, 0x00
};

static const uint8_t SICON_GRADUATION[] PROGMEM = {
  0x00, 0x00,
  0x00, 0x00,
  0x06, 0x00,
  0x19, 0x80,
  0x60, 0x60,
  0x60, 0x70,
  0x39, 0xF0,
  0x36, 0xF0,
  0x10, 0x80,
  0x0F, 0x00,
  0x00, 0x00,
  0x00, 0x00
};

static const uint8_t SICON_CROSS[] PROGMEM = {
  0x00, 0x00,
  0x0F, 0x00,
  0x09, 0x00,
  0x09, 0x00,
  0x79, 0xE0,
  0x40, 0x20,
  0x40, 0x20,
  0x79, 0xE0,
  0x09, 0x00,
  0x09, 0x00,
  0x0F, 0x00,
  0x00, 0x00
};

// Draw a 14×14 transport icon badge (black on white, no box)
static void _drawTypeBadge(int x, int y, char type) {
    const uint8_t* icon;
    switch (type) {
        case 'U': icon = ICON_TRAM;  break;
        case 'T': icon = ICON_TRAM;  break;
        case 'S': icon = ICON_TRAIN; break;
        case 'R': icon = ICON_TRAIN; break;
        default:  icon = ICON_BUS;   break;
    }
    display.drawBitmap(x, y, icon, 14, 14, GxEPD_BLACK);
}

// Draw a 12×12 station icon by key string
static void _drawStationIcon(int x, int y, const char* key) {
    const uint8_t* icon = SICON_HOUSE; // default
    if      (strcmp(key, "briefcase")    == 0) icon = SICON_BRIEFCASE;
    else if (strcmp(key, "star")         == 0) icon = SICON_STAR;
    else if (strcmp(key, "shopping-cart")== 0) icon = SICON_CART;
    else if (strcmp(key, "dumbbell")     == 0) icon = SICON_DUMBBELL;
    else if (strcmp(key, "utensils")     == 0) icon = SICON_UTENSILS;
    else if (strcmp(key, "graduation-cap")== 0) icon = SICON_GRADUATION;
    else if (strcmp(key, "cross")        == 0) icon = SICON_CROSS;
    display.drawBitmap(x, y, icon, 12, 12, GxEPD_RED);
}

// Draw battery icon (18×9 px) at (x, y)
static void _drawBattery(int x, int y, uint8_t pct, bool charging) {
    // Outer rectangle
    display.drawRect(x, y, 16, 9, GxEPD_BLACK);
    // Positive nub
    display.fillRect(x + 16, y + 3, 2, 3, GxEPD_BLACK);
    // Fill level
    int fill = (int)(14.0f * pct / 100.0f);
    if (fill > 0) {
        uint16_t col = (pct <= 15) ? GxEPD_RED : GxEPD_BLACK;
        display.fillRect(x + 1, y + 1, fill, 7, col);
    }
    if (charging) {
        // Small lightning bolt: just a diagonal line
        display.drawLine(x + 5, y + 1, x + 8, y + 4, GxEPD_WHITE);
        display.drawLine(x + 8, y + 4, x + 5, y + 7, GxEPD_WHITE);
    }
}

// Convert UTF-8 string to ASCII for GFX font rendering (ASCII-only, 0x20–0x7E).
// German umlauts are transliterated (ö→oe, ä→ae, ü→ue, ß→ss, etc.).
static String _toLatin1(const char* src) {
    String out;
    out.reserve(strlen(src) + 4);
    size_t i = 0;
    while (src[i]) {
        uint8_t c = (uint8_t)src[i];
        if (c < 0x80) {
            out += (char)c;
            i++;
        } else if (c == 0xC3 && src[i + 1]) {
            uint8_t n = (uint8_t)src[i + 1];
            i += 2;
            switch (n) {
                case 0x84: out += "Ae"; break;  // Ä
                case 0x96: out += "Oe"; break;  // Ö
                case 0x9C: out += "Ue"; break;  // Ü
                case 0x9F: out += "ss"; break;  // ß
                case 0xA4: out += "ae"; break;  // ä
                case 0xB6: out += "oe"; break;  // ö
                case 0xBC: out += "ue"; break;  // ü
                default:   out += '?'; break;
            }
        } else if (c >= 0xF0) { out += '?'; i += 4; }
        else if (c >= 0xE0)   { out += '?'; i += 3; }
        else                  { out += '?'; i += 2; }
    }
    return out;
}

// Truncate (after UTF-8→Latin-1 conversion) to maxChars
static String _trunc(const char* s, int maxChars) {
    String str = _toLatin1(s);
    if ((int)str.length() <= maxChars) return str;
    return str.substring(0, maxChars);
}

// Right-align text ending at x=rightX, baseline y
static void _printRight(int rightX, int y, const String& text) {
    int16_t x1, y1; uint16_t w, h;
    display.getTextBounds(text.c_str(), 0, y, &x1, &y1, &w, &h);
    // rightX is the desired right edge; account for x1 (left bearing offset)
    display.setCursor(rightX - (int)w - x1, y);
    display.print(text);
}

// WMO weather code → ASCII icon (fits 3-colour display)
static const char* _wmoIcon(int code, bool isDay) {
    if (code == 0)             return isDay ? "SUN" : "CLR";
    if (code <= 3)             return isDay ? "SUN" : "CLR";
    if (code <= 9)             return "HZY";
    if (code <= 19)            return "FOG";
    if (code <= 29)            return "DRZ";
    if (code <= 39)            return "FOG";
    if (code <= 49)            return "FOG";
    if (code <= 59)            return "DRZ";
    if (code <= 69)            return "RAN";
    if (code <= 79)            return "SNW";
    if (code <= 84)            return "RAN";
    if (code <= 86)            return "SNW";
    if (code <= 94)            return "THN";
    return "THN";
}

// ── Display init ──────────────────────────────────────────────────────────────

inline void displayInit() {
    display.init(115200, true, 2, false);
    display.setRotation(1);
}

// ── Full-screen helper (runs the page loop once) ──────────────────────────────

#define DISPLAY_DRAW_BEGIN(fullRefresh)                          \
    if (fullRefresh) display.setFullWindow();                    \
    else display.setPartialWindow(0, 0, DW, DH);                \
    display.firstPage();                                         \
    do {                                                         \
        display.fillScreen(GxEPD_WHITE);

#define DISPLAY_DRAW_END()                                       \
    } while (display.nextPage());

// ── Loading / boot splash ─────────────────────────────────────────────────────

inline void displayShowLoading(const char* message = "Loading...") {
    DISPLAY_DRAW_BEGIN(false)
        display.setFont(&FreeSansBold9pt7b);
        display.setTextColor(GxEPD_BLACK);
        display.setCursor(4, 20);
        display.print("Transit Keychain");
        display.setCursor(4, 40);
        display.print(message);
        display.drawRect(4, 50, DW - 8, 8, GxEPD_BLACK);
    DISPLAY_DRAW_END()
}

// ── Setup / QR screen ────────────────────────────────────────────────────────
// Shows "Scan to configure" + the setup URL (QR rendering is done in browser)

inline void displayShowSetup(const char* uuid) {
    // QR encodes a WiFi join string for the device's captive portal AP
    char apName[20];
    snprintf(apName, sizeof(apName), "departure-%.4s", uuid);  // matches wifiOpenCaptivePortal

    char wifiQr[60];
    snprintf(wifiQr, sizeof(wifiQr), "WIFI:T:nopass;S:%s;;", apName);

    QRCode qrcode;
    uint8_t qrBuf[qrcode_getBufferSize(5)];
    qrcode_initText(&qrcode, qrBuf, 5, ECC_LOW, wifiQr);

    const int MOD  = 2;
    const int qrPx = qrcode.size * MOD;
    const int qrX  = DW - qrPx - 3;
    const int qrY  = (DH - qrPx) / 2;

    DISPLAY_DRAW_BEGIN(true)
        display.fillRect(qrX - 2, qrY - 2, qrPx + 4, qrPx + 4, GxEPD_WHITE);
        for (int y = 0; y < qrcode.size; y++) {
            for (int x = 0; x < qrcode.size; x++) {
                if (qrcode_getModule(&qrcode, x, y)) {
                    display.fillRect(qrX + x * MOD, qrY + y * MOD, MOD, MOD, GxEPD_BLACK);
                }
            }
        }

        const int textW = qrX - 6;

        display.setFont(&FreeSansBold9pt7b);
        display.setTextColor(GxEPD_RED);
        display.setCursor(3, 13);
        display.print(STRINGS.setup);

        display.drawFastHLine(0, 15, textW, GxEPD_BLACK);

        display.setTextColor(GxEPD_BLACK);
        display.setFont(&FreeSansBold9pt7b);
        display.setCursor(3, 30);
        display.print(STRINGS.setupQrWifi);
        display.setCursor(3, 45);
        display.print(STRINGS.setupConnect);

        display.drawFastHLine(0, 52, textW, GxEPD_BLACK);

        display.setCursor(3, 67);
        display.print(STRINGS.setupThen);

        // Show SERVER_BASE_URL stripped of scheme
        const char* srv = SERVER_BASE_URL;
        if (strncmp(srv, "https://", 8) == 0) srv += 8;
        else if (strncmp(srv, "http://", 7) == 0) srv += 7;
        char l1[14] = {}, l2[14] = {};
        strncpy(l1, srv, 13);
        if (strlen(srv) > 13) strncpy(l2, srv + 13, 13);
        display.setCursor(3, 82);
        display.print(l1);
        if (l2[0]) { display.setCursor(3, 97); display.print(l2); }
    DISPLAY_DRAW_END()
}

// ── "Waiting for config" screen ───────────────────────────────────────────────

inline void displayShowWaitingForConfig(const char* uuid) {
    char url[120];
    snprintf(url, sizeof(url), "%s/setup/%s", SERVER_BASE_URL, uuid);

    QRCode qrcode;
    uint8_t qrBuf[qrcode_getBufferSize(5)];
    qrcode_initText(&qrcode, qrBuf, 5, ECC_LOW, url);

    const int MOD  = 2;
    const int qrPx = qrcode.size * MOD;
    const int qrX  = DW - qrPx - 3;
    const int qrY  = (DH - qrPx) / 2;

    DISPLAY_DRAW_BEGIN(true)
        display.fillRect(qrX - 2, qrY - 2, qrPx + 4, qrPx + 4, GxEPD_WHITE);
        for (int y = 0; y < qrcode.size; y++) {
            for (int x = 0; x < qrcode.size; x++) {
                if (qrcode_getModule(&qrcode, x, y)) {
                    display.fillRect(qrX + x * MOD, qrY + y * MOD, MOD, MOD, GxEPD_BLACK);
                }
            }
        }

        const int textW = qrX - 6;

        display.setFont(&FreeSansBold9pt7b);
        display.setTextColor(GxEPD_RED);
        display.setCursor(3, 13);
        display.print(STRINGS.configTitle);

        display.drawFastHLine(0, 18, textW, GxEPD_RED);

        display.setFont(&FreeSansBold9pt7b);
        display.setCursor(3, 30);
        display.print(STRINGS.configNoStops);
        display.setCursor(3, 45);
        display.print("Haltestellen.");

        display.setCursor(3, 62);
        display.print(STRINGS.configScanQr);
        display.setCursor(3, 77);
        display.print(STRINGS.configSetup);
    DISPLAY_DRAW_END()
}

// ── No WiFi signal ────────────────────────────────────────────────────────────

inline void displayShowNoSignal(const char* lastTime = nullptr) {
    DISPLAY_DRAW_BEGIN(false)
        display.setFont(&FreeSansBold9pt7b);
        display.setTextColor(GxEPD_RED);
        display.setCursor(4, 20);
        display.print("No WiFi");

        display.setFont(&FreeSansBold9pt7b);
        display.setCursor(4, 38);
        display.print(STRINGS.offlineCached);

        if (lastTime) {
            display.setCursor(4, 56);
            display.print(STRINGS.offlineLastUpdate);
            display.print(lastTime);
        }
        display.drawFastHLine(0, DIV2_Y, DW, GxEPD_BLACK);
        display.setCursor(4, FTR_Y);
        display.print(STRINGS.offlineTitle);
    DISPLAY_DRAW_END()
}

// ── Offline clock (deep-sleep wakeup without WiFi) ───────────────────────────

inline void displayShowOfflineClock(const char* time24, const char* lastUpdate) {
    DISPLAY_DRAW_BEGIN(false)
        // Big time in center — red for visual impact on offline screen
        display.setFont(&FreeSansBold9pt7b);
        display.setTextColor(GxEPD_RED);
        int16_t x1, y1; uint16_t w, h;
        display.getTextBounds(time24, 0, 0, &x1, &y1, &w, &h);
        display.setCursor((DW - w) / 2, DH / 2 + 6);
        display.print(time24);

        display.setFont(&FreeSansBold9pt7b);
        display.setCursor(4, DH - 7);
        display.print("offline  ");
        display.print(STRINGS.updPrefix);
        display.print(lastUpdate);
    DISPLAY_DRAW_END()
}

// ── Low-battery warning ───────────────────────────────────────────────────────

inline void displayShowLowBattery(uint8_t pct) {
    DISPLAY_DRAW_BEGIN(true)
        display.setFont(&FreeSansBold9pt7b);
        display.setTextColor(GxEPD_RED);
        display.setCursor(4, 20);
        display.print(STRINGS.lowBatTitle);

        display.setFont(&FreeSansBold9pt7b);
        display.setTextColor(GxEPD_BLACK);
        display.setCursor(4, 40);
        char buf[24];
        snprintf(buf, sizeof(buf), "Level: %d%%", pct);
        display.print(buf);
        display.setCursor(4, 58);
        display.print(STRINGS.lowBatCharge);
    DISPLAY_DRAW_END()
}

// ── Shutdown screen ───────────────────────────────────────────────────────────

inline void displayShowShutdown() {
    DISPLAY_DRAW_BEGIN(true)
        // Crescent moon: outer filled circle minus offset circle carved white
        display.fillCircle(125, 52, 22, GxEPD_BLACK);
        display.fillCircle(136, 44, 17, GxEPD_WHITE);

        // Title centered, red
        display.setFont(&FreeSansBold9pt7b);
        display.setTextColor(GxEPD_RED);
        const char* title = STRINGS.shutdownTitle;
        int16_t tx, ty; uint16_t tw, th;
        display.getTextBounds(title, 0, 0, &tx, &ty, &tw, &th);
        display.setCursor((DW - (int)tw) / 2, 95);
        display.print(title);

        // Divider
        display.drawFastHLine(20, 103, DW - 40, GxEPD_BLACK);

        // Wake hint centered, black
        display.setFont(&FreeSans9pt7b);
        display.setTextColor(GxEPD_BLACK);
        const char* hint = STRINGS.shutdownWake;
        display.getTextBounds(hint, 0, 0, &tx, &ty, &tw, &th);
        display.setCursor((DW - (int)tw) / 2, 118);
        display.print(hint);
    DISPLAY_DRAW_END()
}

// ── OTA progress ─────────────────────────────────────────────────────────────

inline void displayShowOtaProgress(const char* version, size_t done, size_t total) {
    DISPLAY_DRAW_BEGIN(true)
        display.setFont(&FreeSansBold9pt7b);
        display.setTextColor(GxEPD_RED);
        display.setCursor(4, 18);
        display.print(STRINGS.otaTitle);

        display.setFont(&FreeSansBold9pt7b);
        display.setTextColor(GxEPD_BLACK);
        display.setCursor(4, 34);
        display.print(version);

        // Progress bar
        int barW = DW - 8;
        display.drawRect(4, 44, barW, 10, GxEPD_BLACK);
        if (total > 0) {
            int fill = (int)((float)done / (float)total * (barW - 2));
            display.fillRect(5, 45, fill, 8, GxEPD_RED);
        }

        char pct[12];
        snprintf(pct, sizeof(pct), "%d%%", total > 0 ? (int)(done * 100 / total) : 0);
        display.setCursor(4, 66);
        display.print(pct);
    DISPLAY_DRAW_END()
}

// ── Access code screen ────────────────────────────────────────────────────────
// Shows the device access token as a scannable QR + typed code "XXXX-XXXX"

inline void displayShowAccessCode(const char* uuid, const char* token) {
    // Format as XXXX-XXXX
    char formatted[10] = {};
    if (strlen(token) == 8) {
        snprintf(formatted, sizeof(formatted), "%.4s-%.4s", token, token + 4);
    } else {
        strlcpy(formatted, token, sizeof(formatted));
    }

    // QR encodes the full device URL with token so scanning grants direct access
    char url[140];
    snprintf(url, sizeof(url), "%s/device/%s?token=%s", SERVER_BASE_URL, uuid, token);

    QRCode qrcode;
    uint8_t qrBuf[qrcode_getBufferSize(5)];
    qrcode_initText(&qrcode, qrBuf, 5, ECC_LOW, url);

    const int MOD  = 2;
    const int qrPx = qrcode.size * MOD;
    const int qrX  = DW - qrPx - 3;
    const int qrY  = (DH - qrPx) / 2;

    DISPLAY_DRAW_BEGIN(true)
        // QR code with white border
        display.fillRect(qrX - 2, qrY - 2, qrPx + 4, qrPx + 4, GxEPD_WHITE);
        for (int qy = 0; qy < qrcode.size; qy++) {
            for (int qx = 0; qx < qrcode.size; qx++) {
                if (qrcode_getModule(&qrcode, qx, qy)) {
                    display.fillRect(qrX + qx * MOD, qrY + qy * MOD, MOD, MOD, GxEPD_BLACK);
                }
            }
        }

        const int textW = qrX - 6;

        // Title in red
        display.setFont(&FreeSansBold9pt7b);
        display.setTextColor(GxEPD_RED);
        display.setCursor(3, 13);
        display.print("ZUGRIFFSCODE");
        display.drawFastHLine(0, 16, textW, GxEPD_BLACK);

        // Big token code centred in text area
        display.setFont(&FreeSansBold9pt7b);
        display.setTextColor(GxEPD_BLACK);
        int16_t tx, ty; uint16_t tw, th;
        display.getTextBounds(formatted, 0, 0, &tx, &ty, &tw, &th);
        display.setCursor((textW - tw) / 2, 52);
        display.print(formatted);

        // Hint below code
        display.setFont(&FreeSans9pt7b);
        display.setCursor(3, 70);
        display.print("Scan oder eintippen");

        // Footer — divider at 100 leaves clear gap to text ascenders at ~104
        display.drawFastHLine(0, 100, DW, GxEPD_BLACK);
        display.setFont(&FreeSans9pt7b);
        display.setCursor(4, FTR_Y - 4);
        display.print("transit.megaluke.de");
    DISPLAY_DRAW_END()
}

// ── Main departures screen ────────────────────────────────────────────────────

inline void displayShowDepartures(const StationDepartures& data,
                                   uint8_t batPct, bool charging,
                                   const char* timeStr,
                                   int pageIdx, int pageTotal,
                                   bool hasOtaUpdate,
                                   bool lastHadRed,
                                   bool& outHadRed) {
    outHadRed = false;

    bool needsRed = hasOtaUpdate || (batPct <= 15);
    for (int i = 0; i < min(data.count, ROW_CNT) && !needsRed; i++) {
        const Departure& dep = data.rows[i];
        needsRed = dep.isCancelled || dep.minsUntil <= 0 || dep.delayMins > 0;
    }
    bool fullRefresh = needsRed || lastHadRed;
    if (fullRefresh) display.setFullWindow();
    else             display.setPartialWindow(0, 0, DW, DH);
    display.firstPage();
    do {
        display.fillScreen(GxEPD_WHITE);

        // ── Header ────────────────────────────────────────────────────────────
        // Station icon (12×12) left-aligned, name beside it
        _drawStationIcon(HDR_SICON_X, HDR_BASE - 11, data.icon[0] ? data.icon : "house");

        display.setFont(&FreeSansBold9pt7b);
        display.setTextColor(GxEPD_BLACK);
        display.setCursor(HDR_NAME_X, HDR_BASE);
        display.print(_trunc(data.stationName, 14));

        // Time right-aligned (prefix OTA if update pending)
        String headerTime = hasOtaUpdate ? String("OTA ") + timeStr : String(timeStr);
        if (hasOtaUpdate) {
            display.setTextColor(GxEPD_RED);
            outHadRed = true;
        }
        _printRight(DW - 24, HDR_BASE, headerTime);
        display.setTextColor(GxEPD_BLACK);

        // Battery icon (far right)
        _drawBattery(DW - 20, BAT_Y, batPct, charging);

        // Single divider below header
        display.drawFastHLine(0, DIV1_Y, DW, GxEPD_BLACK);

        // ── Departure rows ────────────────────────────────────────────────────
        int shown = min(data.count, ROW_CNT);

        // Draw subtle row separators before rendering text (between rows)
        for (int i = 1; i < shown; i++) {
            display.drawFastHLine(0, ROW_BASE + i * ROW_H, DW, GxEPD_BLACK);
        }

        for (int i = 0; i < shown; i++) {
            const Departure& dep = data.rows[i];
            int rowY  = ROW_BASE + i * ROW_H;
            int textY = rowY + ROW_H - 4;

            // Type badge (14×14, vertically centred in row)
            _drawTypeBadge(COL_BADGE, rowY + 3, dep.type);

            // Line number — bold; measure width to place destination right after
            display.setFont(&FreeSansBold9pt7b);
            display.setTextColor(GxEPD_BLACK);
            {
                int16_t x1, y1; uint16_t lw, lh;
                String lineStr = String(_trunc(dep.line, 4));
                display.getTextBounds(lineStr.c_str(), COL_LINE, textY, &x1, &y1, &lw, &lh);
                display.setCursor(COL_LINE, textY);
                display.print(lineStr);

                // Destination — regular, 4px gap after line number
                int destX = COL_LINE + (int)lw + 4;
                display.setFont(&FreeSans9pt7b);
                display.setCursor(destX, textY);
                display.print(_trunc(dep.destination, 16));
            }

            // Combined time string
            String timeLabel;
            bool timeRed = false;
            if (dep.isCancelled) {
                timeLabel = "CNCL";
                timeRed   = true;
                outHadRed = true;
            } else if (dep.minsUntil <= 0) {
                timeLabel = "NOW";
                timeRed   = true;
                outHadRed = true;
            } else if (dep.minsUntil >= 60) {
                char buf[8];
                snprintf(buf, sizeof(buf), "%dh%d", dep.minsUntil / 60, dep.minsUntil % 60);
                timeLabel = String(buf);
            } else {
                timeLabel = String(dep.minsUntil) + "m";
            }
            if (dep.delayMins > 0 && !dep.isCancelled) {
                timeLabel += "+" + String(dep.delayMins);
                timeRed    = true;
                outHadRed  = true;
            }
            display.setTextColor(timeRed ? GxEPD_RED : GxEPD_BLACK);
            _printRight(COL_RIGHT, textY, timeLabel);
            display.setTextColor(GxEPD_BLACK);
        }

        if (shown == 0) {
            display.setFont(&FreeSans9pt7b);
            display.setTextColor(GxEPD_BLACK);
            display.setCursor(4, ROW_BASE + ROW_H);
            display.print(STRINGS.noDepartures);
        }

        // ── Footer ────────────────────────────────────────────────────────────
        display.drawFastHLine(0, DIV2_Y, DW, GxEPD_BLACK);
        display.setFont(&FreeSans9pt7b);
        display.setTextColor(GxEPD_BLACK);

        // Charging indicator left
        if (charging) {
            display.setCursor(2, FTR_Y);
            display.print("+");
        }

        // Page indicator centred (only when multiple stations)
        if (pageTotal > 1) {
            char pageBuf[8];
            snprintf(pageBuf, sizeof(pageBuf), "%d/%d", pageIdx + 1, pageTotal);
            int16_t x1, y1; uint16_t w, h;
            display.getTextBounds(pageBuf, 0, FTR_Y, &x1, &y1, &w, &h);
            // Center accounting for x1 offset (left bearing)
            display.setCursor((DW - (int)w) / 2 - x1, FTR_Y);
            display.print(pageBuf);
        }

        // Battery % right
        char batBuf[8];
        snprintf(batBuf, sizeof(batBuf), "%d%%", batPct);
        _printRight(DW - 2, FTR_Y, String(batBuf));

    } while (display.nextPage());
}

