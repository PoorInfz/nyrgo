import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'nyrgo',
        short_name: 'nyrgo',
        description: 'Explore, discover and collect original creatures in the real world.',
        lang: 'es',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1720',
        theme_color: '#0f1720',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // Never cache API responses in the service worker: gameplay state is server-authoritative.
        navigateFallbackDenylist: [/^\/v1\//, /^\/admin\//, /^\/dev\//],
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
