# Publishing NomadGuide as a Mobile App

Since your app is built using Next.js, and natively uses secure browser APIs (like geolocation and speech-to-text), you actually have **two different paths** to turn this into a mobile app. 

I've already fully configured **Option 1** for you within the codebase, which means you can have a "Mobile App" deployed today for free. Option 2 requires a bit more developer tooling (like Xcode/Android Studio).

---

## Option 1: The Fast Path — Progressive Web App (PWA)
**Cost:** Free | **Setup Time:** 2 Minutes | **Distribution:** Direct Link

A PWA is a modern web application that physically integrates with the iOS and Android operating systems. When a user visits your app link, they can click "Add to Home Screen". It will download locally, get its own app icon, remove the Safari/Chrome address bar entirely, and behave *identically* to a native app without going through the App Store review process!

### What I just did:
I just injected exactly what iOS and Android look for into your app:
1. Created a `public/manifest.json` file.
2. Injected strict PWA configurations into your `src/app/layout.tsx` (like locking the viewport from zooming and configuring the Apple standalone status bar).

### Your Next Steps:
1. Find a 192x192 base PNG image you want as your app icon and safely save it at `public/icon.png`.
2. Push your changes and deploy to your Firebase App Hosting!
3. Open the Firebase link on your iPhone. Tap the `[Share]` icon on Safari -> `[Add to Home Screen]`.
4. Run it! You now have a standalone NomadGuide app icon on your phone!

---

## Option 2: The Native Path — capacitor.js
**Cost:** $99/yr Apple, $25 Android | **Setup Time:** 2-3 Hours | **Distribution:** App Stores

If you want the app physically listed in the iOS App Store and Google Play Store, you need to wrap your live web code inside a native container. Because your app relies on secure backend Firebase AI logic, you cannot run everything client-side statically.

You will use **Capacitor**, a framework by Ionic that essentially builds a blank Native iOS/Android app that securely loads your hosted Next.js production URL but provides access to low-level native hardware modules.

### Step-by-Step Guide:

**1. Install Capacitor to the Mobile App:**
```bash
npm i @capacitor/core
npm i -D @capacitor/cli
npx cap init NomadGuide com.nomadguide.app
npm i @capacitor/ios @capacitor/android
```

**2. Configure Capacitor:**
Open `capacitor.config.ts` and set your live Firebase web address as the server URL:
```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nomadguide.app',
  appName: 'NomadGuide',
  webDir: 'public',
  server: {
    // Point this to your live Firebase App Hosting URL
    url: 'https://nomadguide-[id].web.app',
    cleartext: true
  }
};
export default config;
```

**3. Build and Open the Native Projects:**
```bash
npx cap add ios
npx cap add android
npx cap sync
```

**4. Compile in Xcode / Android Studio:**
- Open the `.xcworkspace` file located inside the newly generated `/ios` folder using **Xcode** on a Mac.
- You will be able to hit **"Run"** in Xcode to physically simulate the iOS App on a fake iPhone.
- From there, you just need an Apple Developer Account to archive and submit it to the iOS App Store!
