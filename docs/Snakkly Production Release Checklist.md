# Snakkly Production Release Checklist

Oct 23, 2026 · @Mujtaba

## Why your build talks to localhost

The app has no production API URL baked in, so `src/config.ts` guesses one. Snakkly is two deployables: the Next.js backend (`app/api/*`, Neon Postgres, Azure/OpenAI, RevenueCat webhook) and the Expo app (Android, iOS, web), which finds the backend through `API_BASE_URL`.

When `EXPO_PUBLIC_API_URL` is not set at build time, `deriveApiBaseUrl()` falls back in this order:

1. The Metro host's LAN IP on port 3000 (a development build loads JS from Metro, so this is your PC).
2. `http://10.0.2.2:3000` on Android (the emulator's alias for your PC).
3. `http://localhost:3000`.

It also ignores an env URL containing `localhost` or `10.0.2.2` whenever it detects a LAN Metro host. On a phone, none of these reach a real server.

Two more facts matter here. The `development` profile in `eas.json` builds a **dev client**: it always loads code from your PC's Metro server, so it is the wrong build to test production with. Android release builds also block plain `http://` traffic, so the production URL must be `https://`.

## Point the app at production

Set `EXPO_PUBLIC_API_URL` in EAS and build with the `preview` or `production` profile; the app then uses that URL and never guesses. Every `eas.json` profile now names its EAS environment (`development`, `preview`, `production`), and `preview` builds an installable APK.

1. Deploy the backend first and confirm `https://<api-host>/api/config/tiers` returns JSON from your phone's browser. The examples below use `https://app.snakkly.no`.
2. Add the app variables to EAS, once per environment:

   ```bash
   eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://app.snakkly.no --visibility plaintext
   eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://dev.snakkly.no --visibility plaintext
   ```

   Repeat for the Google client IDs and RevenueCat public keys (the `EXPO_PUBLIC_*` block in `.env.production.example`). Check with `eas env:list --environment production`.
3. Build a test APK that talks to production and install it on your phone:

   ```bash
   eas build --platform android --profile preview
   ```
4. When it works, build the store bundle:

   ```bash
   eas build --platform android --profile production
   eas build --platform ios --profile production
   ```
5. Keep using the `development` profile with `npm run dev:all` for day-to-day work; it is meant to hit your PC.

`EXPO_PUBLIC_*` values are compiled into the app, so changing one needs a new build. The web build reads the same variables: set them on the host when you run `npx expo export --platform web`.

## Production environment variables

The template is `.env.production.example` in the repo root: 25 backend keys (including NODE\_ENV) go on the server host, 7 `EXPO_PUBLIC_*` keys go into EAS. Use new production values; reuse nothing from `.env.local`, and never upload a `.env` file to a build.

| Key | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Server | Neon pooled connection (runtime) |
| `DIRECT_DATABASE_URL` | Server | Neon direct connection (migrations) |
| `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL` | Server | Public backend URL, used in email links and auth callbacks |
| `REFERRAL_LINK_BASE_URL` | Server | `https://snakkly.no` for `/r/<code>` links and the legal pages (`/vilkar`, `/personvern`) |
| `SUPPORT_EMAIL` | Server | `support@snakkly.no`, shown in the app, in emails and on the website (`NEXT_PUBLIC_SUPPORT_EMAIL` there) |
| `JWT_SECRET`, `BETTER_AUTH_SECRET`, `ADMIN_SECRET` | Server | Random 48-byte secrets; missing ones fall back to hard-coded dev values |
| `AI_PROVIDER`, `AZURE_OPENAI_*` (6 keys) | Server | Azure Foundry chat and evaluation models |
| `STT_PROVIDER` | Server | `azure-speech` (600 RPM, no deployment needed) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID` | Server | OAuth client IDs whose tokens the server accepts |
| `RESEND_API_KEY`, `EMAIL_FROM` | Server | Verification emails from a verified domain |
| `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH` | Server | Subscription sync and webhook auth |
| `EXPO_PUBLIC_API_URL` | EAS | The `https://` backend URL |
| `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` (3 keys) | EAS | Google Sign-In per platform |
| `EXPO_PUBLIC_REVENUECAT_*_KEY` (3 keys) | EAS | RevenueCat public SDK keys |

**Leave out in production:** `OPENAI_API_KEY`, `ELEVEN_*` and `AZURE_OPENAI_WHISPER_DEPLOYMENT` are only used with `AI_PROVIDER=openai` or `STT_PROVIDER=azure-openai`. `REACT_NATIVE_API_URL` is a legacy alias of `EXPO_PUBLIC_API_URL`.

**Missing from your current `.env.local`:** `ADMIN_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_SECRET`, the platform Google client IDs and `REFERRAL_LINK_BASE_URL`. Without `ADMIN_SECRET` the admin panel accepts `admin123`.

## Backend deployment

The backend has no host yet; Vercel is the simplest fit for Next.js 16 and Neon, and any Node 24 host running `npm run build && npm start` also works.

- [ ] Create a separate Neon **production** branch or project; keep dev data out of it.
- [ ] Run migrations against it: `DIRECT_DATABASE_URL=<prod> npm run db:migrate` (applies `drizzle/0000`–`0006`). Use `db:migrate`, not `db:push`, in production.
- [ ] Seed exam content: `npm run db:seed:norskprove` against the production DB, then check the admin panel lists the themes.
- [ ] Deploy the backend and set every server key from the table above; set Node version to 24 (`.nvmrc`).
- [ ] Point a domain (e.g. `app.snakkly.no`) at the host with HTTPS; set `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` to it.
- [ ] Raise the function timeout to at least 60 s: an exam turn chains speech-to-text, the LLM and TTS, and the app waits up to 35 s.
- [ ] Restrict CORS: `proxy.ts` sends `Access-Control-Allow-Origin: *`. Limit it to the web app's origin (native apps don't need CORS).
- [ ] Make the server refuse to start without `JWT_SECRET`, `BETTER_AUTH_SECRET` and `ADMIN_SECRET` when `NODE_ENV=production`, instead of falling back to the dev defaults in `lib/auth.ts`, `lib/better-auth.ts` and `lib/admin-auth.ts`.
- [ ] Verify the Resend sending domain (SPF and DKIM on `snakkly.no`) and send a real verification email.
- [ ] Raise Azure TPM quotas on the chat and evaluation deployments for expected peak users (AZURE\_AI\_FOUNDRY\_SETUP.md).
- [ ] Run `npm test` and `npm run build` locally before each deploy.
- [ ] Deploy the web app (`npx expo export --platform web`) to its own host, with the `EXPO_PUBLIC_*` keys set, if you ship a web version.

