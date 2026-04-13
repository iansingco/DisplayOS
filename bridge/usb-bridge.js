// usb-bridge.js
// Runs on the CLIENT machine (the display device's host).
// Bridges a USB-serial device (ESP32 / Arduino) ↔ DisplayOS server.
//
// Data flow:
//   Server → WS → bridge → USB serial → device  (render commands)
//   Device → USB serial → bridge → WS → server  (button/sensor events)
//
// Usage:
//   SERVER_WS=ws://192.168.1.10:3333 SERVER_HTTP=http://192.168.1.10:3333 node usb-bridge.js
//   Or just: node usb-bridge.js  (defaults to localhost)

import { SerialPort } from "serialport";
import { DelimiterParser } from "@serialport/parser-delimiter";
import WebSocket from "ws";
import { serializeWidgets } from "./device-serializer.js";

const SERVER_WS   = process.env.SERVER_WS   || "ws://localhost:3333";
const SERVER_HTTP = process.env.SERVER_HTTP  || "http://localhost:3333";
const BAUD        = Number(process.env.BAUD) || 115200;
// Poll interval: how often the bridge pushes fresh widget data to the device
const RENDER_MS   = Number(process.env.RENDER_MS) || 5000;
// Clock sync interval: keep device clock accurate (resend epoch every N ms)
const CLOCK_MS    = 60_000;

// Common USB VIDs for ESP32 / Arduino / CH340 / CP210x / FTDI / RP2040
const KNOWN_VIDS = new Set(["303a","10c4","1a86","0403","2341","2886","239a","16c0"]);

// State
let port     = null;
let parser   = null;
let device   = null;   // { screenId, caps, display, fw }
let ws       = null;
let renderTm = null;
let clockTm  = null;

// ─── Logging ────────────────────────────────────────────────────────────────

function log(msg)  { console.log(`[bridge] ${msg}`); }
function warn(msg) { console.warn(`[bridge] ${msg}`); }

// ─── Serial port detection ───────────────────────────────────────────────────

async function findDevice() {
  const ports = await SerialPort.list();
  return ports.find(p => {
    const vid = p.vendorId?.toLowerCase().replace(/^0x/, "");
    return vid && KNOWN_VIDS.has(vid);
  });
}

async function watchForDevice() {
  log("Watching for USB device...");
  const iv = setInterval(async () => {
    if (port) return;
    const found = await findDevice().catch(() => null);
    if (found) { clearInterval(iv); openPort(found.path); }
  }, 2000);
}

// ─── Serial port lifecycle ───────────────────────────────────────────────────

function openPort(path) {
  log(`Opening ${path} @ ${BAUD} baud`);
  port = new SerialPort({ path, baudRate: BAUD, autoOpen: true });
  parser = port.pipe(new DelimiterParser({ delimiter: "\n" }));

  port.on("open",  () => { log(`Port open: ${path}`); initDevice(); });
  port.on("error", e  => { warn(`Serial error: ${e.message}`); closePort(); });
  port.on("close", () => { log("Device disconnected"); closePort(); watchForDevice(); });

  parser.on("data", line => handleSerial(line.toString().trim()));
}

function closePort() {
  clearInterval(renderTm);
  clearInterval(clockTm);
  renderTm = null; clockTm = null;
  if (device && ws?.readyState === WebSocket.OPEN) {
    wsSend({ type: "DEVICE_DISCONNECTED", screenId: device.screenId });
  }
  device = null; port = null; parser = null;
}

function initDevice() {
  // Give the MCU a moment to boot / reset after DTR toggle
  setTimeout(() => write({ cmd: "init" }), 1200);
}

function write(obj) {
  if (!port?.isOpen) return;
  port.write(JSON.stringify(obj) + "\n", err => { if (err) warn(`Write error: ${err.message}`); });
}

// ─── Inbound: device → bridge → server ──────────────────────────────────────

function handleSerial(line) {
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  switch (msg.event) {
    case "ready":
      onDeviceReady(msg);
      break;

    case "button":
    case "encoder":
      // Physical input — forward to server as a DEVICE_EVENT.
      // Server can map this to handleVoiceCommand or layout switches.
      wsSend({ type: "DEVICE_EVENT", screenId: device?.screenId, ...msg });
      break;

    case "sensor":
      wsSend({ type: "DEVICE_SENSOR", screenId: device?.screenId, ...msg });
      break;

    default:
      // Pass-through debug lines from firmware
      log(`device: ${line}`);
  }
}

function onDeviceReady(msg) {
  // Build a stable screen ID: prefer device-reported id, else derive from caps+fw
  const screenId = msg.screenId || `usb-${(msg.fw || "dev").replace(/\./g, "")}`;
  device = { screenId, caps: msg.caps || [], display: msg.display || {}, fw: msg.fw || "?" };

  log(`Device ready — screen:"${screenId}" fw:${device.fw} display:${JSON.stringify(device.display)} caps:[${device.caps}]`);

  wsSend({ type: "DEVICE_CONNECTED", ...device });

  // Start render + clock sync loops
  pushRender();
  clearInterval(renderTm);
  clearInterval(clockTm);
  renderTm = setInterval(pushRender, RENDER_MS);
  clockTm  = setInterval(pushClockSync, CLOCK_MS);
}

// ─── Outbound: server → bridge → device ─────────────────────────────────────

async function pushRender() {
  if (!device || !port?.isOpen) return;
  try {
    const res = await fetch(`${SERVER_HTTP}/api/screens/${device.screenId}`);
    if (!res.ok) return;
    const screen = await res.json();
    const widgets = await serializeWidgets(screen.widgets || [], device.caps);
    write({ cmd: "render", widgets });
  } catch (e) {
    warn(`Render fetch failed: ${e.message}`);
  }
}

function pushClockSync() {
  // Only if clock is in caps — lets device re-anchor without a full render
  if (!device?.caps.includes("clock")) return;
  const now = new Date();
  write({ cmd: "clocksync", epoch: Math.floor(now.getTime() / 1000) });
}

// ─── WebSocket to server ─────────────────────────────────────────────────────

function connectServer() {
  // Connect as a special _bridge screen so the server can identify us
  ws = new WebSocket(`${SERVER_WS}?screen=_bridge`);

  ws.on("open", () => {
    log("Server WS connected");
    // Re-register device if it was already connected before a WS drop
    if (device) wsSend({ type: "DEVICE_CONNECTED", ...device });
  });

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    handleServerMessage(msg);
  });

  ws.on("close", () => {
    log("Server WS closed — reconnecting in 3 s");
    setTimeout(connectServer, 3000);
  });

  ws.on("error", e => warn(`Server WS error: ${e.message}`));
}

function wsSend(obj) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function handleServerMessage(msg) {
  // Server can push render overrides or direct device commands
  if (!device || msg.screenId !== device.screenId) return;
  switch (msg.type) {
    case "DEVICE_RENDER":
      write({ cmd: "render", widgets: msg.widgets });
      break;
    case "DEVICE_CMD":
      write(msg); // brightness, sleep, wake, etc.
      break;
    case "WIDGETS_UPDATED":
      // Screen was updated in admin — trigger an immediate re-render
      pushRender();
      break;
  }
}

// ─── Boot ────────────────────────────────────────────────────────────────────

log(`Starting — server: ${SERVER_WS}`);
connectServer();
watchForDevice();
