// DisplayOS USB Device Firmware
// Target: ESP32-S2 / ESP32-S3 (native USB CDC) or any ESP32 + CH340 adapter
// Display: SPI TFT via TFT_eSPI (ST7789 / ILI9341 / ILI9488)
//
// ── Library dependencies (install via Arduino Library Manager) ──────────────
//   ArduinoJson   >= 7.x     (Benoit Blanchon)
//   TFT_eSPI      >= 2.5.x   (Bodmer)
//
// ── TFT_eSPI setup ──────────────────────────────────────────────────────────
//   Edit libraries/TFT_eSPI/User_Setup.h for your display + pin wiring.
//   Common choices:
//     #define ST7789_DRIVER       — 240×240 or 320×240
//     #define ILI9341_DRIVER      — 320×240
//     #define TFT_MISO 19 / TFT_MOSI 23 / TFT_SCLK 18 / TFT_CS 5 / TFT_DC 2 / TFT_RST 4
//
// ── Optional GPIO ───────────────────────────────────────────────────────────
//   BUTTON_PIN_1/2: active-low momentary push buttons (internal pull-up)
//   SENSOR_PIN:     DS18B20 / DHT22 / etc. — add your own read logic below
//
// ── Wiring for USB ──────────────────────────────────────────────────────────
//   ESP32-S2/S3: plug directly into client machine USB — it enumerates as CDC.
//   Classic ESP32 + CH340: USB-serial adapter already on the dev board.
//   Both are transparent to the bridge.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>
#include "protocol.h"

// ── Configuration ─────────────────────────────────────────────────────────
#define FW_VERSION     "0.2.0"
#define SCREEN_ID      ""          // Leave blank — server assigns from VID/port
#define BUTTON_PIN_1   0           // Boot button on most devboards; -1 to disable
#define BUTTON_PIN_2   -1
#define BACKLIGHT_PIN  -1          // -1 if no PWM backlight control
#define DEBOUNCE_MS    50

// ── Colours (RGB565) ──────────────────────────────────────────────────────
#define COL_BG         0x0000      // near-black
#define COL_TEXT       0xEF7D      // soft blue-white  #e0e0ff → approx
#define COL_DIM        0x4208      // muted grey
#define COL_ACCENT     0x3D5F      // cool blue   #7faaff → approx
#define COL_GREEN      0x3FE7      // soft green  #7fff7f → approx
#define COL_ORANGE     0xFD00      // warm orange #ffaa00

// ── Globals ───────────────────────────────────────────────────────────────
TFT_eSPI tft;

// Clock state — updated by clocksync, ticked locally by loop()
struct ClockState {
  bool     active      = false;
  uint32_t epochBase   = 0;     // server-provided unix epoch at syncMs
  uint32_t syncMs      = 0;     // millis() at last sync
  bool     format24    = false;
  bool     showSeconds = true;
  char     dateStr[24] = {0};
  uint8_t  lastMin     = 255;   // force first draw
} clk;

// Button debounce
struct ButtonState { bool last = HIGH; uint32_t ts = 0; };
ButtonState btn1, btn2;

// ── Setup ─────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(BAUD_RATE);

  tft.init();
  tft.setRotation(1);           // landscape; change to 0 for portrait
  tft.fillScreen(COL_BG);

  if (BACKLIGHT_PIN >= 0) {
    pinMode(BACKLIGHT_PIN, OUTPUT);
    analogWrite(BACKLIGHT_PIN, 200);
  }
  if (BUTTON_PIN_1 >= 0) pinMode(BUTTON_PIN_1, INPUT_PULLUP);
  if (BUTTON_PIN_2 >= 0) pinMode(BUTTON_PIN_2, INPUT_PULLUP);

  drawBoot();
  sendReady();
}

