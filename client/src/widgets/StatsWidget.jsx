import { useState, useEffect } from "react";
export function StatsWidget({ config = {} }) {
  const [stats, setStats] = useState(null);
  const { refresh=2000 } = config;
  useEffect(() => {
    let cancelled = false;
    async function load() { try { const d = await fetch("/api/stats").then(r=>r.json()); if(!cancelled) setStats(d); } catch {} }
    load(); const id = setInterval(load, refresh);
    return () => { cancelled=true; clearInterval(id); };
  }, [refresh]);
  const bars = [
    { label:"CPU", value:stats?.cpu??null, color:"#7faaff" },
    { label:"RAM", value:stats?.ram??null, color:"#7fffaa" },
    { label:"DISK", value:stats?.disk??null, color:"#ffaa7f" },
  ];
  return (
    <div style={{ width:"100%",height:"100%",display:"flex",flexDirection:"column",justifyContent:"center",gap:"0.75rem",padding:"1rem",fontFamily:"'Courier New',monospace",color:"#e0e0ff" }}>
      {bars.map(({label,value,color})=>(
        <div key={label} style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
          <span style={{width:"3rem",fontSize:"0.65rem",opacity:0.5,letterSpacing:"0.1em"}}>{label}</span>
          <div style={{flex:1,height:"4px",background:"rgba(255,255,255,0.08)",borderRadius:"2px",overflow:"hidden"}}>
            <div style={{height:"100%",width:`${value??0}%`,background:color,borderRadius:"2px",transition:"width 0.5s ease"}} />
          </div>
          <span style={{width:"2.5rem",fontSize:"0.7rem",textAlign:"right",color}}>{value!==null?`${value}%`:"—"}</span>
        </div>
      ))}
      {stats?.uptime&&<div style={{fontSize:"0.6rem",opacity:0.3,textAlign:"center",letterSpacing:"0.2em"}}>{`UP ${Math.floor(stats.uptime/3600)}h ${Math.floor((stats.uptime%3600)/60)}m`}</div>}
    </div>
  );
}
