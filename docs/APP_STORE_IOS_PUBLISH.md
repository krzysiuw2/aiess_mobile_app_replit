# Publish AIESS to the Apple App Store (v1.0) — Step-by-Step

This guide uses **EAS (Expo Application Services)** for building and submitting. Follow the order below.

---

## Part A: Pre-submission — Safety & Privacy Audit

Do this **before** your first production build and submission.

### A1. Privacy & data handling

- [x] **Privacy Policy URL**
  - Deploy the content from `docs/PRIVACY_POLICY.md` to your aiess.pl website at `https://aiess.pl/aiess-app/privacy`.
  - Paste this URL into App Store Connect when creating the store listing.

- [ ] **App Store "App Privacy" (Nutrition Labels)**
  - In App Store Connect → Your App → **App Privacy**, declare all data types you (and integrated SDKs) collect.
  - For AIESS, declare:
    - **Contact info** → Email address — Purpose: **App functionality** — Linked to the user's identity.
    - **Identifiers** → User ID — Purpose: **App functionality** — Linked to the user's identity.
  - No analytics, no advertising, no tracking — you can leave those sections empty.
  - No IDFA usage — answer "No" when asked.

- [x] **Account deletion (required by Apple)**
  - Implemented at **Settings → Account Settings → Delete My Account**.
  - Uses a Supabase Edge Function (`delete-account`) that:
    1. Deletes `device_users` rows for the user.
    2. Deletes the `user_profiles` row.
    3. Deletes the `auth.users` entry via the admin API.
  - Client-side: clears all `@aiess_*` AsyncStorage keys, clears localStorage (expo-sqlite), clears React Query cache, and navigates to login.
  - Two-step confirmation: first an Alert, then the user must type DELETE (or USUŃ in Polish) to proceed.

### A2. Permissions & usage descriptions (iOS)

All required usage descriptions are set in `app.json` → `expo` → `ios` → `infoPlist`:

- [x] **Microphone** — `NSMicrophoneUsageDescription` — "Allow AIESS to use the microphone."
- [x] **Speech recognition** — `NSSpeechRecognitionUsageDescription` — "Allow AIESS to use speech recognition."
- [x] **Camera** — `NSCameraUsageDescription` — "AIESS uses the camera to scan QR codes when adding devices."
- [x] **Sign in with Apple** — `usesAppleSignIn: true`.
- [x] **Location** — Not used (user enters address manually). No permission needed.

### A3. Export compliance

- [x] **Encryption** — `ITSAppUsesNonExemptEncryption: false` is set in `app.json`.
  - The app uses only standard HTTPS/TLS. No custom encryption.
  - In App Store Connect, answer **"No"** when asked if the app uses non-exempt encryption.

### A4. Content & safety

- [ ] **No placeholder or test content** in the store listing or in-app copy (e.g. "Lorem", test emails, fake data).
- [ ] **Sign-in and auth** — Test Apple Sign-In and Google Sign-In on a real device with the production bundle ID (`com.aiess.mobile`); ensure no debug-only auth bypass.
- [ ] **Sensitive data** — Verify no API keys or secrets are hardcoded in client code; only `EXPO_PUBLIC_*` env vars are used.

### A5. Third-party SDKs

SDKs that handle user data (declare in App Privacy):

| SDK | Data accessed | Purpose |
|-----|--------------|---------|
| Supabase | Email, user ID, profile | Authentication & app functionality |
| Google Sign-In | Email, name | Authentication |
| Apple Sign-In | Email, name | Authentication |
| Expo (SecureStore, Camera, Speech) | Camera frames, audio | App functionality (on-device only, not transmitted) |

No analytics or crash-reporting SDKs are used in v1.0.

---

## Part B: Apple Developer & App Store Connect setup

1. **Apple Developer account**
   - You have an org account. Verify it's active at [developer.apple.com](https://developer.apple.com/account/).

