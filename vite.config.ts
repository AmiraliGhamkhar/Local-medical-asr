import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * The Convex browser client insists on an absolute http(s) deployment URL, but
 * a local deployment lives on 127.0.0.1 inside the workspace and the preview is
 * served from a different origin. Proxying `/convex` through the dev server
 * gives the browser a same-origin, TLS-terminated path to the backend without
 * exposing the deployment address to the client.
 */
const CONVEX_TARGET = process.env.CONVEX_PROXY_TARGET ?? "http://127.0.0.1:3210";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    host: "0.0.0.0",
    // HMR stays off: the Freebuff preview owns the dev server lifecycle.
    hmr: false,
    proxy: {
      "/convex": {
        target: CONVEX_TARGET,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    proxy: {
      "/convex": {
        target: CONVEX_TARGET,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
