import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getStats } from "./stats.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "config.json");

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    const defaults = {
      screens: {
        main: {
          id: "main", name: "Main Display", layout: "grid",
          background: "#0a0a0f", voiceEnabled: true, wakeWord: "hey display",
          widgets: [
            { id: uuidv4(), type: "clock",   x:0, y:0, w:4, h:2, config:{} },
            { id: uuidv4(), type: "weather", x:4, y:0, w:4, h:2, config:{ city:"New York" } },
            { id: uuidv4(), type: "gif",     x:0, y:2, w:4, h:4, config:{ url:"https://media.giphy.com/media/3o7TKDEhaX4Z4OyaCA/giphy.gif" } },
            { id: uuidv4(), type: "iframe",  x:4, y:2, w:8, h:6, config:{ url:"https://en.wikipedia.org/wiki/Main_Page", label:"Wikipedia" } }
          ]
        }
      },
      server: { port: 3333 }
    };
    writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

function saveConfig(cfg) { writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); }

let config = loadConfig();

// USB device registry: screenId → { caps, display, fw, connectedAt }
const devices = new Map();
// Sensor readings: screenId → { type → { value, unit, ts } }
const sensors = new Map();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/display", express.static(path.join(__dirname, "../client/dist")));
app.use("/admin",   express.static(path.join(__dirname, "../admin/dist")));

// ── REST API ─────────────────────────────────────────────────────────────────
app.get("/api/screens",      (req, res) => res.json(config.screens));
app.get("/api/screens/:id",  (req, res) => { const s = config.screens[req.params.id]; s ? res.json(s) : res.status(404).json({ error:"Not found" }); });
app.put("/api/screens/:id",  (req, res) => { const id=req.params.id; config.screens[id]={...config.screens[id],...req.body,id}; saveConfig(config); broadcast({type:"SCREEN_UPDATED",screenId:id,screen:config.screens[id]}); res.json(config.screens[id]); });
app.delete("/api/screens/:id",(req,res)=> { delete config.screens[req.params.id]; saveConfig(config); broadcast({type:"SCREEN_DELETED",screenId:req.params.id}); res.json({ok:true}); });

app.put("/api/screens/:id/widgets", (req, res) => {
  const s = config.screens[req.params.id];
  if (!s) return res.status(404).json({error:"Not found"});
  s.widgets = req.body.widgets; saveConfig(config);
  broadcast({type:"WIDGETS_UPDATED",screenId:req.params.id,widgets:s.widgets});
  res.json(s);
});
app.post("/api/screens/:id/widgets", (req, res) => {
  const s = config.screens[req.params.id];
  if (!s) return res.status(404).json({error:"Not found"});
  const widget = { id:uuidv4(), ...req.body };
  s.widgets.push(widget); saveConfig(config);
  broadcast({type:"WIDGET_ADDED",screenId:req.params.id,widget});
  res.json(widget);
});
app.put("/api/screens/:sid/widgets/:wid", (req, res) => {
  const s = config.screens[req.params.sid];
  if (!s) return res.status(404).json({error:"Not found"});
  const idx = s.widgets.findIndex(w => w.id === req.params.wid);
  if (idx === -1) return res.status(404).json({error:"Widget not found"});
  s.widgets[idx] = { ...s.widgets[idx], ...req.body, id: req.params.wid };
  saveConfig(config);
  broadcast({type:"WIDGETS_UPDATED",screenId:req.params.sid,widgets:s.widgets});
  res.json(s.widgets[idx]);
});
app.delete("/api/screens/:sid/widgets/:wid", (req, res) => {
  const s = config.screens[req.params.sid];
  if (!s) return res.status(404).json({error:"Not found"});
  s.widgets = s.widgets.filter(w=>w.id!==req.params.wid); saveConfig(config);
  broadcast({type:"WIDGET_REMOVED",screenId:req.params.sid,widgetId:req.params.wid});
  res.json({ok:true});
});

