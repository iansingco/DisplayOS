// DisplayOS WiFi Firmware
// Connects directly to the DisplayOS server over WiFi — no USB bridge, no PC middleman.
// The server advertises itself as "displayos.local" via mDNS.
//
// ── Library dependencies (Arduino Library Manager) ──────────────────────────
//   ArduinoJson        >= 7.x     (Benoit Blanchon)
//   TFT_eSPI           >= 2.5.x   (Bodmer)
//   WebSockets         >= 2.4.x   (Markus Sattler — search "WebSockets by Links2004")
//
// ── TFT_eSPI ────────────────────────────────────────────────────────────────
//   Edit libraries/TFT_eSPI/User_Setup.h for your display + pins.
//
// ── First-time setup ────────────────────────────────────────────────────────
//   1. Edit WIFI_SSID / WIFI_PASS below
//   2. Set SCREEN_ID to a unique name (shows up in DisplayOS admin)
//   3. Flash — the device will find the server automatically via mDNS
//   4. If mDNS doesn't work on your network, set SERVER_HOST to the PC's LAN IP

#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>
#include <time.h>

// ── User config ───────────────────────────────────────────────────────────────
#define WIFI_SSID      "YourNetwork"
#define WIFI_PASS      "YourPassword"
#define SCREEN_ID      "esp32-display"   // unique name for this device
#define SERVER_HOST    "displayos.local" // or a LAN IP like "192.168.1.100"
#define SERVER_PORT    3333
#define TIMEZONE       "EST5EDT,M3.2.0,M11.1.0"  // POSIX tz string — see bottom of file

// ── Optional GPIO ─────────────────────────────────────────────────────────────
#define BUTTON_PIN_1   0    // boot button on most devboards; -1 to disable
#define BUTTON_PIN_2   -1
#define BACKLIGHT_PIN  -1   // PWM backlight; -1 if wired directly to 3.3V
#define DEBOUNCE_MS    50

// ── Timings ───────────────────────────────────────────────────────────────────
#define STATS_INTERVAL_MS    5000   // how often to poll /api/stats
#define WEATHER_INTERVAL_MS  300000 // how often to fetch weather (5 min)
#define WS_PING_INTERVAL_MS  30000  // WebSocket keepalive

// ── Colours (RGB565) ──────────────────────────────────────────────────────────
#define COL_BG     0x0000
#define COL_TEXT   0xEF7D
#define COL_DIM    0x4208
#define COL_ACCENT 0x3D5F
#define COL_GREEN  0x3FE7
#define COL_ORANGE 0xFD00
#define COL_RED    0xF800

// ── Globals ───────────────────────────────────────────────────────────────────
TFT_eSPI       tft;
WebSocketsClient ws;

// Widget list — updated by WebSocket messages
struct Widget {
  char   type[12];
  char   city[32];   // weather city
  bool   showSeconds;
  bool   format24;
};
static Widget widgets[8];
static int    widgetCount = 0;

// Clock
struct { bool active = false; } clk;

// Stats cache
struct { int cpu = -1, ram = -1, disk = -1; uint32_t uptime = 0; } stats;

// Weather cache
struct { float temp = 0; int   code = 0; float wind = 0; char city[32] = ""; char unit = 'F'; bool valid = false; } wx;

// Timers
uint32_t lastStats   = 0;
uint32_t lastWeather = 0;
uint32_t lastPing    = 0;
uint32_t lastClockDraw = 0;

