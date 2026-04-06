import { useState, useEffect } from "react";
export function WeatherWidget({ config = {} }) {
  const { city="New York", units="fahrenheit" } = config;
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`).then(r=>r.json());
        if (!geo.results?.length) throw new Error("City not found");
        const { latitude, longitude, name, country_code } = geo.results[0];
        const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m&temperature_unit=${units}&wind_speed_unit=mph&timezone=auto`).then(r=>r.json());
        if (!cancelled) setWeather({ temp:Math.round(w.current.temperature_2m), code:w.current.weathercode, wind:Math.round(w.current.windspeed_10m), humidity:w.current.relativehumidity_2m, name, country:country_code?.toUpperCase(), unit:units==="fahrenheit"?"°F":"°C" });
      } catch(e) { if (!cancelled) setError(e.message); }
    }
    load();
    const id = setInterval(load, 600000);
    return () => { cancelled=true; clearInterval(id); };
  }, [city, units]);
  const icons = {0:"☀️",1:"⛅",2:"⛅",3:"☁️"};
  const icon = weather ? (icons[weather.code] ?? (weather.code<=49?"🌫️":weather.code<=69?"🌧️":weather.code<=79?"🌨️":"⛈️")) : "🌡️";
  return (
    <div style={{ width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Courier New',monospace",color:"#e0e0ff",gap:"0.3rem",userSelect:"none" }}>
      {error ? <span style={{opacity:0.4,fontSize:"0.75rem",color:"#ff8080"}}>{error}</span>
      : !weather ? <span style={{opacity:0.4,fontSize:"0.8rem"}}>Loading...</span>
      : <>
          <div style={{fontSize:"clamp(2rem,6vw,4rem)"}}>{icon}</div>
          <div style={{fontSize:"clamp(1.5rem,5vw,3.5rem)",fontWeight:200}}>{weather.temp}{weather.unit}</div>
          <div style={{fontSize:"clamp(0.6rem,1.5vw,0.9rem)",opacity:0.5,letterSpacing:"0.15em",textTransform:"uppercase"}}>{weather.name}, {weather.country}</div>
          <div style={{display:"flex",gap:"1rem",fontSize:"clamp(0.6rem,1.2vw,0.8rem)",opacity:0.6}}><span>💨 {weather.wind} mph</span><span>💧 {weather.humidity}%</span></div>
        </>}
    </div>
  );
}
