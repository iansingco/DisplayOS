import { useState } from "react";
import { useAdminAPI } from "./hooks/useAdminAPI.js";

const WIDGET_TYPES = [
  { type: "clock",   icon: "🕐", label: "Clock",        defaults: { w: 4, h: 2, config: { showDate: true, showSeconds: true, format24: false } } },
  { type: "weather", icon: "⛅", label: "Weather",      defaults: { w: 4, h: 3, config: { city: "New York", units: "fahrenheit" } } },
  { type: "gif",     icon: "🖼️", label: "Image / GIF",  defaults: { w: 4, h: 4, config: { url: "", objectFit: "cover" } } },
  { type: "iframe",  icon: "🌐", label: "Website",      defaults: { w: 6, h: 5, config: { url: "", label: "" } } },
  { type: "stats",   icon: "📊", label: "System Stats", defaults: { w: 4, h: 3, config: { refresh: 2000 } } },
];

// Field definitions for each widget type's config editor
const WIDGET_FIELDS = {
  clock: [
    { key: "showDate",    label: "Show date",    type: "checkbox" },
    { key: "showSeconds", label: "Show seconds", type: "checkbox" },
    { key: "format24",    label: "24h format",   type: "checkbox" },
  ],
  weather: [
    { key: "city",  label: "City",  type: "text",   placeholder: "New York" },
    { key: "units", label: "Units", type: "select", options: ["fahrenheit", "celsius"] },
  ],
  gif: [
    { key: "url",       label: "Image / GIF URL", type: "text", placeholder: "https://..." },
    { key: "objectFit", label: "Fit",             type: "select", options: ["cover", "contain", "fill"] },
  ],
  iframe: [
    { key: "url",   label: "URL",   type: "text", placeholder: "https://..." },
    { key: "label", label: "Label", type: "text", placeholder: "Optional label" },
  ],
  stats: [
    { key: "refresh", label: "Refresh (ms)", type: "number", placeholder: "2000" },
  ],
};

