import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend talks only to the backend API; /api and /images are proxied to it.
const backend = process.env.BACKEND_URL ?? "http://localhost:4000";
export default defineConfig({
  plugins: [react()],
  server: { port: 3000, strictPort: true, proxy: { "/api": backend, "/images": backend } },
  preview: { port: 3000, proxy: { "/api": backend, "/images": backend } },
});
