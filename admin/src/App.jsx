import { useState } from "react";
import { useAdminAPI } from "./hooks/useAdminAPI.js";

const WIDGET_TYPES = [
  { type: "clock",   icon: "🕐", label: "Clock",        defaults: { w: 4, h: 2, config: { showDate: true, showSeconds: true, format24: false } } },
  { type: "weather", icon: "⛅", label: "Weather",      defaults: { w: 4, h: 3, config: { city: "New York", units: "fahrenheit" } } },
  { type: "gif",     icon: "🖼️", label: "Image / GIF",  defaults: { w: 4, h: 4, config: { url: "", objectFit: "cover" } } },
  { type: "iframe",  icon: "🌐", label: "Website",      defaults: { w: 6, h: 5, config: { url: "", label: "" } } },
  { type: "stats",   icon: "📊", label: "System Stats", defaults: { w: 4, h: 3, config: { refresh: 2000 } } },
];

const WIDGET_FIELDS = {
  clock:   [
    { key: "showDate",    label: "Show date",    type: "checkbox" },
    { key: "showSeconds", label: "Show seconds", type: "checkbox" },
    { key: "format24",    label: "24h format",   type: "checkbox" },
  ],
  weather: [
    { key: "city",  label: "City",  type: "text",   placeholder: "New York" },
    { key: "units", label: "Units", type: "select", options: ["fahrenheit", "celsius"] },
  ],
  gif:     [
    { key: "url",       label: "Image / GIF URL", type: "text", placeholder: "https://..." },
    { key: "objectFit", label: "Fit",             type: "select", options: ["cover", "contain", "fill"] },
  ],
  iframe:  [
    { key: "url",   label: "URL",   type: "text", placeholder: "https://..." },
    { key: "label", label: "Label", type: "text", placeholder: "Optional label" },
  ],
  stats:   [
    { key: "refresh", label: "Refresh (ms)", type: "number", placeholder: "2000" },
  ],
};

// Sniff a URL to guess the right widget type
function detectType(url) {
  const u = url.toLowerCase().split("?")[0];
  if (/\.(gif|png|jpg|jpeg|webp|svg|bmp|avif)$/.test(u)) return "gif";
  if (/giphy\.com|tenor\.com|gfycat\.com/.test(u)) return "gif";
  return "iframe";
}

