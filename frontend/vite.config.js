import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'f3b2-2806-101e-4-43dd-c9fa-83aa-3278-b209.ngrok-free.app'],
    port: 3010,
    strictPort: true
  }
});