// Button debounce
struct ButtonState { bool last = HIGH; uint32_t ts = 0; };
ButtonState btn1, btn2;

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  tft.init();
  tft.setRotation(1);
  tft.fillScreen(COL_BG);
  if (BACKLIGHT_PIN >= 0) { pinMode(BACKLIGHT_PIN, OUTPUT); analogWrite(BACKLIGHT_PIN, 200); }
  if (BUTTON_PIN_1 >= 0) pinMode(BUTTON_PIN_1, INPUT_PULLUP);
  if (BUTTON_PIN_2 >= 0) pinMode(BUTTON_PIN_2, INPUT_PULLUP);

  drawStatus("DisplayOS", "Connecting to WiFi...", COL_DIM);
  connectWiFi();

  drawStatus("DisplayOS", "Syncing time...", COL_DIM);
  configTzTime(TIMEZONE, "pool.ntp.org", "time.cloudflare.com");
  // Wait up to 5s for NTP
  for (int i = 0; i < 50 && time(nullptr) < 1000000; i++) delay(100);

  drawStatus("DisplayOS", "Finding server...", COL_DIM);
  if (!MDNS.begin("displayos-device")) {
    Serial.println("[mDNS] init failed — will use host directly");
  }

  ws.onEvent(wsEvent);
  ws.begin(SERVER_HOST, SERVER_PORT, "/?screen=" SCREEN_ID);
  ws.setReconnectInterval(3000);
  ws.enableHeartbeat(WS_PING_INTERVAL_MS, 3000, 2);

  drawStatus("DisplayOS", "Connecting to server...", COL_DIM);
}

// ── Main loop ─────────────────────────────────────────────────────────────────
void loop() {
  ws.loop();

  uint32_t now = millis();

  // Tick clock every second
  if (clk.active && now - lastClockDraw >= 1000) {
    lastClockDraw = now;
    redrawClock();
  }

  // Poll stats
  if (now - lastStats >= STATS_INTERVAL_MS) {
    lastStats = now;
    fetchStats();
    redrawStats();
  }

  // Fetch weather periodically
  if (now - lastWeather >= WEATHER_INTERVAL_MS || (lastWeather == 0 && WiFi.isConnected())) {
    // Only fetch if a weather widget exists
    for (int i = 0; i < widgetCount; i++) {
      if (strcmp(widgets[i].type, "weather") == 0) {
        lastWeather = now;
        fetchWeather(widgets[i].city);
        redrawWeather();
        break;
      }
    }
  }

  // Buttons
  if (BUTTON_PIN_1 >= 0) pollButton(BUTTON_PIN_1, 1, btn1);
  if (BUTTON_PIN_2 >= 0) pollButton(BUTTON_PIN_2, 2, btn2);

  // Reconnect WiFi if dropped
  if (WiFi.status() != WL_CONNECTED) {
    drawStatus("DisplayOS", "WiFi lost — reconnecting", COL_RED);
    connectWiFi();
  }
}

// ── WiFi ──────────────────────────────────────────────────────────────────────
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries++ < 40) delay(500);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] connected: %s\n", WiFi.localIP().toString().c_str());
  } else {
    drawStatus("WiFi failed", "Check SSID/password", COL_RED);
    delay(5000);
    ESP.restart();
  }
}

// ── WebSocket events ──────────────────────────────────────────────────────────
void wsEvent(WStype_t type, uint8_t* payload, size_t len) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("[WS] connected");
      sendDeviceConnected();
      drawStatus("DisplayOS", "Connected ✓", COL_GREEN);
      delay(600);
      break;

    case WStype_DISCONNECTED:
      Serial.println("[WS] disconnected");
      drawStatus("DisplayOS", "Server disconnected", COL_RED);
      break;

    case WStype_TEXT:
      handleServerMessage((char*)payload);
      break;

    default: break;
  }
}

void sendDeviceConnected() {
  JsonDocument doc;
  doc["type"]     = "DEVICE_CONNECTED";
  doc["screenId"] = SCREEN_ID;
  doc["fw"]       = "wifi-1.0.0";

  JsonArray caps = doc["caps"].to<JsonArray>();
  caps.add("clock"); caps.add("stats"); caps.add("weather"); caps.add("text");

  JsonObject disp = doc["display"].to<JsonObject>();
  disp["w"] = tft.width();
  disp["h"] = tft.height();

  String out;
  serializeJson(doc, out);
  ws.sendTXT(out);
}

