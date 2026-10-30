# The Android app and device checks

`apps/mobile` wraps the web app in Capacitor 8 (package `fun.nyrgo.app`). Inside the app it is
served as `https://app.nyrgo.fun`, so the API, cookies and CORS behave exactly as on the web.

What the app adds, in `GuardPlugin.java`:

- **Native location with mock detection.** Fixes come from Android's location service with the
  OS's own "mocked" flag (a location spoofing app). The server pauses interactions for 15
  minutes and records a strong anti-cheat signal when it sees one.
- **Play Integrity.** Once a day the app asks Google for an integrity token bound to a
  single-use nonce from the API; the API has Google decode it and checks that the app is the one
  from Google Play, on a device that meets device integrity, for this request. A pass counts for
  24 hours; a failure adds risk (a person decides what follows).
- **The gate.** With `REWARDS_REQUIRE_ATTESTATION=true`, NEAR tips and taking creatures out as
  NFTs need a passed check: only the verified Android app earns NEAR. Playing never needs it.

## Try it now (debug build)

Every CI run builds a debug APK: GitHub → Actions → the latest **CI** run → artifact
**nyrgo-android-debug**. Install it on an Android phone (allow installs from this source). It
plays like the web app and reports mocked locations; Play Integrity only works for the app
installed from Google Play (or with `PLAY_ALLOW_UNRECOGNIZED_APP=true` on testnet).

## Publish to a Google Play testing track

1. **Google Play Console** (one-time 25 USD): create the app **nyrGo!** with package
   `fun.nyrgo.app`.
2. **Upload key**, on your computer, kept safe forever:
   ```bash
   keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 upload.jks    # macOS: base64 -i upload.jks
   ```
   GitHub → Settings → Secrets → Actions: `ANDROID_KEYSTORE_BASE64` (the base64 text),
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`upload`), `ANDROID_KEY_PASSWORD`.
3. Actions → **Android release** → Run: download the `.aab` and upload it to **Testing →
   Internal testing** in Play Console (enable Play App Signing when asked). Add yourself as a
   tester and install from the link Play gives.

## Turn on device checks

1. Play Console → **Test and release → App integrity → Play Integrity API**: link a Google Cloud
   project (or create one).
2. Google Cloud console, that project: enable **Play Integrity API**; **IAM → Service accounts →
   Create** (no role needed) → **Keys → Add key → JSON**.
3. Render, `nyrgo-api` → Environment:
   - `PLAY_INTEGRITY_SERVICE_ACCOUNT` = the whole JSON key (secret)
   - `PLAY_CLOUD_PROJECT_NUMBER` = the project **number** (Cloud console home)
4. Check in the app (Profile shows nothing new; the check runs quietly at start). When it works,
   set `REWARDS_REQUIRE_ATTESTATION=true` to close NEAR rewards to everything else.

iOS (App Attest) comes later: it needs an Apple Developer account and a Mac build.
