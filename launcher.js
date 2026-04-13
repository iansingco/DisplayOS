#!/usr/bin/env node
// launcher.js — DisplayOS process controller
// Starts server, client, admin, and bridge; streams merged output.
// Run from repo root: node launcher.js
//
// Options (env vars):
//   PORT=3333          server port (default 3333)
//   CLIENT_PORT=5173   client dev port
//   ADMIN_PORT=5174    admin dev port
//   NO_BRIDGE=1        skip the USB bridge process
//   NO_CLIENT=1        skip the client dev server (e.g. in prod)
//   NO_ADMIN=1         skip the admin dev server

import { spawn }        from "child_process";
import { createServer } from "http";
import path             from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT        = process.env.PORT        || 3333;
const CLIENT_PORT = process.env.CLIENT_PORT || 5173;
const ADMIN_PORT  = process.env.ADMIN_PORT  || 5174;

// ── ANSI helpers ─────────────────────────────────────────────────────────────
const R = "\x1b[0m";
const B = "\x1b[1m";
const D = "\x1b[2m";
const colors = {
  server: "\x1b[36m",   // cyan
  client: "\x1b[34m",   // blue
  admin:  "\x1b[35m",   // magenta
  bridge: "\x1b[32m",   // green
  launch: "\x1b[33m",   // yellow
};
const col  = (name, s) => `${colors[name] || ""}${s}${R}`;
const tag  = (name)    => col(name, `[${name.padEnd(6)}]`);
const info = (s)       => console.log(`${colors.launch}◈  ${s}${R}`);

// ── Service definitions ───────────────────────────────────────────────────────
const services = [
  {
    name:  "server",
    dir:   "server",
    cmd:   "node",
    args:  ["--watch", "index.js"],
    env:   { PORT: String(PORT) },
    skip:  false,
  },
  {
    name:  "client",
    dir:   "client",
    cmd:   "npx",
    args:  ["vite", "--port", String(CLIENT_PORT)],
    skip:  !!process.env.NO_CLIENT,
  },
  {
    name:  "admin",
    dir:   "admin",
    cmd:   "npx",
    args:  ["vite", "--port", String(ADMIN_PORT)],
    skip:  !!process.env.NO_ADMIN,
  },
  {
    name:  "bridge",
    dir:   "bridge",
    cmd:   "node",
    args:  ["--watch", "usb-bridge.js"],
    env:   {
      SERVER_WS:   `ws://localhost:${PORT}`,
      SERVER_HTTP: `http://localhost:${PORT}`,
    },
    skip:  !!process.env.NO_BRIDGE,
  },
];

// ── Process management ────────────────────────────────────────────────────────
const procs = new Map(); // name → { proc, status, lines }

function startService(svc) {
  const cwd  = path.join(__dirname, svc.dir);
  const env  = { ...process.env, ...(svc.env || {}) };
  const proc = spawn(svc.cmd, svc.args, { cwd, env, shell: process.platform === "win32" });

  const state = { proc, status: "starting", lines: [] };
  procs.set(svc.name, state);

  const onLine = (raw) => {
    const line = raw.toString().replace(/\n$/, "");
    if (!line.trim()) return;
    state.lines = [...state.lines.slice(-20), line]; // keep last 20 lines
    console.log(`${tag(svc.name)} ${line}`);
  };

  proc.stdout.on("data", onLine);
  proc.stderr.on("data", onLine);

  proc.on("spawn",  () => { state.status = "running"; });
  proc.on("error",  e  => { state.status = "error";   console.error(`${tag(svc.name)} ${e.message}`); });
  proc.on("exit",  (code) => {
    state.status = code === 0 ? "stopped" : "crashed";
    console.log(`${tag(svc.name)} ${D}exited (${code})${R}`);
    // Auto-restart after 3 s unless we're shutting down
    if (!shuttingDown) setTimeout(() => startService(svc), 3000);
  });
}

