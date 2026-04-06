import { useState } from "react";
export function IframeWidget({ config = {} }) {
  const { url="", label="", zoom=1 } = config;
  const [error, setError] = useState(false);
  if (!url||error) return (
    <div style={{ width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(255,255,255,0.03)",color:"rgba(255,255,255,0.3)",gap:"0.5rem",fontFamily:"monospace" }}>
      <span style={{fontSize:"2rem"}}>🌐</span>
      <span style={{fontSize:"0.8rem"}}>{error?"Site blocks embeds":"No URL set"}</span>
      {url&&<a href={url} target="_blank" rel="noreferrer" style={{color:"#7faaff",fontSize:"0.8rem"}}>Open directly ↗</a>}
    </div>
  );
  return (
    <div style={{ width:"100%",height:"100%",display:"flex",flexDirection:"column",overflow:"hidden" }}>
      {label&&<div style={{ padding:"0.25rem 0.75rem",background:"rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.5)",fontSize:"0.7rem",letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"monospace" }}>{label}</div>}
      <div style={{ flex:1,overflow:"hidden" }}>
        <iframe src={url} title={label||url} style={{ border:"none",width:"100%",height:"100%",display:"block" }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" onError={()=>setError(true)} loading="lazy" />
      </div>
    </div>
  );
}
