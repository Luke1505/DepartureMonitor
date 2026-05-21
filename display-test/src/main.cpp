#include <Arduino.h>
#include <GxEPD2_3C.h>
#include <Fonts/FreeMonoBold9pt7b.h>

constexpr int PIN_CS = 5;
constexpr int PIN_DC = 17;
constexpr int PIN_RST = 16;
constexpr int PIN_BUSY = 4;

// Finaler Treiber laut Test: Modus 3 = GxEPD2_213_Z98c (122x250)
GxEPD2_3C<GxEPD2_213_Z98c, GxEPD2_213_Z98c::HEIGHT> display(
    GxEPD2_213_Z98c(PIN_CS, PIN_DC, PIN_RST, PIN_BUSY));

void clearPanel()
{
  for (uint8_t pass = 0; pass < 2; ++pass)
  {
    display.clearScreen(0xFF);
    delay(500);
  }
}

void drawTestScreen()
{
  display.setFullWindow();
  display.firstPage();
  do
  {
    display.fillScreen(GxEPD_WHITE);
    const int w = display.width();
    const int h = display.height();
    const int top = 24;
    const int barGap = 8;
    const int barW = (w - 3 * barGap) / 2;
    const int barH = h - top - 24;

    display.setTextColor(GxEPD_BLACK);
    display.setFont(&FreeMonoBold9pt7b);

    display.setCursor(8, 24);
    display.println("3-Color Test (BWR)");

    // Schwarzer Testblock
    display.fillRect(barGap, top + 6, barW, barH, GxEPD_BLACK);

    // Roter Testblock
    display.fillRect(2 * barGap + barW, top + 6, barW, barH, GxEPD_RED);

    display.setTextColor(GxEPD_WHITE);
    display.setCursor(barGap + 10, top + 34);
    display.println("BLACK");

    // Auf Rot ist schwarze Schrift meist am besten lesbar.
    display.setTextColor(GxEPD_BLACK);
    display.setCursor(2 * barGap + barW + 16, top + 34);
    display.println("RED");

    display.setTextColor(GxEPD_BLACK);
    display.setCursor(8, h - 4);
    display.println("WHITE=background");

    // Heller Referenzbereich: muss weiss bleiben.
    display.drawRect(w - 52, 2, 48, 18, GxEPD_BLACK);
    display.setCursor(w - 48, 16);
    display.println("WHT");
  } while (display.nextPage());
}

void setup()
{
  Serial.begin(115200);
  delay(200);

  Serial.println("Init E-Ink (GxEPD2_213_Z98c)...");
  display.init(115200, true, 2, false);
  display.setRotation(1);
  clearPanel();
  drawTestScreen();
  Serial.println("Fertig.");
}

void loop()
{
  delay(1000);
}
