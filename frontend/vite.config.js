import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    allowedHosts: [
      'f3b2-2806-101e-4-43dd-c9fa-83aa-3278-b209.ngrok-free.app'],
    port: 3010,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://backend:8010",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
