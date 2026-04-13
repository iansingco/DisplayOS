import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/display/" : "/",
  build: { outDir: "dist" },
  server: {
    port: 5173,
    host: true,          // expose on LAN so other devices can reach it in dev
    proxy: {
      "/api": "http://localhost:3333",
      "/ws":  { target: "ws://localhost:3333", ws: true },
    }
  }
}));
