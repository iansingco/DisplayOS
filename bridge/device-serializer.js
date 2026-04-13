// device-serializer.js
// Converts DisplayOS widget configs into flat data objects the device can render.
// The device never talks to the network — bridge pulls everything and pushes down.

const SERVER = process.env.SERVER_HTTP || "http://localhost:3333";

// Weather is expensive — cache it per city for 10 minutes
const weatherCache = new Map(); // city → { data, ts }
const WEATHER_TTL = 10 * 60 * 1000;

export async function serializeWidgets(widgets, caps) {
  const out = [];
  for (const w of widgets) {
    if (!caps.includes(w.type)) continue;
    const data = await getWidgetData(w);
    if (data !== null) out.push({ type: w.type, data });
  }
  return out;
}

async function getWidgetData(widget) {
  try {
    switch (widget.type) {
      case "clock":   return clockData(widget.config || {});
      case "stats":   return statsData();
      case "weather": return weatherData(widget.config || {});
      case "text":    return textData(widget.config || {});
      default:        return null;
    }
  } catch {
    return null;
  }
}

// Clock: device ticks locally after receiving this.
// Bridge resends every 60 s to keep drift < 1 min.
function clockData({ format24 = false, showDate = true, showSeconds = true }) {
  const now = new Date();
  const h = format24 ? now.getHours() : (now.getHours() % 12 || 12);
  return {
    h:    String(h).padStart(2, "0"),
    m:    String(now.getMinutes()).padStart(2, "0"),
    s:    String(now.getSeconds()).padStart(2, "0"),
    ampm: format24 ? "" : (now.getHours() >= 12 ? "PM" : "AM"),
    date: showDate
      ? now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
      : "",
    showSeconds,
    // epoch lets device tick without asking us again
    epoch: Math.floor(now.getTime() / 1000),
    format24,
  };
}

async function statsData() {
  const s = await fetch(`${SERVER}/api/stats`).then(r => r.json());
  return { cpu: s.cpu ?? 0, ram: s.ram ?? 0, disk: s.disk ?? -1, uptime: s.uptime ?? 0 };
}

async function weatherData({ city = "New York", units = "fahrenheit" }) {
  const key = `${city}|${units}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.ts < WEATHER_TTL) return cached.data;

  const geo = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
  ).then(r => r.json());
  if (!geo.results?.length) return null;

  const { latitude, longitude, name } = geo.results[0];
  const w = await fetch(
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m` +
    `&temperature_unit=${units}&wind_speed_unit=mph&timezone=auto`
  ).then(r => r.json());

  const data = {
    temp: Math.round(w.current.temperature_2m),
    unit: units === "fahrenheit" ? "F" : "C",
    code: w.current.weathercode,
    wind: Math.round(w.current.windspeed_10m),
    hum:  w.current.relativehumidity_2m,
    city: name,
  };
  weatherCache.set(key, { data, ts: Date.now() });
  return data;
}

function textData({ body = "" }) {
  return { body };
}
