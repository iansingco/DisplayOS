export function VoiceHUD({ listening, lastTranscript }) {
  return (
    <div style={{ position:"fixed", bottom:"1rem", right:"1rem", display:"flex", alignItems:"center", gap:"0.5rem", padding:"0.4rem 0.75rem", background:listening?"rgba(100,200,100,0.15)":"rgba(255,255,255,0.04)", border:`1px solid ${listening?"rgba(100,255,100,0.3)":"rgba(255,255,255,0.08)"}`, borderRadius:"100px", backdropFilter:"blur(8px)", transition:"all 0.3s ease", pointerEvents:"none", zIndex:9999 }}>
      <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:listening?"#7fff7f":"rgba(255,255,255,0.2)", boxShadow:listening?"0 0 8px #7fff7f":"none" }} />
      <span style={{ fontSize:"0.65rem", color:listening?"rgba(180,255,180,0.8)":"rgba(255,255,255,0.2)", fontFamily:"monospace", maxWidth:"200px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {listening ? (lastTranscript || "Listening…") : "Voice off"}
      </span>
    </div>
  );
}
