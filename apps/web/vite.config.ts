import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const tokens = {
  bg: "#0b1220",
  accent: "#f59e0b",
};

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "pwa-maskable.svg", "offline.html"],
      manifest: {
        name: "Garage Talk",
        short_name: "GarageTalk",
        theme_color: tokens.bg,
        background_color: tokens.bg,
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
          {
            src: "/pwa-maskable.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        navigateFallback: "/offline.html",
        navigateFallbackDenylist: [/^\/auth/, /^\/billing\/webhooks/],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "shell", networkTimeoutSeconds: 3 },
          },
          {
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              ["/auth", "/feed", "/marketplace", "/videos", "/podcasts", "/rooms", "/live", "/ai"].some((path) =>
                url.pathname.startsWith(path),
              ),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "api-get" },
          },
          {
            urlPattern: ({ url, request }) =>
              request.method === "GET" && url.pathname.startsWith("/garage"),
            handler: "NetworkFirst",
            options: { cacheName: "garage-offline", networkTimeoutSeconds: 2 },
          },
          {
            urlPattern: ({ url, request }) =>
              request.method === "POST" &&
              (url.pathname.startsWith("/feed/posts") ||
                url.pathname.startsWith("/marketplace/listings")),
            handler: "NetworkOnly",
            options: {
              cacheName: "queued-drafts",
              backgroundSync: {
                name: "queued-drafts",
                options: { maxRetentionTime: 24 * 60 },
              },
            },
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
      "/feed": "http://127.0.0.1:3000",
      "/marketplace": "http://127.0.0.1:3000",
      "/uploads": "http://127.0.0.1:3000",
      "/videos": "http://127.0.0.1:3000",
      "/rooms": { target: "http://127.0.0.1:3000", ws: true },
      "/ai": "http://127.0.0.1:3000",
      "/live": "http://127.0.0.1:3000",
      "/webhooks": "http://127.0.0.1:3000",
      "/healthz": "http://127.0.0.1:3000",
      "/readyz": "http://127.0.0.1:3000",
    },
  },
});
