import { useEffect, useRef, useState, useCallback } from "react";

export function useDisplaySocket(screenId) {
  const [screen, setScreen] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  const connect = useCallback(() => {
    const host = window.location.hostname;
    // In dev (Vite on :5173) WS server is always on :3333.
    // In prod the display is served from :3333 so location.port is correct.
    const port = import.meta.env.DEV ? 3333 : (window.location.port || 3333);
    const url = `ws://${host}:${port}?screen=${screenId}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };

    ws.onmessage = (e) => {
      try { handleMessage(JSON.parse(e.data)); } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [screenId]);

  function handleMessage(msg) {
    switch (msg.type) {
      case "INIT":
        if (msg.screen) setScreen(msg.screen);
        break;
      case "SCREEN_UPDATED":
        setScreen(msg.screen);
        break;
      case "WIDGETS_UPDATED":
        setScreen(prev => prev ? { ...prev, widgets: msg.widgets } : prev);
        break;
      case "WIDGET_ADDED":
        setScreen(prev => prev ? { ...prev, widgets: [...(prev.widgets || []), msg.widget] } : prev);
        break;
      case "WIDGET_REMOVED":
        setScreen(prev => prev ? { ...prev, widgets: prev.widgets.filter(w => w.id !== msg.widgetId) } : prev);
        break;
    }
  }

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { screen, connected, send };
}
