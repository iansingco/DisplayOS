import { useState, useEffect } from "react";
export function ClockWidget({ config = {} }) {
  const [time, setTime] = useState(new Date());
  const { showDate=true, showSeconds=true, format24=false } = config;
  useEffect(() => { const id = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(id); }, []);
  const h = format24 ? String(time.getHours()).padStart(2,"0") : String(time.getHours()%12||12).padStart(2,"0");
  const m = String(time.getMinutes()).padStart(2,"0");
  const s = String(time.getSeconds()).padStart(2,"0");
  const ampm = format24 ? "" : time.getHours()>=12?" PM":" AM";
  return (
    <div style={{ width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Courier New',monospace",color:"#e0e0ff",userSelect:"none" }}>
      <div style={{ fontSize:"clamp(2rem,8vw,6rem)",fontWeight:200,letterSpacing:"0.05em" }}>
        {h}:{m}{showSeconds&&<span style={{opacity:0.5,fontSize:"0.6em"}}>:{s}</span>}<span style={{fontSize:"0.35em",opacity:0.7,marginLeft:"0.2em"}}>{ampm}</span>
      </div>
      {showDate&&<div style={{marginTop:"0.5rem",fontSize:"clamp(0.7rem,2vw,1.1rem)",opacity:0.5,letterSpacing:"0.2em",textTransform:"uppercase"}}>{time.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</div>}
    </div>
  );
}