app.get("/api/stats",  async (req, res) => res.json(await getStats()));
app.get("/api/config", (req, res) => res.json(config));
app.put("/api/config", (req, res) => { config={...config,...req.body}; saveConfig(config); broadcast({type:"CONFIG_UPDATED",config}); res.json(config); });
app.post("/api/voice", (req, res) => res.json(handleVoiceCommand(req.body.transcript, req.body.screenId)));

// Device endpoints
app.get("/api/devices", (req, res) => res.json(Object.fromEntries(devices)));
app.get("/api/devices/:id/sensors", (req, res) => {
  const s = sensors.get(req.params.id);
  s ? res.json(s) : res.status(404).json({ error:"No sensors for this device" });
});
// Push a direct command to a device via its bridge
app.post("/api/devices/:id/cmd", (req, res) => {
  broadcast({ type:"DEVICE_CMD", screenId:req.params.id, ...req.body }, "_bridge");
  res.json({ ok:true });
});

// Status endpoint — consumed by launcher status page + external monitoring
app.get("/api/status", async (req, res) => {
  const screenStats = {};
  for (const [screenId] of Object.entries(config.screens)) {
    const connected = [...clients.values()].filter(m => m.screenId === screenId && !m.isBridge).length;
    screenStats[screenId] = { connected };
  }
  res.json({
    uptime:   Math.floor(process.uptime()),
    wsClients: [...clients.values()].filter(m => !m.isBridge).length,
    screens:  screenStats,
    devices:  Object.fromEntries(devices),
  });
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });
const clients = new Map(); // ws → { screenId, clientId, isBridge }

wss.on("connection", (ws, req) => {
  const url      = new URL(req.url, "http://localhost");
  const screenId = url.searchParams.get("screen") || "main";
  const isBridge = screenId === "_bridge";
  const clientId = uuidv4();
  clients.set(ws, { screenId, clientId, isBridge });

  if (!isBridge) {
    console.log(`[WS] +${clientId} → "${screenId}" (${clients.size} connected)`);
    ws.send(JSON.stringify({ type:"INIT", screenId, screen:config.screens[screenId]||null, config }));
  } else {
    console.log(`[WS] bridge connected`);
  }

  ws.on("message", raw => { try { handleClientMessage(ws, JSON.parse(raw), screenId); } catch {} });
  ws.on("close",   ()  => {
    clients.delete(ws);
    if (!isBridge) console.log(`[WS] -${clientId} (${clients.size} remaining)`);
    else           console.log(`[WS] bridge disconnected`);
  });
});

function broadcast(msg, targetScreen=null) {
  const payload = JSON.stringify(msg);
  for (const [ws, meta] of clients) {
    if (ws.readyState !== 1) continue;
    if (targetScreen && meta.screenId !== targetScreen) continue;
    ws.send(payload);
  }
}

// ── Message handling ──────────────────────────────────────────────────────────
function handleClientMessage(ws, msg, screenId) {
  switch (msg.type) {
    case "VOICE_TRANSCRIPT": {
      const result = handleVoiceCommand(msg.transcript, screenId);
      ws.send(JSON.stringify({ type:"VOICE_RESULT", ...result }));
      break;
    }
    case "DEVICE_CONNECTED":
      onDeviceConnected(msg);
      break;
    case "DEVICE_DISCONNECTED":
      onDeviceDisconnected(msg.screenId);
      break;
    case "DEVICE_EVENT":
      handleDeviceEvent(ws, msg);
      break;
    case "DEVICE_SENSOR":
      handleDeviceSensor(msg);
      break;
  }
}

