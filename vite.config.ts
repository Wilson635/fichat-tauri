import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 5080,
    strictPort: true,
    host: true,
    allowedHosts: true,
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: 5050,
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
