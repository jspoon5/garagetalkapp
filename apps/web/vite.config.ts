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
      includeAssets: ["favicon.svg", "pwa-maskable.svg", "pwa-192.png", "pwa-512.png", "apple-touch-icon.png", "offline.html"],
      manifest: {
        name: "Garage Talk",
        short_name: "GarageTalk",
        theme_color: tokens.bg,
        background_color: tokens.bg,
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
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
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          /^\/auth/,
          /^\/billing/,
          /^\/garage/,
          /^\/api/,
          /^\/healthz/,
          /^\/readyz/,
          /^\/uploads/,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "shell", networkTimeoutSeconds: 3 },
          },
          {
            // Public catalog-ish GETs only — never cache auth/billing/garage private data.
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              ["/feed", "/marketplace", "/videos", "/podcasts", "/rooms", "/live", "/shops", "/gifts"].some((path) =>
                url.pathname.startsWith(path),
              ),
            handler: "NetworkFirst",
            options: { cacheName: "api-public-get", networkTimeoutSeconds: 3 },
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
      "/podcasts": "http://127.0.0.1:3000",
      "/rooms": { target: "http://127.0.0.1:3000", ws: true },
      "/ai": "http://127.0.0.1:3000",
      "/live": "http://127.0.0.1:3000",
      "/billing": "http://127.0.0.1:3000",
      "/shops": "http://127.0.0.1:3000",
      "/spatial": "http://127.0.0.1:3000",
      "/me": "http://127.0.0.1:3000",
      // API under /admin/* — not the SPA path `/admin` itself
      "/admin/users": "http://127.0.0.1:3000",
      "/admin/dashboard": "http://127.0.0.1:3000",
      "/admin/moderation": "http://127.0.0.1:3000",
      "/admin/settings": "http://127.0.0.1:3000",
      "/admin/shops": "http://127.0.0.1:3000",
      "/admin/r2r": "http://127.0.0.1:3000",
      "/admin/reconciliation": "http://127.0.0.1:3000",
      "/coins": "http://127.0.0.1:3000",
      "/gifts": "http://127.0.0.1:3000",
      "/diagnostics": "http://127.0.0.1:3000",
      "/webhooks": "http://127.0.0.1:3000",
      "/healthz": "http://127.0.0.1:3000",
      "/readyz": "http://127.0.0.1:3000",
    },
  },
});