2. **Create the app in App Store Connect**
   - Go to [App Store Connect](https://appstoreconnect.apple.com/) → **My Apps** → **+** → **New App**.
   - Platform: **iOS**
   - Name: **AIESS**
   - Primary language: **English (U.S.)** or **Polish** (your choice)
   - Bundle ID: **com.aiess.mobile** (must match `app.json`)
   - SKU: `com.aiess.mobile`
   - Save.

3. **Note your App Store Connect App ID (ascAppId)**
   - In App Store Connect → Your App → **App Information** (under General in the sidebar).
   - Copy the **Apple ID** (numeric, e.g. `1234567890`).
   - Paste it into `eas.json` → `submit.production.ios.ascAppId` (currently set to `YOUR_ASC_APP_ID` — replace it).

---

## Part C: EAS configuration and credentials

1. **Install EAS CLI and log in**
   ```bash
   npm install -g eas-cli
   eas login
   ```

2. **Update `eas.json` with your ascAppId**
   Replace `YOUR_ASC_APP_ID` with the numeric Apple ID from step B.3:
   ```json
   "submit": {
     "production": {
       "ios": {
         "ascAppId": "1234567890"
       }
     }
   }
   ```

3. **iOS credentials (first time)**
   ```bash
   eas credentials --platform ios
   ```
   - Choose **production** profile.
   - Let EAS create/manage distribution certificate and provisioning profile, or upload your own.
   - For **EAS Submit**: select **Set up your project to use an API Key for EAS Submit**, then **App Store Connect: Manage your API Key** and follow the flow.

4. **App Store Connect API Key (for automated submit)**
   - In [App Store Connect](https://appstoreconnect.apple.com/) → **Users and Access** → **Integrations** → **App Store Connect API** → **Keys**: create an API key with **App Manager** role, download the `.p8` once.
   - When EAS prompts, provide the key or upload it.

---

## Part D: Deploy the Supabase Edge Function

Before building, deploy the `delete-account` edge function:

```bash
supabase functions deploy delete-account
```

Verify it works by calling it from a dev build, or test via curl with a valid JWT.

---

## Part E: Build and versioning

Version is already set to **1.0.0** in `app.json` and `package.json`. Build number is `1` and auto-increments via EAS.

1. **Production build**
   ```bash
   eas build --platform ios --profile production
   ```

2. **Or build + submit in one step**
   ```bash
   eas build --platform ios --profile production --auto-submit
   ```

---

## Part F: Submit to App Store (TestFlight → Review)

1. **Submit the build** (if you didn't use `--auto-submit`):
   ```bash
   eas submit --platform ios --profile production
   ```
   Select the latest production build when prompted. EAS uploads the IPA to App Store Connect. Processing usually takes ~10–15 minutes.

2. **In App Store Connect**
   - Open your app → **TestFlight** tab.
   - When the build appears, you can test internally.
   - To release: go to the **App Store** tab → create a **new version** (1.0.0) → in the **Build** section, select this build.

3. **Store listing and compliance**
   - **Description** — Write a compelling description of AIESS.
   - **Keywords** — e.g. "energy, battery, storage, solar, AI, BESS, monitoring".
   - **Screenshots** — Required sizes: 6.7" (iPhone 15 Pro Max), 6.5" (iPhone 11 Pro Max), 5.5" (iPhone 8 Plus). If `supportsTablet: true`, also iPad screenshots.
   - **Privacy Policy URL** — `https://aiess.pl/aiess-app/privacy`
   - **App Privacy** — Complete the nutrition labels (see A1 above).
   - **Export compliance** — Answer "No" to non-exempt encryption.
   - **IDFA** — Answer "No".
   - **Content rights / age rating** — Complete the questionnaire (likely 4+ rating for a utility app).
   - **Pricing** — Free, all territories.

4. **Submit for review**
   - Add the build, fill in "What's New" (e.g. "Initial release of AIESS — AI-powered energy storage management."), then click **Submit for Review**.
   - Apple typically reviews within 24–48 hours.
   - If rejected, fix the cited issues and upload a new build.

---

## Part G: Post-approval

- [ ] **Release** — Choose "Manually release" or "Automatically release" after approval.
- [ ] **Monitor** — Check App Store Connect for crash reports and reviews.
- [ ] **v1.1 recommendation** — Add Sentry (`@sentry/react-native`) for crash reporting and performance monitoring. Declare "Diagnostics > Crash Data" in App Privacy when you do.
- [ ] **Updates** — For future versions: bump `version` in `app.json`, run `eas build`, then `eas submit`, and create a new version in App Store Connect.

---

## Quick command reference

```bash
# One-time setup
eas login
eas credentials --platform ios
supabase functions deploy delete-account

# Each release
# 1) Bump version in app.json
# 2) Build
eas build --platform ios --profile production

# 3) Submit (or use --auto-submit with build)
eas submit --platform ios --profile production

# Build + submit in one step
eas build --platform ios --profile production --auto-submit
```