// ── Widget config editor modal ───────────────────────────────────────────────
function WidgetEditor({ widget, screenId, onUpdate, onClose }) {
  const fields = WIDGET_FIELDS[widget.type] || [];
  const [cfg, setCfg] = useState({ ...widget.config });
  const [pos, setPos] = useState({ x: widget.x, y: widget.y, w: widget.w, h: widget.h });
  const def = WIDGET_TYPES.find(t => t.type === widget.type);

  const save = () => { onUpdate(screenId, widget.id, { ...widget, ...pos, config: cfg }); onClose(); };
  const set  = (k, v) => setCfg(p => ({ ...p, [k]: v }));

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <span>{def?.icon} {def?.label ?? widget.type}</span>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {fields.length > 0 && <>
          <div style={s.modalSection}>CONFIG</div>
          {fields.map(f => (
            <div key={f.key} style={s.fieldRow}>
              <label style={s.fieldLabel}>{f.label}</label>
              {f.type === "checkbox" && <input type="checkbox" checked={cfg[f.key] ?? false} onChange={e => set(f.key, e.target.checked)} style={s.checkbox} />}
              {f.type === "text"     && <input style={{ ...s.input, flex: 1 }} value={cfg[f.key] ?? ""} placeholder={f.placeholder} onChange={e => set(f.key, e.target.value)} />}
              {f.type === "number"   && <input style={{ ...s.input, width: 80 }} type="number" value={cfg[f.key] ?? ""} placeholder={f.placeholder} onChange={e => set(f.key, Number(e.target.value))} />}
              {f.type === "select"   && <select style={s.select} value={cfg[f.key] ?? f.options[0]} onChange={e => set(f.key, e.target.value)}>{f.options.map(o => <option key={o}>{o}</option>)}</select>}
            </div>
          ))}
        </>}

        <div style={s.modalSection}>POSITION &amp; SIZE</div>
        <div style={s.posGrid}>
          {[["x","X"],["y","Y"],["w","W"],["h","H"]].map(([k,l]) => (
            <div key={k} style={s.posField}>
              <label style={s.fieldLabel}>{l}</label>
              <input style={{ ...s.input, width: "100%", boxSizing: "border-box" }} type="number" min="0" max={k==="x"||k==="w"?"12":"8"} value={pos[k]} onChange={e => setPos(p => ({ ...p, [k]: Number(e.target.value) }))} />
            </div>
          ))}
        </div>

        <div style={s.modalActions}>
          <button style={s.btnSave} onClick={save}>Save</button>
          <button style={{ ...s.btn, ...s.btnGhost }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Screen card (on the home grid) ───────────────────────────────────────────
function ScreenCard({ screen, onClick }) {
  const preview = screen.widgets?.slice(0, 4) || [];
  return (
    <div style={s.card} onClick={onClick}>
      <div style={{ ...s.cardPreview, background: screen.background || "#0a0a0f" }}>
        {preview.map(w => {
          const def = WIDGET_TYPES.find(t => t.type === w.type);
          return <span key={w.id} style={s.cardWidgetDot} title={def?.label}>{def?.icon ?? "◻"}</span>;
        })}
        {preview.length === 0 && <span style={s.cardEmpty}>empty</span>}
      </div>
      <div style={s.cardBody}>
        <div style={s.cardName}>{screen.name}</div>
        <div style={s.cardMeta}>/{screen.id} · {screen.widgets?.length ?? 0} widget{screen.widgets?.length !== 1 ? "s" : ""}</div>
      </div>
    </div>
  );
}

// ── Main app ─────────────────────────────────────────────────────────────────
export default function AdminApp() {
  const { screens, loading, error, createScreen, deleteScreen, addWidget, removeWidget, updateWidget, updateScreen } = useAdminAPI();
  const [activeScreen, setActiveScreen] = useState(null);
  const [editingWidget, setEditingWidget] = useState(null);
  const [quickUrl, setQuickUrl] = useState("");
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  const screenList = Object.values(screens);
  const current    = activeScreen ? screens[activeScreen] : null;

  async function handleCreate() {
    if (!newId.trim()) return;
    const id = newId.toLowerCase().replace(/\s+/g, "-");
    await createScreen(id, newName || id);
    setActiveScreen(id);
    setNewId(""); setNewName(""); setShowNewForm(false);
  }

  async function handleAddWidget(typeDef) {
    if (!activeScreen) return;
    await addWidget(activeScreen, { type: typeDef.type, x: 0, y: 0, w: typeDef.defaults.w, h: typeDef.defaults.h, config: { ...typeDef.defaults.config } });
  }

  async function handleQuickAdd() {
    const url = quickUrl.trim();
    if (!url || !activeScreen) return;
    const type = detectType(url);
    const def  = WIDGET_TYPES.find(t => t.type === type);
    await addWidget(activeScreen, { type, x: 0, y: 0, w: def.defaults.w, h: def.defaults.h, config: { ...def.defaults.config, url } });
    setQuickUrl("");
  }

  // ── Home: screen cards ────────────────────────────────────────────────────
  if (!current) return (
    <div style={s.root}>
      <div style={s.topbar}>
        <span style={s.logo}><span style={{ color: "#7faaff" }}>◈</span> DisplayOS</span>
      </div>

      <div style={s.homeWrap}>
        <div style={s.homeTitle}>Screens</div>
        {loading && <div style={s.dim}>Loading...</div>}
        {error   && <div style={s.err}>{error}</div>}

        <div style={s.cardGrid}>
          {screenList.map(sc => (
            <ScreenCard key={sc.id} screen={sc} onClick={() => setActiveScreen(sc.id)} />
          ))}

          {/* Add screen card */}
          {showNewForm ? (
            <div style={{ ...s.card, ...s.cardNew, flexDirection: "column", gap: "0.5rem", padding: "1rem" }}>
              <input style={s.input} placeholder="screen-id" value={newId} onChange={e => setNewId(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCreate()} autoFocus />
              <input style={s.input} placeholder="Display name (optional)" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCreate()} />
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button style={s.btnSave} onClick={handleCreate}>Create</button>
                <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowNewForm(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ ...s.card, ...s.cardNew }} onClick={() => setShowNewForm(true)}>
              <div style={{ fontSize: "2rem", opacity: 0.3 }}>+</div>
              <div style={{ fontSize: "0.75rem", opacity: 0.3 }}>New Screen</div>
            </div>
          )}
        </div>
      </div>

      {editingWidget && <WidgetEditor widget={editingWidget} screenId={activeScreen} onUpdate={updateWidget} onClose={() => setEditingWidget(null)} />}
    </div>
  );

  // ── Screen editor ─────────────────────────────────────────────────────────
  return (
    <div style={s.root}>
      {/* Top bar */}
      <div style={s.topbar}>
        <button style={s.backBtn} onClick={() => setActiveScreen(null)}>← Screens</button>
        <span style={s.topbarTitle}>{current.name}</span>
        <div style={s.topbarRight}>
          <label style={s.colorLabel}>
            BG
            <input type="color" value={current.background || "#0a0a0f"} onChange={e => updateScreen(current.id, { ...current, background: e.target.value })} style={s.colorInput} />
          </label>
          <a href={`http://${window.location.hostname}:5173?screen=${current.id}`} target="_blank" style={s.btn}>↗ Preview</a>
          <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => { deleteScreen(current.id); setActiveScreen(null); }}>Delete</button>
        </div>
      </div>

      <div style={s.editorWrap}>
        {/* Connect info */}
        <div style={s.connectBar}>
          <span style={s.connectLabel}>Display URL</span>
          <code style={s.connectCode}>http://[your-ip]:5173?screen={current.id}</code>
        </div>

        {/* Quick-add URL */}
        <div style={s.section}>QUICK ADD</div>
        <div style={s.quickRow}>
          <input
            style={{ ...s.input, flex: 1 }}
            placeholder="Paste a URL — image, GIF, or website — detected automatically"
            value={quickUrl}
            onChange={e => setQuickUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleQuickAdd()}
          />
          <button style={s.btnSave} onClick={handleQuickAdd} disabled={!quickUrl.trim()}>Add</button>
        </div>
        {quickUrl.trim() && (
          <div style={s.detectHint}>
            Detected: <strong style={{ color: "#7faaff" }}>{WIDGET_TYPES.find(t => t.type === detectType(quickUrl))?.label}</strong>
          </div>
        )}

        {/* Widget palette */}
        <div style={s.section}>ADD WIDGET</div>
        <div style={s.palette}>
          {WIDGET_TYPES.map(t => (
            <button key={t.type} style={s.paletteBtn} onClick={() => handleAddWidget(t)}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Widget list */}
        <div style={s.section}>ON THIS SCREEN ({current.widgets?.length || 0})</div>
        <div style={s.widgetList}>
          {(!current.widgets || current.widgets.length === 0) && <div style={s.dim}>No widgets yet.</div>}
          {current.widgets?.map(w => {
            const def = WIDGET_TYPES.find(t => t.type === w.type);
            const previewVal = w.config?.url || w.config?.city || w.config?.body || "";
            return (
              <div key={w.id} style={s.widgetRow}>
                <span style={s.wIcon}>{def?.icon ?? "◻"}</span>
                <div style={s.wMeta}>
                  <span style={s.wType}>{def?.label ?? w.type}</span>
                  {previewVal && <span style={s.wPreview} title={previewVal}>{previewVal.slice(0, 40)}{previewVal.length > 40 ? "…" : ""}</span>}
                  <span style={s.wPos}>x:{w.x} y:{w.y} · {w.w}×{w.h}</span>
                </div>
                <button style={s.wEdit}   onClick={() => setEditingWidget(w)}>✎ Edit</button>
                <button style={s.wRemove} onClick={() => removeWidget(current.id, w.id)}>✕</button>
              </div>
            );
          })}
        </div>

        {/* Voice */}
        <div style={s.section}>VOICE CONTROL</div>
        <div style={s.voiceRow}>
          <label style={s.toggle}>
            <input type="checkbox" checked={current.voiceEnabled ?? true} onChange={e => updateScreen(current.id, { ...current, voiceEnabled: e.target.checked })} style={{ marginRight: "0.5rem" }} />
            Enable voice
          </label>
          <input style={{ ...s.input, width: 200 }} placeholder="Wake word" value={current.wakeWord ?? "hey display"} onChange={e => updateScreen(current.id, { ...current, wakeWord: e.target.value })} />
        </div>
      </div>

      {editingWidget && (
        <WidgetEditor widget={editingWidget} screenId={current.id} onUpdate={updateWidget} onClose={() => setEditingWidget(null)} />
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  root:        { display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#0a0a0f", color: "#c8c8e8", fontFamily: "'Courier New', monospace" },
  topbar:      { display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1.5rem", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 },
  logo:        { fontSize: "0.85rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "#e0e0ff" },
  topbarTitle: { fontSize: "0.9rem", color: "#e0e0ff", flex: 1 },
  topbarRight: { display: "flex", alignItems: "center", gap: "0.5rem" },
  backBtn:     { background: "none", border: "none", color: "#7faaff", cursor: "pointer", fontSize: "0.8rem", padding: "0.2rem 0.4rem", fontFamily: "'Courier New', monospace" },

  // Home
  homeWrap:  { flex: 1, overflow: "auto", padding: "2rem" },
  homeTitle: { fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.3, marginBottom: "1.25rem" },
  cardGrid:  { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" },
  card:      { display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", overflow: "hidden", cursor: "pointer", transition: "border-color 0.2s", background: "rgba(255,255,255,0.02)" },
  cardNew:   { alignItems: "center", justifyContent: "center", minHeight: "140px", border: "1px dashed rgba(255,255,255,0.12)" },
  cardPreview: { height: "90px", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", padding: "0.75rem", flexWrap: "wrap" },
  cardWidgetDot: { fontSize: "1.3rem" },
  cardEmpty: { fontSize: "0.65rem", opacity: 0.25 },
  cardBody:  { padding: "0.6rem 0.75rem", borderTop: "1px solid rgba(255,255,255,0.06)" },
  cardName:  { fontSize: "0.8rem", color: "#e0e0ff", marginBottom: "0.2rem" },
  cardMeta:  { fontSize: "0.6rem", opacity: 0.35 },

  // Editor
  editorWrap:   { flex: 1, overflow: "auto", padding: "1.5rem 2rem" },
  connectBar:   { display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.9rem", background: "rgba(127,170,255,0.05)", border: "1px solid rgba(127,170,255,0.12)", borderRadius: "8px", marginBottom: "1.5rem" },
  connectLabel: { fontSize: "0.6rem", opacity: 0.4, letterSpacing: "0.1em", textTransform: "uppercase", flexShrink: 0 },
  connectCode:  { fontSize: "0.72rem", color: "#7faaff", wordBreak: "break-all" },
  quickRow:     { display: "flex", gap: "0.5rem", marginBottom: "0.4rem" },
  detectHint:   { fontSize: "0.7rem", opacity: 0.5, marginBottom: "1rem" },
  section:      { fontSize: "0.5rem", letterSpacing: "0.2em", opacity: 0.3, marginBottom: "0.75rem", marginTop: "1.5rem", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "0.35rem" },
  palette:      { display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" },
  paletteBtn:   { display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.45rem 0.7rem", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: "#c8c8e8", cursor: "pointer", fontSize: "0.75rem", fontFamily: "'Courier New', monospace" },
  widgetList:   { display: "flex", flexDirection: "column", gap: "0.4rem" },
  widgetRow:    { display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.55rem 0.75rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px" },
  wIcon:        { fontSize: "1rem", flexShrink: 0 },
  wMeta:        { display: "flex", flexDirection: "column", gap: "0.1rem", flex: 1, minWidth: 0 },
  wType:        { fontSize: "0.75rem", color: "#e0e0ff" },
  wPreview:     { fontSize: "0.65rem", opacity: 0.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  wPos:         { fontSize: "0.58rem", opacity: 0.25 },
  wEdit:        { background: "none", border: "none", color: "rgba(127,170,255,0.55)", cursor: "pointer", fontSize: "0.72rem", padding: "0.2rem 0.5rem", borderRadius: "4px", fontFamily: "'Courier New', monospace", flexShrink: 0 },
  wRemove:      { background: "none", border: "none", color: "rgba(255,100,100,0.4)", cursor: "pointer", fontSize: "0.75rem", padding: "0.2rem 0.4rem", borderRadius: "4px", flexShrink: 0 },
  voiceRow:     { display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginTop: "0.5rem" },
  toggle:       { display: "flex", alignItems: "center", fontSize: "0.8rem", cursor: "pointer" },

  // Shared inputs / buttons
  input:    { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#e0e0ff", padding: "0.4rem 0.65rem", fontSize: "0.8rem", outline: "none", fontFamily: "'Courier New', monospace" },
  select:   { background: "#0a0a0f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#e0e0ff", padding: "0.4rem 0.6rem", fontSize: "0.8rem", outline: "none", fontFamily: "'Courier New', monospace" },
  checkbox: { accentColor: "#7faaff", width: 14, height: 14, cursor: "pointer" },
  btn:      { padding: "0.35rem 0.7rem", background: "rgba(127,170,255,0.12)", border: "1px solid rgba(127,170,255,0.25)", borderRadius: "6px", color: "#7faaff", cursor: "pointer", fontSize: "0.72rem", textDecoration: "none", display: "inline-flex", alignItems: "center", fontFamily: "'Courier New', monospace" },
  btnSave:  { padding: "0.4rem 1rem", background: "rgba(127,255,127,0.1)", border: "1px solid rgba(127,255,127,0.3)", borderRadius: "6px", color: "#7fff7f", cursor: "pointer", fontSize: "0.8rem", fontFamily: "'Courier New', monospace" },
  btnGhost: { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" },
  btnDanger:{ background: "rgba(255,80,80,0.1)", borderColor: "rgba(255,80,80,0.3)", color: "rgba(255,120,120,0.8)" },
  colorLabel: { fontSize: "0.65rem", opacity: 0.5, display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" },
  colorInput: { width: 28, height: 20, border: "none", borderRadius: "4px", cursor: "pointer" },

  // Modal
  overlay:      { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal:        { background: "#0d0d14", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "1.5rem", width: "100%", maxWidth: 400, boxShadow: "0 8px 40px rgba(0,0,0,0.6)" },
  modalHeader:  { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", fontSize: "0.9rem", color: "#e0e0ff" },
  modalSection: { fontSize: "0.5rem", letterSpacing: "0.2em", opacity: 0.3, marginBottom: "0.6rem", marginTop: "1rem", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "0.3rem" },
  modalActions: { display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1.25rem" },
  fieldRow:     { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem", gap: "0.75rem" },
  fieldLabel:   { fontSize: "0.75rem", opacity: 0.6, flexShrink: 0 },
  posGrid:      { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.5rem" },
  posField:     { display: "flex", flexDirection: "column", gap: "0.25rem" },
  closeBtn:     { background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: "0.9rem", padding: "0.1rem 0.3rem" },

  // Misc
  dim: { fontSize: "0.75rem", opacity: 0.3, padding: "0.5rem 0" },
  err: { fontSize: "0.75rem", color: "#ff8080" },
};