// ── Handle messages from server ───────────────────────────────────────────────
void handleServerMessage(const char* raw) {
  JsonDocument doc;
  if (deserializeJson(doc, raw)) return;

  const char* type = doc["type"] | "";

  if (strcmp(type, "INIT") == 0 || strcmp(type, "SCREEN_UPDATED") == 0) {
    JsonObject screen = doc["screen"];
    if (screen) applyScreen(screen);
  }
  else if (strcmp(type, "WIDGETS_UPDATED") == 0) {
    applyWidgets(doc["widgets"].as<JsonArray>());
  }
  else if (strcmp(type, "WIDGET_ADDED") == 0) {
    // Re-request full screen state to keep things simple
    ws.sendTXT("{\"type\":\"PING\"}");
  }
}

void applyScreen(JsonObject& screen) {
  applyWidgets(screen["widgets"].as<JsonArray>());
}

void applyWidgets(JsonArray arr) {
  widgetCount = 0;
  clk.active  = false;
  for (JsonObject w : arr) {
    if (widgetCount >= 8) break;
    Widget& slot = widgets[widgetCount++];
    strlcpy(slot.type, w["type"] | "", sizeof(slot.type));
    JsonObject cfg = w["config"];
    if (cfg) {
      strlcpy(slot.city, cfg["city"] | "New York", sizeof(slot.city));
      slot.showSeconds = cfg["showSeconds"] | true;
      slot.format24    = cfg["format24"]    | false;
    }
    if (strcmp(slot.type, "clock") == 0) clk.active = true;
  }

  // Initial weather fetch if needed
  lastWeather = 0;

  fullRedraw();
}

// ── Full screen redraw ────────────────────────────────────────────────────────
void fullRedraw() {
  tft.fillScreen(COL_BG);
  int y = 6;
  for (int i = 0; i < widgetCount; i++) {
    const char* t = widgets[i].type;
    if      (strcmp(t, "clock")   == 0) y = drawClock(y, widgets[i]);
    else if (strcmp(t, "stats")   == 0) y = drawStats(y);
    else if (strcmp(t, "weather") == 0) y = drawWeather(y);
    y += 6;
  }
  lastClockDraw = millis();
}

// ── Clock ─────────────────────────────────────────────────────────────────────
static int clockY      = 6;
static int clockHeight = 58;

int drawClock(int y, Widget& w) {
  clockY = y;
  struct tm tm; getLocalTime(&tm);
  tft.fillRect(0, y, tft.width(), clockHeight, COL_BG);
  drawClockRaw(y, tm, w);
  return y + clockHeight;
}

void redrawClock() {
  for (int i = 0; i < widgetCount; i++) {
    if (strcmp(widgets[i].type, "clock") == 0) {
      struct tm tm; getLocalTime(&tm);
      tft.fillRect(0, clockY, tft.width(), clockHeight, COL_BG);
      drawClockRaw(clockY, tm, widgets[i]);
      return;
    }
  }
}

