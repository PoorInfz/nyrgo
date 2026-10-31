import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';

/**
 * Keeps the web app current. The service worker installs a new version as soon as one is
 * published and the page reloads into it; the server is asked for updates when the app comes
 * back to the foreground and every 30 minutes. The Android app ships its own copy of the web app
 * (no service worker there): it updates by installing a newer build.
 */
export function keepUpdated() {
  if (Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => {
        if (navigator.onLine) reg.update().catch(() => undefined);
      };
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
}
