#pragma once

struct LangStrings {
    const char* setup;
    const char* setupQrWifi;
    const char* setupConnect;
    const char* setupThen;
    const char* configTitle;
    const char* configNoStops;
    const char* configScanQr;
    const char* configSetup;
    const char* offlineTitle;
    const char* offlineCached;
    const char* offlineLastUpdate;
    const char* lowBatTitle;
    const char* lowBatCharge;
    const char* shutdownTitle;
    const char* shutdownWake;
    const char* otaTitle;
    const char* otaVersion;
    const char* noDepartures;
    const char* updPrefix;
};

static const LangStrings LANG_DE = {
    "SETUP",
    "QR = WiFi",
    "verbinden",
    "Dann:",
    "Konfiguration",
    "Noch keine",
    "QR scannen",
    "zum Einrichten.",
    "OFFLINE",
    "Zeige Cache.",
    "Letztes Update: ",
    "Akku leer!",
    "Bitte laden.",
    "Ausschalten...",
    "BTN_A zum Wecken.",
    "Firmware Update...",
    "Version: ",
    "Keine Abfahrten.",
    "upd ",
};

static const LangStrings LANG_EN = {
    "SETUP",
    "QR = WiFi",
    "connect",
    "Then:",
    "Configuration",
    "No stops yet",
    "Scan QR",
    "to configure.",
    "OFFLINE",
    "Showing cache.",
    "Last update: ",
    "Low battery!",
    "Please charge.",
    "Powering off...",
    "Hold BTN_A to wake.",
    "Updating firmware...",
    "Version: ",
    "No departures.",
    "upd ",
};

static const LangStrings LANG_FR = {
    "CONFIG",
    "QR = WiFi",
    "connecter",
    "Puis:",
    "Configuration",
    "Aucun arr\xEAt",
    "Scanner QR",
    "pour configurer.",
    "HORS LIGNE",
    "Cache affich\xE9.",
    "Derni\xE8re m\xE0j: ",
    "Batterie faible!",
    "Veuillez charger.",
    "Extinction...",
    "BTN_A pour r\xE9veiller.",
    "Mise \xE0 jour...",
    "Version: ",
    "Aucun d\xE9part.",
    "m\xE0j ",
};

// Select language at compile time via -DLANG_DE / -DLANG_EN / -DLANG_FR
// Default: German
#if defined(LANG_EN)
  static const LangStrings& STRINGS = LANG_EN;
#elif defined(LANG_FR)
  static const LangStrings& STRINGS = LANG_FR;
#else
  static const LangStrings& STRINGS = LANG_DE;
#endif
