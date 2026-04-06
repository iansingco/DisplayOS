import { useRef, useEffect, useState, useCallback } from "react";
import { useDisplaySocket } from "./hooks/useDisplaySocket.js";
import { useVoiceControl } from "./hooks/useVoiceControl.js";
import { WidgetTile, VoiceHUD, ConnectionBadge } from "./components/index.jsx";

const screenId = new URLSearchParams(window.location.search).get("screen") || "main";
const API = `${window.location.protocol}//${window.location.hostname}:${window.location.port || 3333}`;

export default function App() {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ width: window.innerWidth, height: window.innerHeight });
  const { screen, connected, send } = useDisplaySocket(screenId);
  const { listening, lastTranscript } = useVoiceControl({
    enabled: screen?.voiceEnabled ?? true,
    wakeWord: screen?.wakeWord ?? "hey display",
    send
  });

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      for (const e of entries)
        setDims({ width: e.contentRect.width, height: e.contentRect.height });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Optimistic drag-to-reposition: update locally, then persist via REST
  const handleWidgetMove = useCallback(async (widgetId, newX, newY) => {
    const widget = screen?.widgets?.find(w => w.id === widgetId);
    if (!widget) return;
    const updated = { ...widget, x: newX, y: newY };
    const newWidgets = screen.widgets.map(w => w.id === widgetId ? updated : w);
    // Persist to server — WS will confirm and sync all other clients
    await fetch(`${API}/api/screens/${screenId}/widgets/${widgetId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    }).catch(() => {});
  }, [screen]);

  const widgets = screen?.widgets || [];

  return (
    <div ref={containerRef} style={{width:"100vw",height:"100vh",overflow:"hidden",position:"relative",background:screen?.background||"#0a0a0f",transition:"background 0.8s ease"}}>
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 20% 50%, rgba(40,40,80,0.4) 0%, transparent 60%)",pointerEvents:"none"}}/>
      {dims.width > 0 && widgets.map(widget => (
        <WidgetTile
          key={widget.id}
          widget={widget}
          containerWidth={dims.width}
          containerHeight={dims.height}
          onMove={handleWidgetMove}
        />
      ))}
      {widgets.length === 0 && (
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.12)",fontFamily:"monospace",gap:"0.75rem",pointerEvents:"none"}}>
          <div style={{fontSize:"3rem"}}>⬜</div>
          <div style={{fontSize:"0.8rem",letterSpacing:"0.2em",textTransform:"uppercase"}}>screen: {screenId}</div>
          <div style={{fontSize:"0.65rem",opacity:0.6}}>Open /admin to add widgets</div>
        </div>
      )}
      <ConnectionBadge connected={connected} screenId={screenId} />
      <VoiceHUD listening={listening} lastTranscript={lastTranscript} />
    </div>
  );
}