void drawClockRaw(int y, struct tm& tm, Widget& w) {
  int hour = w.format24 ? tm.tm_hour : (tm.tm_hour % 12 == 0 ? 12 : tm.tm_hour % 12);
  char buf[8];
  snprintf(buf, sizeof(buf), "%02d:%02d", hour, tm.tm_min);

  tft.setTextColor(COL_TEXT, COL_BG);
  tft.setTextSize(4);
  int tw = tft.textWidth(buf);
  tft.drawString(buf, (tft.width() - tw) / 2, y);

  if (!w.format24) {
    tft.setTextSize(2); tft.setTextColor(COL_DIM, COL_BG);
    tft.drawString(tm.tm_hour >= 12 ? "PM" : "AM", (tft.width() + tw) / 2 + 4, y + 8);
  }
  if (w.showSeconds) {
    char s[4]; snprintf(s, sizeof(s), "%02d", tm.tm_sec);
    tft.setTextSize(2); tft.setTextColor(COL_DIM, COL_BG);
    tft.drawString(s, (tft.width() + tw) / 2 + 4, y + 28);
  }
  // Date
  char date[20];
  strftime(date, sizeof(date), "%a %b %e", &tm);
  tft.setTextSize(1); tft.setTextColor(COL_DIM, COL_BG);
  int dw = tft.textWidth(date);
  tft.drawString(date, (tft.width() - dw) / 2, y + 44);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
static int statsY = 0;
static int statsH = 0;

int drawStats(int y) {
  statsY = y;
  struct Bar { const char* label; int val; uint32_t color; };
  Bar bars[] = {
    { "CPU",  stats.cpu,  COL_ACCENT },
    { "RAM",  stats.ram,  COL_GREEN  },
    { "DISK", stats.disk, COL_ORANGE },
  };
  int barY = y;
  tft.setTextSize(1);
  for (auto& b : bars) {
    if (b.val < 0) continue;
    tft.setTextColor(COL_DIM, COL_BG);
    tft.drawString(b.label, 6, barY + 1);
    int bx = 40, bw = tft.width() - 78, bh = 8;
    tft.drawRect(bx, barY, bw, bh, COL_DIM);
    tft.fillRect(bx + 1, barY + 1, map(b.val, 0, 100, 0, bw - 2), bh - 2, b.color);
    char pct[8]; snprintf(pct, sizeof(pct), "%3d%%", b.val);
    tft.setTextColor(b.color, COL_BG);
    tft.drawString(pct, tft.width() - 36, barY + 1);
    barY += 18;
  }
  if (stats.uptime > 0) {
    char ut[24]; snprintf(ut, sizeof(ut), "up %luh %02lum", stats.uptime / 3600, (stats.uptime % 3600) / 60);
    tft.setTextColor(COL_DIM, COL_BG);
    tft.drawString(ut, (tft.width() - tft.textWidth(ut)) / 2, barY + 2);
    barY += 14;
  }
  statsH = barY - y;
  return barY;
}

void redrawStats() {
  for (int i = 0; i < widgetCount; i++) {
    if (strcmp(widgets[i].type, "stats") == 0) {
      tft.fillRect(0, statsY, tft.width(), statsH + 20, COL_BG);
      drawStats(statsY);
      return;
    }
  }
}

// ── Weather ───────────────────────────────────────────────────────────────────
static int weatherY = 0;
static int weatherH = 60;

int drawWeather(int y) {
  weatherY = y;
  if (!wx.valid) {
    tft.setTextSize(1); tft.setTextColor(COL_DIM, COL_BG);
    tft.drawString("Fetching weather...", 6, y);
    return y + 14;
  }
  char buf[16]; snprintf(buf, sizeof(buf), "%.0f*%c", wx.temp, wx.unit);
  tft.setTextColor(COL_TEXT, COL_BG); tft.setTextSize(3);
  int tw = tft.textWidth(buf);
  tft.drawString(buf, (tft.width() - tw) / 2, y);
  tft.setTextSize(1); tft.setTextColor(COL_DIM, COL_BG);
  tft.drawString(wx.city, (tft.width() - tft.textWidth(wx.city)) / 2, y + 32);
  char wind[16]; snprintf(wind, sizeof(wind), "%.0f mph", wx.wind);
  tft.drawString(wind, (tft.width() - tft.textWidth(wind)) / 2, y + 46);
  return y + weatherH;
}

void redrawWeather() {
  for (int i = 0; i < widgetCount; i++) {
    if (strcmp(widgets[i].type, "weather") == 0) {
      tft.fillRect(0, weatherY, tft.width(), weatherH + 6, COL_BG);
      drawWeather(weatherY);
      return;
    }
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
void fetchStats() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin("http://" SERVER_HOST ":" + String(SERVER_PORT) + "/api/stats");
  http.setTimeout(3000);
  if (http.GET() == 200) {
    JsonDocument doc;
    if (!deserializeJson(doc, http.getString())) {
      stats.cpu    = doc["cpu"]    | -1;
      stats.ram    = doc["ram"]    | -1;
      stats.disk   = doc["disk"]   | -1;
      stats.uptime = doc["uptime"] | 0;
    }
  }
  http.end();
}

void fetchWeather(const char* city) {
  if (WiFi.status() != WL_CONNECTED || !city || !strlen(city)) return;

  HTTPClient http;
  // Step 1: geocode
  String geoUrl = "https://geocoding-api.open-meteo.com/v1/search?name=";
  geoUrl += urlEncode(city);
  geoUrl += "&count=1";
  http.begin(geoUrl);
  http.setTimeout(5000);
  float lat = 0, lon = 0;
  if (http.GET() == 200) {
    JsonDocument doc;
    if (!deserializeJson(doc, http.getString())) {
      JsonArray res = doc["results"];
      if (res.size() > 0) {
        lat = res[0]["latitude"]  | 0.0f;
        lon = res[0]["longitude"] | 0.0f;
        strlcpy(wx.city, res[0]["name"] | city, sizeof(wx.city));
      }
    }
  }
  http.end();
  if (lat == 0 && lon == 0) return;

  // Step 2: weather
  String wxUrl = "https://api.open-meteo.com/v1/forecast?latitude=" + String(lat, 4)
    + "&longitude=" + String(lon, 4)
    + "&current=temperature_2m,weathercode,windspeed_10m"
    + "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto";
  http.begin(wxUrl);
  http.setTimeout(5000);
  if (http.GET() == 200) {
    JsonDocument doc;
    if (!deserializeJson(doc, http.getString())) {
      JsonObject cur = doc["current"];
      wx.temp  = cur["temperature_2m"]  | 0.0f;
      wx.wind  = cur["windspeed_10m"]   | 0.0f;
      wx.code  = cur["weathercode"]     | 0;
      wx.unit  = 'F';
      wx.valid = true;
    }
  }
  http.end();
}

String urlEncode(const char* str) {
  String out;
  for (; *str; str++) {
    if (isAlphaNumeric(*str) || *str == '-' || *str == '_') out += *str;
    else { char hex[4]; snprintf(hex, sizeof(hex), "%%%02X", (uint8_t)*str); out += hex; }
  }
  return out;
}

// ── Status screen ─────────────────────────────────────────────────────────────
void drawStatus(const char* title, const char* sub, uint32_t color) {
  tft.fillScreen(COL_BG);
  tft.setTextColor(COL_ACCENT, COL_BG); tft.setTextSize(2);
  int tw = tft.textWidth(title);
  tft.drawString(title, (tft.width() - tw) / 2, tft.height() / 2 - 18);
  tft.setTextColor(color, COL_BG); tft.setTextSize(1);
  int sw = tft.textWidth(sub);
  tft.drawString(sub, (tft.width() - sw) / 2, tft.height() / 2 + 6);
}

// ── Buttons ───────────────────────────────────────────────────────────────────
void pollButton(int pin, int id, ButtonState& state) {
  bool cur = digitalRead(pin);
  if (cur == state.last || millis() - state.ts < DEBOUNCE_MS) return;
  state.last = cur; state.ts = millis();
  if (cur == LOW) {
    // Send button event to server via WebSocket
    JsonDocument doc;
    doc["type"]     = "DEVICE_EVENT";
    doc["screenId"] = SCREEN_ID;
    doc["event"]    = "button";
    doc["id"]       = id;
    doc["action"]   = "press";
    String out; serializeJson(doc, out);
    ws.sendTXT(out);
  }
}

// ── Common POSIX timezone strings ─────────────────────────────────────────────
// EST/EDT:  "EST5EDT,M3.2.0,M11.1.0"
// CST/CDT:  "CST6CDT,M3.2.0,M11.1.0"
// MST/MDT:  "MST7MDT,M3.2.0,M11.1.0"
// PST/PDT:  "PST8PDT,M3.2.0,M11.1.0"
// UTC:      "UTC0"
// CET/CEST: "CET-1CEST,M3.5.0,M10.5.0/3"
// JST:      "JST-9"