// ── Device management ─────────────────────────────────────────────────────────
function onDeviceConnected({ screenId, caps=[], display={}, fw="?" }) {
  devices.set(screenId, { screenId, caps, display, fw, connectedAt: Date.now() });

  // Auto-create a minimal screen config if this device is new
  if (!config.screens[screenId]) {
    config.screens[screenId] = {
      id: screenId,
      name: `USB Device (${screenId})`,
      layout: "grid",
      background: "#0a0a0f",
      voiceEnabled: false,
      wakeWord: "hey display",
      // Default widgets matched to device capabilities
      widgets: caps.includes("clock") ? [
        { id:uuidv4(), type:"clock", x:0, y:0, w:4, h:2, config:{ showDate:true, showSeconds:true } }
      ] : []
    };
    saveConfig(config);
    console.log(`[Device] Auto-created screen: "${screenId}"`);
  }

  console.log(`[Device] Connected: "${screenId}" caps:[${caps}] display:${JSON.stringify(display)}`);
  broadcast({ type:"DEVICE_UPDATED", devices: Object.fromEntries(devices) });
}

function onDeviceDisconnected(screenId) {
  devices.delete(screenId);
  console.log(`[Device] Disconnected: "${screenId}"`);
  broadcast({ type:"DEVICE_UPDATED", devices: Object.fromEntries(devices) });
}

function handleDeviceEvent(ws, msg) {
  const { screenId, event, id, action } = msg;
  console.log(`[Device] Event from "${screenId}": ${event} id=${id} action=${action}`);

  // Map button presses to voice commands for easy extensibility
  if (event === "button" && action === "press") {
    const cmds = { 1: "clear screen", 2: "add clock" }; // customise per device
    const transcript = cmds[id];
    if (transcript) {
      const result = handleVoiceCommand(transcript, screenId);
      ws.send(JSON.stringify({ type:"VOICE_RESULT", ...result }));
    }
  }

  // Broadcast so admin / other clients can observe device events
  broadcast({ type:"DEVICE_EVENT", ...msg });
}

function handleDeviceSensor(msg) {
  const { screenId, type, value, unit } = msg;
  if (!sensors.has(screenId)) sensors.set(screenId, {});
  sensors.get(screenId)[type] = { value, unit, ts: Date.now() };
  broadcast({ type:"SENSOR_UPDATED", screenId, sensor: type, value, unit });
}

// ── Voice commands ────────────────────────────────────────────────────────────
function handleVoiceCommand(transcript, screenId) {
  const t = (transcript||"").toLowerCase().trim();
  console.log(`[Voice] "${t}" on "${screenId}"`);
  const addMatch = t.match(/add (clock|weather|gif|iframe|image|stats)/);
  if (addMatch) {
    const type = addMatch[1]==="image"?"gif":addMatch[1];
    const widget = { id:uuidv4(), type, x:0, y:0, w:4, h:4, config:{} };
    const s = config.screens[screenId];
    if (s) { s.widgets.push(widget); saveConfig(config); broadcast({type:"WIDGET_ADDED",screenId,widget},screenId); }
    return { action:"WIDGET_ADDED", widget };
  }
  if (t.includes("clear screen")||t.includes("clear display")) {
    const s = config.screens[screenId];
    if (s) { s.widgets=[]; saveConfig(config); broadcast({type:"WIDGETS_UPDATED",screenId,widgets:[]},screenId); }
    return { action:"SCREEN_CLEARED" };
  }
  const switchMatch = t.match(/switch to (\w+)/);
  if (switchMatch) return { action:"SWITCH_SCREEN", screenId:switchMatch[1] };
  return { action:"UNKNOWN", transcript };
}

const PORT = config.server?.port || 3333;
httpServer.listen(PORT, () => {
  console.log(`\n◈ DisplayOS running on :${PORT}`);
  console.log(`  Display → http://localhost:${PORT}/display?screen=main`);
  console.log(`  Admin   → http://localhost:${PORT}/admin`);
  console.log(`  Status  → http://localhost:${PORT}/api/status`);
  console.log(`  LAN     → http://[your-ip]:${PORT}/display?screen=main\n`);
});