function WidgetConfigEditor({ widget, screenId, onUpdate, onClose }) {
  const fields = WIDGET_FIELDS[widget.type] || [];
  const [cfg, setCfg] = useState({ ...widget.config });
  const [pos, setPos] = useState({ x: widget.x, y: widget.y, w: widget.w, h: widget.h });

  function handleSave() {
    onUpdate(screenId, widget.id, { ...widget, ...pos, config: cfg });
    onClose();
  }

  function setField(key, value) {
    setCfg(prev => ({ ...prev, [key]: value }));
  }

  const def = WIDGET_TYPES.find(t => t.type === widget.type);

  return (
    <div style={s.editorOverlay} onClick={onClose}>
      <div style={s.editor} onClick={e => e.stopPropagation()}>
        <div style={s.editorHeader}>
          <span>{def?.icon ?? "◻"} {def?.label ?? widget.type}</span>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {fields.length > 0 && (
          <>
            <div style={s.editorSection}>CONFIG</div>
            {fields.map(f => (
              <div key={f.key} style={s.fieldRow}>
                <label style={s.fieldLabel}>{f.label}</label>
                {f.type === "checkbox" && (
                  <input
                    type="checkbox"
                    checked={cfg[f.key] ?? false}
                    onChange={e => setField(f.key, e.target.checked)}
                    style={s.checkbox}
                  />
                )}
                {f.type === "text" && (
                  <input
                    style={{ ...s.input, flex: 1 }}
                    value={cfg[f.key] ?? ""}
                    placeholder={f.placeholder}
                    onChange={e => setField(f.key, e.target.value)}
                  />
                )}
                {f.type === "number" && (
                  <input
                    style={{ ...s.input, width: "80px" }}
                    type="number"
                    value={cfg[f.key] ?? ""}
                    placeholder={f.placeholder}
                    onChange={e => setField(f.key, Number(e.target.value))}
                  />
                )}
                {f.type === "select" && (
                  <select
                    style={s.select}
                    value={cfg[f.key] ?? f.options[0]}
                    onChange={e => setField(f.key, e.target.value)}
                  >
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
              </div>
            ))}
          </>
        )}

        <div style={s.editorSection}>POSITION &amp; SIZE</div>
        <div style={s.posGrid}>
          {[["x","X"], ["y","Y"], ["w","W"], ["h","H"]].map(([k, label]) => (
            <div key={k} style={s.posField}>
              <label style={s.fieldLabel}>{label}</label>
              <input
                style={{ ...s.input, width: "100%", boxSizing: "border-box" }}
                type="number"
                min="0"
                max={k === "x" || k === "w" ? "12" : "8"}
                value={pos[k]}
                onChange={e => setPos(prev => ({ ...prev, [k]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </div>

        <div style={s.editorActions}>
          <button style={s.btnSave} onClick={handleSave}>Save</button>
          <button style={{ ...s.btnSm, ...s.btnGhost }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminApp() {
  const { screens, loading, error, createScreen, deleteScreen, addWidget, removeWidget, updateWidget, updateScreen } = useAdminAPI();
  const [activeScreen, setActiveScreen] = useState(null);
  const [newScreenId, setNewScreenId] = useState("");
  const [newScreenName, setNewScreenName] = useState("");
  const [showNewScreen, setShowNewScreen] = useState(false);
  const [editingWidget, setEditingWidget] = useState(null);

  const screenList = Object.values(screens);
  const current = activeScreen ? screens[activeScreen] : null;

  async function handleCreateScreen() {
    if (!newScreenId.trim()) return;
    const id = newScreenId.toLowerCase().replace(/\s+/g, "-");
    await createScreen(id, newScreenName || id);
    setActiveScreen(id);
    setNewScreenId("");
    setNewScreenName("");
    setShowNewScreen(false);
  }

  async function handleAddWidget(typeDef) {
    if (!activeScreen) return;
    await addWidget(activeScreen, {
      type: typeDef.type,
      x: 0, y: 0,
      w: typeDef.defaults.w,
      h: typeDef.defaults.h,
      config: { ...typeDef.defaults.config }
    });
  }

  async function handleUpdateBackground(color) {
    if (!activeScreen) return;
    await updateScreen(activeScreen, { ...current, background: color });
  }

  return (
    <div style={s.root}>
      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.logo}>
          <span style={s.logoMark}>◈</span>
          <span style={s.logoText}>DisplayOS</span>
        </div>
        <div style={s.sideSection}>SCREENS</div>

        {loading && <div style={s.dim}>Loading...</div>}
        {error && <div style={s.err}>Error: {error}</div>}

        {screenList.map(sc => (
          <div
            key={sc.id}
            style={{ ...s.screenItem, ...(activeScreen === sc.id ? s.screenItemActive : {}) }}
            onClick={() => setActiveScreen(sc.id)}
          >
            <span style={s.screenDot} />
            <span style={s.screenName}>{sc.name}</span>
            <span style={s.screenId}>/{sc.id}</span>
          </div>
        ))}

        {showNewScreen ? (
          <div style={s.newScreenForm}>
            <input
              style={s.input}
              placeholder="screen-id"
              value={newScreenId}
              onChange={e => setNewScreenId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreateScreen()}
              autoFocus
            />
            <input
              style={s.input}
              placeholder="Display Name"
              value={newScreenName}
              onChange={e => setNewScreenName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreateScreen()}
            />
            <div style={s.row}>
              <button style={s.btnSm} onClick={handleCreateScreen}>Add</button>
              <button style={{ ...s.btnSm, ...s.btnGhost }} onClick={() => setShowNewScreen(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button style={s.addBtn} onClick={() => setShowNewScreen(true)}>+ New Screen</button>
        )}

        <div style={{ flex: 1 }} />
        <div style={s.sideFooter}>
          <a href="/display?screen=main" target="_blank" style={s.footLink}>↗ Open Display</a>
        </div>
      </div>

      {/* Main area */}
      <div style={s.main}>
        {!current ? (
          <div style={s.empty}>
            <div style={s.emptyIcon}>◈</div>
            <div style={s.emptyText}>Select or create a screen</div>
          </div>
        ) : (
          <>
            {/* Screen header */}
            <div style={s.header}>
              <div>
                <div style={s.headerTitle}>{current.name}</div>
                <div style={s.headerSub}>
                  Connect: <code style={s.code}>http://[your-ip]:3333/display?screen={current.id}</code>
                </div>
              </div>
              <div style={s.headerActions}>
                <label style={s.colorLabel}>
                  BG
                  <input
                    type="color"
                    value={current.background || "#0a0a0f"}
                    onChange={e => handleUpdateBackground(e.target.value)}
                    style={s.colorInput}
                  />
                </label>
                <a href={`/display?screen=${current.id}`} target="_blank" style={s.btnSm}>↗ Preview</a>
                <button
                  style={{ ...s.btnSm, ...s.btnDanger }}
                  onClick={() => { deleteScreen(current.id); setActiveScreen(null); }}
                >Delete</button>
              </div>
            </div>

            {/* Widget palette */}
            <div style={s.section}>ADD WIDGET</div>
            <div style={s.palette}>
              {WIDGET_TYPES.map(t => (
                <button key={t.type} style={s.paletteBtn} onClick={() => handleAddWidget(t)}>
                  <span style={s.paletteIcon}>{t.icon}</span>
                  <span style={s.paletteName}>{t.label}</span>
                </button>
              ))}
            </div>

            {/* Widget list */}
            <div style={s.section}>WIDGETS ON THIS SCREEN ({current.widgets?.length || 0})</div>
            <div style={s.widgetList}>
              {(!current.widgets || current.widgets.length === 0) && (
                <div style={s.dim}>No widgets yet — add one above.</div>
              )}
              {current.widgets?.map(w => {
                const def = WIDGET_TYPES.find(t => t.type === w.type);
                return (
                  <div key={w.id} style={s.widgetRow}>
                    <span style={s.wIcon}>{def?.icon ?? "◻"}</span>
                    <div style={s.wMeta}>
                      <span style={s.wType}>{def?.label ?? w.type}</span>
                      <span style={s.wPos}>x:{w.x} y:{w.y} w:{w.w} h:{w.h}</span>
                    </div>
                    <div style={s.wConfig}>
                      {Object.entries(w.config || {}).map(([k, v]) => (
                        <span key={k} style={s.wTag}>{k}: {String(v).slice(0, 20)}</span>
                      ))}
                    </div>
                    <button style={s.wEdit} onClick={() => setEditingWidget(w)} title="Edit">✎</button>
                    <button style={s.wRemove} onClick={() => removeWidget(current.id, w.id)} title="Remove">✕</button>
                  </div>
                );
              })}
            </div>

            {/* Voice settings */}
            <div style={s.section}>VOICE CONTROL</div>
            <div style={s.voiceRow}>
              <label style={s.toggle}>
                <input
                  type="checkbox"
                  checked={current.voiceEnabled ?? true}
                  onChange={e => updateScreen(current.id, { ...current, voiceEnabled: e.target.checked })}
                  style={{ marginRight: "0.5rem" }}
                />
                Enable voice on this screen
              </label>
              <input
                style={{ ...s.input, width: "200px" }}
                placeholder="Wake word"
                value={current.wakeWord ?? "hey display"}
                onChange={e => updateScreen(current.id, { ...current, wakeWord: e.target.value })}
              />
            </div>
          </>
        )}
      </div>

      {/* Widget config editor modal */}
      {editingWidget && current && (
        <WidgetConfigEditor
          widget={editingWidget}
          screenId={current.id}
          onUpdate={updateWidget}
          onClose={() => setEditingWidget(null)}
        />
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const s = {
  root: { display: "flex", height: "100vh", overflow: "hidden", background: "#0d0d14", color: "#c8c8e8", fontFamily: "'Courier New', monospace" },
  sidebar: { width: "220px", borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", padding: "1rem 0", flexShrink: 0 },
  logo: { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0 1rem 1.5rem" },
  logoMark: { fontSize: "1.2rem", color: "#7faaff" },
  logoText: { fontSize: "0.85rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "#e0e0ff" },
  sideSection: { fontSize: "0.55rem", letterSpacing: "0.2em", opacity: 0.3, padding: "0.5rem 1rem 0.25rem", textTransform: "uppercase" },
  screenItem: { display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", cursor: "pointer", transition: "background 0.15s" },
  screenItemActive: { background: "rgba(127,170,255,0.1)", borderRight: "2px solid #7faaff" },
  screenDot: { width: "5px", height: "5px", borderRadius: "50%", background: "#7fff7f", flexShrink: 0 },
  screenName: { fontSize: "0.8rem", flex: 1, color: "#e0e0ff" },
  screenId: { fontSize: "0.6rem", opacity: 0.3 },
  newScreenForm: { padding: "0.5rem 1rem", display: "flex", flexDirection: "column", gap: "0.4rem" },
  addBtn: { margin: "0.5rem 1rem", padding: "0.4rem", background: "rgba(127,170,255,0.1)", border: "1px dashed rgba(127,170,255,0.3)", borderRadius: "6px", color: "#7faaff", cursor: "pointer", fontSize: "0.75rem", fontFamily: "'Courier New', monospace" },
  sideFooter: { padding: "1rem" },
  footLink: { color: "rgba(255,255,255,0.25)", fontSize: "0.7rem", textDecoration: "none" },
  main: { flex: 1, overflow: "auto", padding: "2rem" },
  empty: { height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: 0.2 },
  emptyIcon: { fontSize: "3rem", marginBottom: "1rem" },
  emptyText: { fontSize: "0.8rem", letterSpacing: "0.2em", textTransform: "uppercase" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" },
  headerTitle: { fontSize: "1.4rem", fontWeight: 200, color: "#e0e0ff", letterSpacing: "0.05em" },
  headerSub: { fontSize: "0.7rem", opacity: 0.4, marginTop: "0.25rem" },
  headerActions: { display: "flex", alignItems: "center", gap: "0.5rem" },
  colorLabel: { fontSize: "0.65rem", opacity: 0.5, display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" },
  colorInput: { width: "28px", height: "20px", border: "none", borderRadius: "4px", cursor: "pointer" },
  section: { fontSize: "0.55rem", letterSpacing: "0.2em", opacity: 0.3, marginBottom: "0.75rem", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "0.4rem" },
  palette: { display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "2rem" },
  paletteBtn: { display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 0.75rem", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: "#c8c8e8", cursor: "pointer", fontSize: "0.75rem", transition: "background 0.15s", fontFamily: "'Courier New', monospace" },
  paletteIcon: { fontSize: "1rem" },
  paletteName: {},
  widgetList: { display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "2rem" },
  widgetRow: { display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.75rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px" },
  wIcon: { fontSize: "1rem", flexShrink: 0 },
  wMeta: { display: "flex", flexDirection: "column", gap: "0.1rem", minWidth: "80px" },
  wType: { fontSize: "0.75rem", color: "#e0e0ff" },
  wPos: { fontSize: "0.6rem", opacity: 0.3 },
  wConfig: { display: "flex", flexWrap: "wrap", gap: "0.25rem", flex: 1 },
  wTag: { fontSize: "0.6rem", padding: "0.1rem 0.35rem", background: "rgba(127,170,255,0.1)", borderRadius: "4px", opacity: 0.7 },
  wEdit: { background: "none", border: "none", color: "rgba(127,170,255,0.5)", cursor: "pointer", fontSize: "0.9rem", padding: "0.2rem 0.4rem", borderRadius: "4px" },
  wRemove: { background: "none", border: "none", color: "rgba(255,100,100,0.4)", cursor: "pointer", fontSize: "0.8rem", padding: "0.2rem 0.4rem", borderRadius: "4px" },
  voiceRow: { display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" },
  toggle: { display: "flex", alignItems: "center", fontSize: "0.8rem", cursor: "pointer" },
  input: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#e0e0ff", padding: "0.4rem 0.6rem", fontSize: "0.8rem", outline: "none", fontFamily: "'Courier New', monospace" },
  select: { background: "#0d0d14", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#e0e0ff", padding: "0.4rem 0.6rem", fontSize: "0.8rem", outline: "none", fontFamily: "'Courier New', monospace" },
  checkbox: { accentColor: "#7faaff", width: "14px", height: "14px", cursor: "pointer" },
  row: { display: "flex", gap: "0.4rem" },
  btnSm: { padding: "0.35rem 0.7rem", background: "rgba(127,170,255,0.15)", border: "1px solid rgba(127,170,255,0.3)", borderRadius: "6px", color: "#7faaff", cursor: "pointer", fontSize: "0.72rem", textDecoration: "none", display: "inline-flex", alignItems: "center", fontFamily: "'Courier New', monospace" },
  btnGhost: { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" },
  btnDanger: { background: "rgba(255,80,80,0.1)", borderColor: "rgba(255,80,80,0.3)", color: "rgba(255,120,120,0.8)" },
  btnSave: { padding: "0.4rem 1rem", background: "rgba(127,255,127,0.1)", border: "1px solid rgba(127,255,127,0.3)", borderRadius: "6px", color: "#7fff7f", cursor: "pointer", fontSize: "0.8rem", fontFamily: "'Courier New', monospace" },
  dim: { fontSize: "0.75rem", opacity: 0.3, padding: "0.5rem 0" },
  err: { fontSize: "0.75rem", color: "#ff8080", padding: "0.5rem 1rem" },
  code: { fontFamily: "monospace", background: "rgba(255,255,255,0.06)", padding: "0.1rem 0.3rem", borderRadius: "4px" },
  // Editor modal
  editorOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  editor: { background: "#0d0d14", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "1.5rem", minWidth: "320px", maxWidth: "420px", width: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" },
  editorHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", fontSize: "0.9rem", color: "#e0e0ff" },
  editorSection: { fontSize: "0.5rem", letterSpacing: "0.2em", opacity: 0.3, marginBottom: "0.6rem", marginTop: "1rem", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "0.3rem" },
  fieldRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem", gap: "0.75rem" },
  fieldLabel: { fontSize: "0.75rem", opacity: 0.6, flexShrink: 0 },
  posGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" },
  posField: { display: "flex", flexDirection: "column", gap: "0.25rem" },
  editorActions: { display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1.25rem" },
  closeBtn: { background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: "0.9rem", padding: "0.1rem 0.3rem" },
};
