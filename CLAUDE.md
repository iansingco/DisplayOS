# DisplayOS — Claude Code Project Brief

## What This Is

DisplayOS is a **self-hosted network display server**. A single Node.js process runs on a host PC
and serves a modular widget UI over the local network. Any device with a browser — phone, tablet,
Raspberry Pi, cheap Android stick, old laptop — opens a URL and becomes a display. No apps to
install. No GPU load on the host. Works on any screen size.

Think: personal digital signage infrastructure. Like a stadium control room, but for a house or desk.

---

## Project Structure

```
displayOS/
├── server/           # Node.js + Express + WebSocket host
│   ├── index.js      # Main server — REST API + WS broadcast
│   ├── stats.js      # System stats (CPU, RAM, uptime)
│   └── config.json   # Auto-generated on first run, gitignored
├── client/           # React display app (what screens show)
│   └── src/
│       ├── App.jsx               # Root — reads ?screen= param
│       ├── hooks/
│       │   ├── useDisplaySocket.js   # WS connection + auto-reconnect
│       │   └── useVoiceControl.js    # Web Speech API wake-word listener
│       ├── components/
│       │   ├── WidgetTile.jsx        # Positions widget on 12×8 grid
│       │   ├── VoiceHUD.jsx          # Listening indicator overlay
│       │   └── ConnectionBadge.jsx   # WS status indicator
│       └── widgets/
│           ├── index.js          # Widget type registry
│           ├── ClockWidget.jsx
│           ├── WeatherWidget.jsx # Open-Meteo, no API key needed
│           ├── GifWidget.jsx
│           ├── IframeWidget.jsx
│           └── StatsWidget.jsx
└── admin/            # React admin panel (/admin route)
    └── src/
        ├── App.jsx               # Screen manager + widget editor
        └── hooks/useAdminAPI.js  # REST calls to server
```

---

## How to Run (First Time)

```bash
# From displayOS root
npm install          # installs all workspaces

# Dev mode (all three concurrently):
npm run dev

# Or run individually:
cd server && npm run dev        # :3333
cd client && npm run dev        # :5173 (proxies to server)
cd admin  && npm run dev        # :5174 (proxies to server)
```

**Access:**
- Display: `http://localhost:5173?screen=main`  (dev) or `http://[ip]:3333/display?screen=main` (prod)
- Admin: `http://localhost:5174` (dev) or `http://[ip]:3333/admin` (prod)

Named screens work via URL param — `?screen=bedroom`, `?screen=kitchen`, `?screen=hud`, etc.

---

## Core Concepts

### Widget Grid
The display is a **12-column × 8-row grid**. Each widget has `{ x, y, w, h }` in grid units.
`WidgetTile.jsx` converts those to absolute px using the container's actual dimensions via
`ResizeObserver`. This makes layouts resolution-independent — same config works on a 5" phone
and a 75" TV.

### WebSocket Protocol
All real-time updates flow through WebSocket. The server is the single source of truth.

**Server → Client messages:**
| type | payload | meaning |
|------|---------|---------|
| `INIT` | `{ screenId, screen, config }` | Sent on connect with full state |
| `SCREEN_UPDATED` | `{ screenId, screen }` | Full screen object replaced |
| `WIDGETS_UPDATED` | `{ screenId, widgets }` | Full widget array replaced |
| `WIDGET_ADDED` | `{ screenId, widget }` | Single widget appended |
| `WIDGET_REMOVED` | `{ screenId, widgetId }` | Widget removed by id |

**Client → Server messages:**
| type | payload | meaning |
|------|---------|---------|
| `VOICE_TRANSCRIPT` | `{ transcript }` | Raw voice command text |
| `PING` | — | Keepalive |

### Screen Sessions
A screen connects with `ws://host:3333?screen=SCREEN_ID`. The server tracks all connections in a
`Map<ws, { screenId, clientId }>`. `broadcast(msg, targetScreenId)` can target all screens or
one specific screen ID. This is the stadium zone model — same architectural pattern as
Cisco StadiumVision, scaled to LAN.

### Config Persistence
`server/config.json` is auto-created on first run and written on every change. It's gitignored
so local setups don't collide. The schema:

```json
{
  "screens": {
    "main": {
      "id": "main",
      "name": "Main Display",
      "background": "#0a0a0f",
      "voiceEnabled": true,
      "wakeWord": "hey display",
      "widgets": [
        { "id": "uuid", "type": "clock", "x": 0, "y": 0, "w": 4, "h": 2, "config": {} }
      ]
    }
  },
  "server": { "port": 3333 }
}
```

---

## Immediate Next Steps (Priority Order)

