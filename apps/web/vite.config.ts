import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['header-800.webp', 'icon-192.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'nyrGo!',
        short_name: 'nyrGo!',
        description: 'Explore, discover and collect original creatures in the real world.',
        lang: 'es',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#e2f8ff',
        theme_color: '#3fb0ee',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        // Never cache gameplay API responses in the service worker: state is server-authoritative.
        navigateFallbackDenylist: [/^\/v1\//, /^\/admin\//, /^\/dev\//],
        // The app shell is precached; the creature art is cached on first sight.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // Take over open pages as soon as the worker is installed, so the first visit already
        // fills the runtime caches below.
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /\/creatures\/.*\.webp$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'creature-art',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
          {
            // Battle sprite sheets and element effects: fetched when a battle starts.
            urlPattern: /\/(sprites|fx)\/.*\.webp$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'battle-art',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
          {
            // Street map tiles already seen: the map keeps working with a weak signal.
            urlPattern: ({ url }) =>
              url.hostname.startsWith('tiles.') || /\/tiles\/.*\.(pbf|mvt)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Static content (the Dex) is versioned with an ETag and safe to show offline.
            urlPattern: ({ url }) => url.pathname === '/v1/dex',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'content', expiration: { maxEntries: 2 } },
          },
          {
            // The player's profile, collection and Dex progress: last known copy when offline.
            urlPattern: ({ url }) =>
              url.pathname === '/v1/me' ||
              url.pathname === '/v1/me/creatures' ||
              url.pathname === '/v1/me/dex',
            handler: 'NetworkFirst',
            options: { cacheName: 'me', networkTimeoutSeconds: 4, expiration: { maxEntries: 6 } },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
  // MapLibre ships its worker as a sibling ES module; pre-bundling would break the relative URL.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
