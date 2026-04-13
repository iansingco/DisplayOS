import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/admin/" : "/",
  build: { outDir: "dist" },
  server: {
    port: 5174,
    host: true,
    proxy: {
      "/api": "http://localhost:3333",
      "/ws":  { target: "ws://localhost:3333", ws: true },
    }
  }
}));
