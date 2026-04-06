export function ConnectionBadge({ connected, screenId }) {
  return (
    <div style={{ position:"fixed", top:"0.75rem", right:"0.75rem", display:"flex", alignItems:"center", gap:"0.4rem", padding:"0.3rem 0.6rem", background:"rgba(0,0,0,0.4)", border:`1px solid ${connected?"rgba(100,255,100,0.2)":"rgba(255,100,100,0.3)"}`, borderRadius:"100px", backdropFilter:"blur(8px)", pointerEvents:"none", zIndex:9999 }}>
      <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:connected?"#7fff7f":"#ff7f7f" }} />
      <span style={{ fontSize:"0.6rem", color:connected?"rgba(180,255,180,0.7)":"rgba(255,180,180,0.9)", fontFamily:"monospace" }}>
        {connected ? screenId : "reconnecting…"}
      </span>
    </div>
  );
}
