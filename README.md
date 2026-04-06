# DisplayOS

> Self-hosted network display server. Any screen, any content, any size.

Run it on your PC. Open a URL on any screen — phone, tablet, Pi, TV stick. That screen becomes a live, configurable display showing whatever you want: clocks, weather, websites, GIFs, system stats, and more. Voice activated. Zero GPU overhead on the host.

---

## Quick Start

```bash
npm install
npm run dev
```

- **Display:** `http://localhost:5173?screen=main`
- **Admin:** `http://localhost:5174`

From another device on your network: `http://[your-pc-ip]:3333/display?screen=main`

## Named Screens

Every screen is identified by a URL param:

```
?screen=main
?screen=bedroom
?screen=kitchen
?screen=hud
```

Create and configure screens from the Admin panel.

## Widgets

| Widget | Description |
|--------|-------------|
| 🕐 Clock | Digital clock with date, 12/24h |
| ⛅ Weather | Live weather via Open-Meteo (no API key) |
| 🖼️ Image/GIF | Any image URL or animated GIF |
| 🌐 Website | Iframe embed of any website |
| 📊 System Stats | CPU, RAM, uptime from host |

## Voice Control

Say the wake word (default: **"hey display"**) followed by a command:

- *"hey display add clock"*
- *"hey display clear screen"*
- *"hey display switch to bedroom"*

Uses Web Speech API — no cloud service, runs in the browser.

## Client Devices

Any browser works. Recommended setups:
- **Android phone/tablet** — Fully Kiosk Browser (kiosk mode, always-on)
- **Raspberry Pi** — Chromium with `--kiosk --app=http://[ip]:3333/display?screen=main`
- **Amazon Fire Stick** — Silk browser or sideloaded Chromium
- **Old laptop** — just a browser tab

## Tech Stack

- **Server:** Node.js + Express + WebSocket (`ws`)
- **Display client:** React + Vite
- **Admin panel:** React + Vite
- **Persistence:** `config.json` (auto-created, gitignored)
- **Weather:** Open-Meteo (free, no API key)
- **Voice:** Web Speech API (browser-native)
