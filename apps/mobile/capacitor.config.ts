import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android app serves the built web app from the device, under the game's own address
 * (https://app.nyrgo.fun inside the app), so the API sees the same origin and session cookie as
 * on the web. Nothing is loaded from the network but the API, the map tiles and the art.
 */
const config: CapacitorConfig = {
  appId: 'fun.nyrgo.app',
  appName: 'nyrGo!',
  webDir: '../web/dist',
  server: {
    androidScheme: 'https',
    hostname: 'app.nyrgo.fun',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
