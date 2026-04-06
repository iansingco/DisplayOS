import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/admin/",
  build: { outDir: "dist" },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3333",
      "/ws": { target: "ws://localhost:3333", ws: true }
    }
  }
});
