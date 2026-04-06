import { useState, useEffect, useCallback } from "react";

const BASE = "/api";

export function useAdminAPI() {
  const [screens, setScreens] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchScreens = useCallback(async () => {
    try {
      const data = await fetch(`${BASE}/screens`).then(r => r.json());
      setScreens(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchScreens(); }, [fetchScreens]);

  const createScreen = useCallback(async (id, name) => {
    const screen = {
      id, name,
      layout: "grid",
      background: "#0a0a0f",
      voiceEnabled: true,
      wakeWord: "hey display",
      widgets: []
    };
    await fetch(`${BASE}/screens/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(screen)
    });
    await fetchScreens();
    return screen;
  }, [fetchScreens]);

  const deleteScreen = useCallback(async (id) => {
    await fetch(`${BASE}/screens/${id}`, { method: "DELETE" });
    await fetchScreens();
  }, [fetchScreens]);

  const addWidget = useCallback(async (screenId, widgetDef) => {
    const res = await fetch(`${BASE}/screens/${screenId}/widgets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(widgetDef)
    });
    const widget = await res.json();
    await fetchScreens();
    return widget;
  }, [fetchScreens]);

  const removeWidget = useCallback(async (screenId, widgetId) => {
    await fetch(`${BASE}/screens/${screenId}/widgets/${widgetId}`, { method: "DELETE" });
    await fetchScreens();
  }, [fetchScreens]);

  const updateWidget = useCallback(async (screenId, widgetId, patch) => {
    await fetch(`${BASE}/screens/${screenId}/widgets/${widgetId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    await fetchScreens();
  }, [fetchScreens]);

  const updateScreen = useCallback(async (screenId, patch) => {
    await fetch(`${BASE}/screens/${screenId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    await fetchScreens();
  }, [fetchScreens]);

  return {
    screens, loading, error,
    createScreen, deleteScreen,
    addWidget, removeWidget, updateWidget, updateScreen,
    refresh: fetchScreens
  };
}
