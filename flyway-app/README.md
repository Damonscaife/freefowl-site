# Flyway for iPhone

This folder wraps the web game in `../flyway` as a native iOS app with
[Capacitor](https://capacitorjs.com). The game ships inside the app, so it plays
offline. The Xcode project is already generated in `ios/` (Swift Package Manager,
no CocoaPods), with the app icon and splash screen in place.

- App name: **Flyway**
- Bundle ID: `com.freefowl.flyway` (change it in `capacitor.config.json` and in Xcode if you want another)

## What you need

- A Mac with the current Xcode from the Mac App Store
- Node.js 20 or newer (`node -v` to check; get it from nodejs.org)
- Your iPhone and a USB cable
- For TestFlight only: a paid Apple Developer Program membership ($99/year).
  A free Apple ID is enough for the quick test in step 2.

## 1. Get the project onto your Mac

```bash
git clone https://github.com/Damonscaife/freefowl-site.git
cd freefowl-site
git checkout flyway
cd flyway-app
npm install
npm run sync      # copies the game into the app
npm run open      # opens the project in Xcode
```

The first time Xcode opens it, wait for "Resolving packages" to finish (bottom of the window).

## 2. Quick test on your phone (free Apple ID, about 5 minutes)

1. Xcode → Settings → Accounts → **+** → sign in with your Apple ID.
2. In the left sidebar click **App**, then the **App** target → **Signing & Capabilities**.
   Turn on *Automatically manage signing* and pick your name under **Team**.
   If Xcode says the bundle ID is taken, change it to something like `com.damonscaife.flyway`.
3. On the iPhone: Settings → Privacy & Security → **Developer Mode** → on (it restarts).
4. Plug the phone in, pick it in the device menu at the top of Xcode, press **Run** (▶).
5. First launch only: on the phone go to Settings → General → VPN & Device Management,
   tap your Apple ID, and choose **Trust**.

With a free Apple ID the app stops opening after 7 days; just press Run again.

## 3. TestFlight (paid Developer Program)

1. Enroll at developer.apple.com/programs if you haven't.
2. In App Store Connect (appstoreconnect.apple.com) → **Apps** → **+** → **New App**:
   platform iOS, name *Flyway* (if taken, try *Flyway: Bird Migration*),
   bundle ID `com.freefowl.flyway`, SKU `flyway`.
3. In Xcode, set **Team** to your paid team. Under the App target → General, keep
   Version `1.0` and set Build to `1`.
4. Device menu → **Any iOS Device (arm64)**, then Product → **Archive**.
5. When the Organizer window opens: **Distribute App** → **App Store Connect** → **Upload**.
6. After it finishes processing (often 10–30 minutes), App Store Connect → your app →
   **TestFlight** → add yourself under *Internal Testing*.
7. Install the **TestFlight** app on your iPhone and accept the invite.

## Updating the app after game changes

```bash
cd freefowl-site && git pull
cd flyway-app && npm run sync
```

Then in Xcode raise the **Build** number by 1 and Archive/Upload again (step 3.4–3.5).

## Notes for the App Store listing

- Privacy: the game collects no data (progress is saved on the device only), so the
  App Privacy answer is *Data Not Collected*.
- `ITSAppUsesNonExemptEncryption` is already set to `false`, so uploads skip the
  export-compliance question.
- Icon source: `assets/icon-only.png` (1024×1024). Splash: `assets/splash.png`.
  After changing either, run `npm run icons`.

## App Store screenshots and preview

`assets/appstore/` holds draft store assets made from the web build:

- `iphone69-*.jpg`: five 6.9 inch iPhone screenshots (1320 x 2868) with captions
- `ipad13-*.jpg`: five 13 inch iPad screenshots (2064 x 2752) with captions
- `app-preview-iphone69-draft.mp4`: a 30 second App Preview (886 x 1920, 30 fps, silent audio track)

They were rendered in a software browser, so motion in the preview is smoother on a real device.
For the final upload, record the preview on an iPhone (Control Center screen recording) once the
build is on TestFlight, and retake the screenshots there if anything looks off.
To regenerate the drafts: serve the repo root (`python3 -m http.server 8765`), then run
`python3 scripts/store.py` and `python3 scripts/preview.py` (needs Playwright and ffmpeg for the trim).
