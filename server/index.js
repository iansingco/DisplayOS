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

const app = express();
app.use(cors());
app.use(express.json());
app.use("/display", express.static(path.join(__dirname, "../client/dist")));
app.use("/admin",   express.static(path.join(__dirname, "../admin/dist")));

// REST API
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

app.get("/api/stats", async (req, res) => res.json(await getStats()));
app.get("/api/config", (req, res) => res.json(config));
app.put("/api/config", (req, res) => { config={...config,...req.body}; saveConfig(config); broadcast({type:"CONFIG_UPDATED",config}); res.json(config); });
app.post("/api/voice", (req, res) => res.json(handleVoiceCommand(req.body.transcript, req.body.screenId)));

// WebSocket
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });
const clients = new Map();

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const screenId = url.searchParams.get("screen") || "main";
  const clientId = uuidv4();
  clients.set(ws, { screenId, clientId });
  console.log(`[WS] +${clientId} → "${screenId}" (${clients.size} connected)`);
  ws.send(JSON.stringify({ type:"INIT", screenId, screen:config.screens[screenId]||null, config }));
  ws.on("message", raw => { try { handleClientMessage(ws, JSON.parse(raw), screenId); } catch {} });
  ws.on("close", () => { clients.delete(ws); console.log(`[WS] -${clientId} (${clients.size} remaining)`); });
});

function broadcast(msg, targetScreen=null) {
  const payload = JSON.stringify(msg);
  for (const [ws, meta] of clients) {
    if (ws.readyState !== 1) continue;
    if (targetScreen && meta.screenId !== targetScreen) continue;
    ws.send(payload);
  }
}

function handleClientMessage(ws, msg, screenId) {
  if (msg.type === "VOICE_TRANSCRIPT") {
    const result = handleVoiceCommand(msg.transcript, screenId);
    ws.send(JSON.stringify({ type:"VOICE_RESULT", ...result }));
  }
}

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
  console.log(`  LAN     → http://[your-ip]:${PORT}/display?screen=main\n`);
});
