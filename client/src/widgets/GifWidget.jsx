export function GifWidget({ config = {} }) {
  const { url="", objectFit="cover", label="" } = config;
  if (!url) return (
    <div style={{ width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(255,255,255,0.03)",color:"rgba(255,255,255,0.3)",gap:"0.5rem",fontFamily:"monospace" }}>
      <span style={{fontSize:"2rem"}}>🖼️</span><span style={{fontSize:"0.8rem"}}>No image URL set</span>
    </div>
  );
  return (
    <div style={{ width:"100%",height:"100%",position:"relative",overflow:"hidden" }}>
      <img src={url} alt={label} style={{ width:"100%",height:"100%",objectFit,display:"block" }} />
      {label&&<div style={{ position:"absolute",bottom:"0.5rem",left:"0.5rem",background:"rgba(0,0,0,0.6)",color:"#fff",padding:"0.2rem 0.5rem",borderRadius:"4px",fontSize:"0.75rem" }}>{label}</div>}
    </div>
  );
}
