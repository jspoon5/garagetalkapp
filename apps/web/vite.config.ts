import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Garage Talk",
        short_name: "GarageTalk",
        theme_color: "#0b1220",
        background_color: "#0b1220",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api"),
            handler: "NetworkFirst",
            options: { cacheName: "api-get", networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
  },
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://127.0.0.1:3000",
      "/garage": "http://127.0.0.1:3000",
      "/uploads": "http://127.0.0.1:3000",
      "/videos": "http://127.0.0.1:3000",
      "/webhooks": "http://127.0.0.1:3000",
      "/healthz": "http://127.0.0.1:3000",
      "/readyz": "http://127.0.0.1:3000",
    },
  },
});