// ── Main loop ─────────────────────────────────────────────────────────────
void loop() {
  // 1. Read serial commands
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.length()) handleCommand(line);
  }

  // 2. Tick the clock every second (runs independently of bridge)
  if (clk.active) tickClock();

  // 3. Poll buttons
  if (BUTTON_PIN_1 >= 0) pollButton(BUTTON_PIN_1, 1, btn1);
  if (BUTTON_PIN_2 >= 0) pollButton(BUTTON_PIN_2, 2, btn2);

  delay(10);
}

// ── Boot screen ───────────────────────────────────────────────────────────
void drawBoot() {
  tft.fillScreen(COL_BG);
  tft.setTextColor(COL_ACCENT, COL_BG);
  tft.setTextSize(2);
  int16_t x = (tft.width() - tft.textWidth("DisplayOS")) / 2;
  tft.drawString("DisplayOS", x, tft.height() / 2 - 16);
  tft.setTextColor(COL_DIM, COL_BG);
  tft.setTextSize(1);
  String sub = String("fw ") + FW_VERSION;
  x = (tft.width() - tft.textWidth(sub)) / 2;
  tft.drawString(sub, x, tft.height() / 2 + 8);
}

// ── Protocol: outbound ────────────────────────────────────────────────────
void sendReady() {
  JsonDocument doc;
  doc["event"] = "ready";
  doc["fw"]    = FW_VERSION;
  if (strlen(SCREEN_ID)) doc["screenId"] = SCREEN_ID;

  JsonArray caps = doc["caps"].to<JsonArray>();
  caps.add("clock"); caps.add("stats"); caps.add("weather"); caps.add("text");

  JsonObject disp = doc["display"].to<JsonObject>();
  disp["w"] = tft.width();
  disp["h"] = tft.height();

  serializeJson(doc, Serial);
  Serial.println();
}

void sendEvent(JsonDocument& doc) {
  serializeJson(doc, Serial);
  Serial.println();
}

// ── Protocol: inbound ─────────────────────────────────────────────────────
void handleCommand(const String& line) {
  JsonDocument doc;
  if (deserializeJson(doc, line)) return;   // parse error — ignore

  const char* cmd = doc["cmd"] | "";

  if      (!strcmp(cmd, "init"))       sendReady();
  else if (!strcmp(cmd, "render"))     renderWidgets(doc["widgets"].as<JsonArray>());
  else if (!strcmp(cmd, "clocksync"))  doClockSync(doc);
  else if (!strcmp(cmd, "clear"))      tft.fillScreen(COL_BG);
  else if (!strcmp(cmd, "sleep"))      { tft.fillScreen(COL_BG); clk.active = false; }
  else if (!strcmp(cmd, "wake"))       sendReady();
  else if (!strcmp(cmd, "brightness")) setBrightness(doc["value"] | 80);
}

// ── Render dispatcher ─────────────────────────────────────────────────────
void renderWidgets(JsonArray widgets) {
  tft.fillScreen(COL_BG);
  int y = 6;
  for (JsonObject w : widgets) {
    const char* type = w["type"] | "";
    JsonObject   data = w["data"];
    if      (!strcmp(type, "clock"))   y = renderClock(data, y);
    else if (!strcmp(type, "stats"))   y = renderStats(data, y);
    else if (!strcmp(type, "weather")) y = renderWeather(data, y);
    else if (!strcmp(type, "text"))    y = renderText(data, y);
    y += 6; // gap between widgets
  }
}

// ── Widget: clock ─────────────────────────────────────────────────────────
int renderClock(JsonObject& d, int y) {
  // Anchor local clock state so tickClock() keeps it going
  clk.active      = true;
  clk.epochBase   = d["epoch"] | (uint32_t)0;
  clk.syncMs      = millis();
  clk.format24    = d["format24"] | false;
  clk.showSeconds = d["showSeconds"] | true;
  strncpy(clk.dateStr, d["date"] | "", sizeof(clk.dateStr) - 1);

  drawClockFace(y);
  return y + (clk.showSeconds ? 64 : 54);
}