### 1. Wire `/api/stats` into server/index.js
Import `getStats` from `stats.js` and add the route:
```js
import { getStats } from "./stats.js";
app.get("/api/stats", async (req, res) => res.json(await getStats()));
```

### 2. Drag-to-reposition widgets on the display
In `WidgetTile.jsx`, add pointer event handlers so widgets can be dragged to new grid positions.
On drag end, PUT the updated widget list to `/api/screens/:id/widgets`. The display should
optimistically update locally and confirm via WS.

### 3. Widget config editor in Admin
The admin currently shows widget config as read-only tags. Add an inline edit form per widget
type so the user can set the iframe URL, weather city, gif URL, etc. without editing config.json.

### 4. Zone groups
Allow a screen to belong to a named zone (`zone: "living-room"`). Add a
`POST /api/zones/:zone/broadcast` endpoint that sends a WS message to all screens in that zone
simultaneously. Useful for "all screens show this" or "kitchen + hallway show the clock."

### 5. Scheduled layouts
Add a `schedules` array to each screen config:
```json
{ "cron": "0 8 * * *", "layout": "morning" }
```
Use `node-cron` on the server to apply layout changes at scheduled times.

### 6. Voice command expansion
`server/index.js → handleVoiceCommand()` currently handles basic commands. Expand to:
- `"set background to [color]"`
- `"show [url] on [screen]"` → auto-creates an iframe widget
- `"mute all / unmute all"` → future audio widget support
- `"switch layout to [name]"` → named layout presets per screen

### 7. Whisper fallback (offline voice)
`useVoiceControl.js` uses Web Speech API (requires internet for Chrome). For offline use,
add a server endpoint that accepts audio blobs and runs Whisper.cpp via child_process.
Client detects if Web Speech API is unavailable and falls back to recording + POST.

### 8. CORS proxy for iframes
Many sites block iframe embedding via X-Frame-Options. Add an optional proxy route on the server:
`GET /api/proxy?url=https://...` that fetches and strips X-Frame-Options headers.
**Security note:** restrict to localhost/LAN only, never expose to public internet.

### 9. Client hardware targets
These are the recommended client devices — keep them in mind for CSS/layout decisions:
- Android phone in kiosk mode (Fully Kiosk Browser)
- Raspberry Pi running Chromium in `--kiosk` mode
- Amazon Fire Stick with browser
- Any laptop/desktop browser tab
All of these are just browsers — no special client code needed.

---

## Adding a New Widget Type

1. Create `client/src/widgets/MyWidget.jsx` — receives `{ config }` prop, fills 100%×100% of its tile
2. Register it in `client/src/widgets/index.js`:
   ```js
   import { MyWidget } from "./MyWidget";
   // Add to WIDGET_REGISTRY:
   mywidget: { component: MyWidget, label: "My Widget", icon: "✨", defaultSize: { w: 4, h: 3 } }
   ```
3. Add it to the admin palette in `admin/src/App.jsx` `WIDGET_TYPES` array with its defaults
4. That's it — the grid, WS sync, and admin all pick it up automatically

Widget design rules:
- Always `width: 100%; height: 100%` — the tile handles positioning
- Use `clamp()` for font sizes so they scale across screen sizes
- Prefer CSS-in-JS objects (already the pattern) over external CSS files
- Handle empty/unconfigured state gracefully with a placeholder UI
- Poll or use intervals for live data; always clean up with `clearInterval` on unmount

---

## Architecture Notes for Future Claude Sessions

- **No Redux, no Zustand** — state flows via WebSocket. The server is the store.
- **No React Router** — single-page per app, screen ID from URL param only.
- **No TypeScript yet** — intentional for scaffolding speed. Add when the API shape stabilizes.
- The 12×8 grid is a soft convention. `COLS` and `ROWS` constants in `WidgetTile.jsx` can be
  changed globally if needed.
- The server intentionally has no auth — it's LAN-only. If exposed externally, add a simple
  token check middleware to Express.
- `config.json` is the only persistence layer right now. If widget count grows large, swap for
  SQLite via `better-sqlite3` — the API shape doesn't need to change.

---

## Design Language

The UI follows a **dark, low-emission, terminal-adjacent aesthetic**:
- Background: near-black (`#0a0a0f`, `#0d0d14`)
- Text: soft blue-white (`#e0e0ff`, `#c8c8e8`)
- Accent: cool blue (`#7faaff`), soft green (`#7fff7f`)
- Font: `'Courier New', monospace` throughout — intentional, not default
- Borders: `rgba(255,255,255,0.06–0.1)` — barely visible separators
- Animations: subtle, purposeful — connection dots pulse, no gratuitous motion

This is a display OS, not a consumer app. Restraint is the aesthetic.