## Payments and RevenueCat

Payments go live once the RevenueCat webhook points at the production backend and real store products exist. Full setup is in PAYMENTS.md.

- [ ] Create the products `snakkly.standard.monthly` and `snakkly.premium.monthly` in Play Console and App Store Connect (ids cannot change later).
- [ ] Attach them to the RevenueCat entitlements and the default offering.
- [ ] Set the RevenueCat webhook URL to `https://app.snakkly.no/api/revenuecat/webhook` with the same `Authorization` value as `REVENUECAT_WEBHOOK_AUTH`.
- [ ] Connect Play (service account and real-time developer notifications) and App Store (In-App Purchase key and App Store Server Notifications) in RevenueCat.
- [ ] Switch RevenueCat Web Billing from Stripe test mode to live, if you sell on the web.
- [ ] Use the production keys: `goog_`, `appl_` and `rcb_` in EAS, the secret key on the server.
- [ ] Test a purchase, upgrade, restore and cancel with license testers (Android) and Sandbox accounts (iOS); confirm the user's tier changes in the database.
- [ ] Make sure the Android app never links to web checkout (Play policy).

## Mobile release

Two blockers come first: account deletion does not exist yet, and the Android keystore with its passwords is committed to git. The Play steps are covered in detail in GOOGLE\_PLAY\_RELEASE.md.

**Blockers**

- [ ] Remove the signing files from git: `git rm --cached credentials.json credentials/android/keystore.jks` and commit (`.gitignore` now ignores them). They stay in history, so if this GitHub repo is public or shared, treat that key as leaked and ask Play support to reset the upload key.
- [ ] Store the keystore and its passwords in a password manager.
- [ ] Add account deletion: an API endpoint, a button in the app, and a public page such as `https://snakkly.no/slett-konto`. Both Play and the App Store require it; no delete endpoint exists in `app/api/auth`.
- [x] Publish the privacy policy and terms at public URLs on snakkly.no, matching the in-app screens: `https://snakkly.no/personvern` and `https://snakkly.no/vilkar` (`?lang=en` for English). Replace the `OPERATOR` placeholder in the website's `lib/legal.ts` first.
- [ ] In Play Console, set the privacy policy URL to `https://snakkly.no/personvern` and the account deletion URL to `https://snakkly.no/personvern#slett-konto`. Deletion requests currently arrive by email ("Delete account" in the app menu opens a pre-filled mail to `SUPPORT_EMAIL`).

**Android**

- [ ] Add the Play App Signing SHA-1 to the Android OAuth client in Google Cloud, or Google Sign-In fails with `DEVELOPER_ERROR` in Play builds.
- [ ] Add both SHA-256 fingerprints to `assetlinks.json` in the website repo so `/r/<code>` links open the app.
- [ ] Remove `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK` from `app.json` unless background audio is needed; otherwise Play asks for a declaration video.
- [ ] Complete Data safety (microphone audio, AI processing, payments), content rating and target audience.
- [ ] Internal testing, then closed testing (12 testers for 14 days on a personal developer account), then production.

**iOS**

- [ ] Enable Sign in with Apple (the `/api/auth/apple` route exists); Apple requires it when Google Sign-In is offered.
- [ ] Add an iOS OAuth client in Google Cloud and set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `GOOGLE_IOS_CLIENT_ID`.
- [ ] Host `apple-app-site-association` on snakkly.no for the `applinks` in `app.json`.
- [ ] Fill in App Privacy details and submit through TestFlight: `eas submit --platform ios --profile production`.

**Both**

- [ ] Set `version` in `app.json` (currently 1.0.0); EAS increments build numbers automatically.
- [ ] Prepare screenshots, descriptions in Norwegian and English, and a support email.

## Security, monitoring and launch day

Rotate every key that has lived in `.env.local` on a dev machine, then watch errors and AI spend closely for the first week.

- [ ] Create new production keys for Azure, Resend, RevenueCat and Neon rather than reusing dev keys.
- [ ] Protect the admin panel: a long `ADMIN_SECRET`, and ideally an IP allowlist or host-level auth on `/admin`.
- [ ] Add rate limiting to `/api/auth/*` and the exam endpoints; each exam turn costs AI money.
- [ ] Set budget alerts in Azure and Neon, and spending limits where available.
- [ ] Add error tracking (e.g. Sentry for Next.js and Expo) and uptime checks on `/api/config/tiers`.
- [ ] Turn on Neon point-in-time restore and note how to roll back a deploy.

**Launch-day smoke test** on a Play or TestFlight build, on mobile data rather than Wi-Fi:

1. Register with email and receive the verification email.
2. Sign in with Google, and with Apple on iOS.
3. Complete a full exam and see results.
4. Buy a subscription and confirm the quota changes.
5. Open a `https://snakkly.no/r/<code>` referral link and confirm it opens the app.
6. Delete the account and confirm the data is gone.
