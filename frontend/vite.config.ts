import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/copilot": "http://localhost:8000",
      "/complaints": "http://localhost:8000",
    },
  },
});