void tickClock() {
  // Recompute current time from anchored epoch + elapsed millis
  uint32_t elapsed = (millis() - clk.syncMs) / 1000;
  uint32_t epoch   = clk.epochBase + elapsed;
  uint32_t secs    = epoch % 60;
  uint32_t mins    = (epoch / 60) % 60;
  uint32_t hours   = (epoch / 3600) % 24;

  if ((uint8_t)mins == clk.lastMin && !clk.showSeconds) return;
  clk.lastMin = mins;

  // Re-draw clock area only — y=6 matches renderClock
  static int clockY = 6;
  tft.fillRect(0, clockY, tft.width(), clk.showSeconds ? 64 : 54, COL_BG);
  drawClockFaceRaw(clockY, hours, mins, secs);
}

void drawClockFace(int y) {
  uint32_t epoch  = clk.epochBase;
  uint32_t secs   = epoch % 60;
  uint32_t mins   = (epoch / 60) % 60;
  uint32_t hours  = (epoch / 3600) % 24;
  drawClockFaceRaw(y, hours, mins, secs);
}

void drawClockFaceRaw(int y, uint32_t hours, uint32_t mins, uint32_t secs) {
  uint32_t h12 = clk.format24 ? hours : (hours % 12 == 0 ? 12 : hours % 12);
  char buf[12];
  snprintf(buf, sizeof(buf), "%02lu:%02lu", h12, mins);

  tft.setTextColor(COL_TEXT, COL_BG);
  tft.setTextSize(4);
  int tw = tft.textWidth(buf);
  tft.drawString(buf, (tft.width() - tw) / 2, y);

  if (!clk.format24) {
    tft.setTextSize(2);
    tft.setTextColor(COL_DIM, COL_BG);
    tft.drawString(hours >= 12 ? "PM" : "AM", (tft.width() + tw) / 2 + 4, y + 8);
  }
  if (clk.showSeconds) {
    char s[4]; snprintf(s, sizeof(s), "%02lu", secs);
    tft.setTextSize(2);
    tft.setTextColor(COL_DIM, COL_BG);
    tft.drawString(s, (tft.width() + tw) / 2 + 4, y + 28);
  }
  if (strlen(clk.dateStr)) {
    tft.setTextSize(1);
    tft.setTextColor(COL_DIM, COL_BG);
    int dw = tft.textWidth(clk.dateStr);
    tft.drawString(clk.dateStr, (tft.width() - dw) / 2, y + 44);
  }
}

// ── Widget: stats ─────────────────────────────────────────────────────────
int renderStats(JsonObject& d, int y) {
  struct Bar { const char* label; int val; uint32_t color; };
  Bar bars[] = {
    { "CPU",  d["cpu"]  | 0,  COL_ACCENT },
    { "RAM",  d["ram"]  | 0,  COL_GREEN  },
    { "DISK", d["disk"] | -1, COL_ORANGE },
  };

  tft.setTextSize(1);
  int barY = y;
  for (auto& b : bars) {
    if (b.val < 0) continue;
    tft.setTextColor(COL_DIM, COL_BG);
    tft.drawString(b.label, 6, barY + 1);

    int bx = 40, bw = tft.width() - 78, bh = 8;
    tft.drawRect(bx, barY, bw, bh, COL_DIM);
    int fill = map(b.val, 0, 100, 0, bw - 2);
    tft.fillRect(bx + 1, barY + 1, fill, bh - 2, b.color);

    char pct[8]; snprintf(pct, sizeof(pct), "%3d%%", b.val);
    tft.setTextColor(b.color, COL_BG);
    tft.drawString(pct, tft.width() - 36, barY + 1);

    barY += 18;
  }

  // Uptime
  uint32_t up = d["uptime"] | 0;
  if (up > 0) {
    char ut[24];
    snprintf(ut, sizeof(ut), "up %luh %02lum", up / 3600, (up % 3600) / 60);
    tft.setTextColor(COL_DIM, COL_BG);
    int uw = tft.textWidth(ut);
    tft.drawString(ut, (tft.width() - uw) / 2, barY + 2);
    barY += 14;
  }
  return barY;
}