// ── Status HTTP server (port+1) ───────────────────────────────────────────────
// Serves a minimal JSON + HTML status page so you can check health from a browser.
const STATUS_PORT = Number(PORT) + 1;

function startStatusServer() {
  const http = createServer((req, res) => {
    if (req.url === "/status.json" || req.headers.accept?.includes("application/json")) {
      const data = {};
      for (const [name, state] of procs) {
        data[name] = { status: state.status, lastLines: state.lines.slice(-5) };
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data, null, 2));
      return;
    }
    // Minimal HTML status page
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(statusHTML());
  });
  http.listen(STATUS_PORT, () => {
    info(`Status page → http://localhost:${STATUS_PORT}`);
  });
}

function statusHTML() {
  const rows = [...procs.entries()].map(([name, state]) => {
    const dot = state.status === "running" ? "#7fff7f" : state.status === "starting" ? "#ffcc44" : "#ff7f7f";
    const log = state.lines.slice(-8).map(l =>
      `<div style="color:#888;font-size:11px;white-space:pre;overflow:hidden;text-overflow:ellipsis">${escHtml(l)}</div>`
    ).join("");
    return `
      <div style="background:#111;border:1px solid #222;border-radius:8px;padding:12px 16px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="width:8px;height:8px;border-radius:50%;background:${dot}"></div>
          <span style="color:#e0e0ff;font-size:14px">${name}</span>
          <span style="color:#444;font-size:11px">${state.status}</span>
        </div>
        ${log}
      </div>`;
  }).join("");

  const links = [
    ["Display",      `http://localhost:${CLIENT_PORT}?screen=main`],
    ["Admin",        `http://localhost:${ADMIN_PORT}`],
    ["Server API",   `http://localhost:${PORT}/api/screens`],
  ].map(([l, h]) => `<a href="${h}" target="_blank" style="color:#7faaff;font-size:12px;margin-right:16px">${l} ↗</a>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>DisplayOS</title>
<meta http-equiv="refresh" content="4">
<style>*{box-sizing:border-box}body{margin:0;background:#0a0a0f;font-family:'Courier New',monospace;padding:20px;color:#c8c8e8}</style>
</head><body>
<div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
  <span style="color:#7faaff;font-size:1.2rem">◈</span>
  <span style="font-size:14px;letter-spacing:.15em;text-transform:uppercase;color:#e0e0ff">DisplayOS</span>
  <span style="color:#333;font-size:11px;margin-left:auto">auto-refresh 4 s</span>
</div>
<div style="margin-bottom:20px">${links}</div>
${rows}
</body></html>`;
}

function escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── Banner ────────────────────────────────────────────────────────────────────
function printBanner() {
  const line = "─".repeat(48);
  console.log(`\n${B}${colors.launch}◈  DisplayOS${R}`);
  console.log(`${D}${line}${R}`);
  info(`Display   → http://localhost:${CLIENT_PORT}?screen=main`);
  info(`Admin     → http://localhost:${ADMIN_PORT}`);
  info(`Server    → http://localhost:${PORT}`);
  info(`Status    → http://localhost:${STATUS_PORT}`);
  if (!process.env.NO_BRIDGE) info(`Bridge    → watching for USB device`);
  console.log(`${D}${line}${R}`);
  console.log(`${D}Ctrl+C to stop all services${R}\n`);
}

// ── Shutdown ──────────────────────────────────────────────────────────────────
let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${D}Stopping all services...${R}`);
  for (const [, state] of procs) {
    try { state.proc.kill("SIGTERM"); } catch {}
  }
  setTimeout(() => process.exit(0), 1500);
}

process.on("SIGINT",  shutdown);
process.on("SIGTERM", shutdown);

// ── Start ─────────────────────────────────────────────────────────────────────
printBanner();
startStatusServer();
for (const svc of services) {
  if (!svc.skip) startService(svc);
}