// ── Widget: weather ───────────────────────────────────────────────────────
int renderWeather(JsonObject& d, int y) {
  int         temp = d["temp"] | 0;
  const char* unit = d["unit"] | "F";
  const char* city = d["city"] | "";
  int         hum  = d["hum"]  | -1;
  int         wind = d["wind"] | -1;

  char buf[16];
  snprintf(buf, sizeof(buf), "%d*%s", temp, unit); // * approximates degree symbol

  tft.setTextColor(COL_TEXT, COL_BG);
  tft.setTextSize(3);
  int tw = tft.textWidth(buf);
  tft.drawString(buf, (tft.width() - tw) / 2, y);

  int rowY = y + 32;
  tft.setTextSize(1);
  if (strlen(city)) {
    tft.setTextColor(COL_DIM, COL_BG);
    int cw = tft.textWidth(city);
    tft.drawString(city, (tft.width() - cw) / 2, rowY);
    rowY += 14;
  }
  char detail[32] = {0};
  if (wind >= 0 && hum >= 0) snprintf(detail, sizeof(detail), "%dmph  %d%% hum", wind, hum);
  else if (wind >= 0)        snprintf(detail, sizeof(detail), "%dmph", wind);
  if (strlen(detail)) {
    tft.setTextColor(COL_DIM, COL_BG);
    int dw = tft.textWidth(detail);
    tft.drawString(detail, (tft.width() - dw) / 2, rowY);
    rowY += 14;
  }
  return rowY;
}

// ── Widget: text ──────────────────────────────────────────────────────────
int renderText(JsonObject& d, int y) {
  const char* body = d["body"] | "";
  tft.setTextColor(COL_TEXT, COL_BG);
  tft.setTextSize(1);
  tft.drawString(body, 6, y);
  return y + 14;
}

// ── Clock sync (no full redraw) ───────────────────────────────────────────
void doClockSync(JsonDocument& doc) {
  if (!clk.active) return;
  clk.epochBase = doc["epoch"] | clk.epochBase;
  clk.syncMs    = millis();
}

// ── Brightness ────────────────────────────────────────────────────────────
void setBrightness(int pct) {
  if (BACKLIGHT_PIN < 0) return;
  analogWrite(BACKLIGHT_PIN, map(constrain(pct, 0, 100), 0, 100, 0, 255));
}

// ── Button handling ───────────────────────────────────────────────────────
void pollButton(int pin, int id, ButtonState& state) {
  bool cur = digitalRead(pin);
  if (cur == state.last) return;
  if (millis() - state.ts < DEBOUNCE_MS) return;
  state.last = cur; state.ts = millis();

  JsonDocument doc;
  doc["event"]  = "button";
  doc["id"]     = id;
  doc["action"] = (cur == LOW) ? "press" : "release";
  sendEvent(doc);
}

// ── Sensor hook (add your sensor library here) ────────────────────────────
// Example for a DHT22 on SENSOR_PIN — uncomment + add #include <DHT.h>:
//
// DHT dht(SENSOR_PIN, DHT22);
// uint32_t lastSensor = 0;
// void readSensors() {
//   if (millis() - lastSensor < 30000) return;
//   lastSensor = millis();
//   float t = dht.readTemperature();
//   float h = dht.readHumidity();
//   if (!isnan(t)) {
//     JsonDocument doc;
//     doc["event"] = "sensor"; doc["type"] = "temperature"; doc["value"] = t; doc["unit"] = "C";
//     sendEvent(doc);
//   }
//   if (!isnan(h)) {
//     JsonDocument doc;
//     doc["event"] = "sensor"; doc["type"] = "humidity"; doc["value"] = h; doc["unit"] = "%";
//     sendEvent(doc);
//   }
// }
// Call readSensors() from loop().
