# Publishing Snakkly to Google Play (from scratch)

A step-by-step checklist for taking Snakkly from zero to a live listing on Google Play. It covers accounts, Play subscriptions, RevenueCat, builds, testing and review.

> **Android sells subscriptions through Google Play Billing**, via RevenueCat (`react-native-purchases`). iOS uses the App Store and the web uses RevenueCat Web Billing (Stripe), all through the same RevenueCat project and entitlements.
>
> **Play policy:** inside the Android app, payments must go through Play Billing. Don't add links or text that steer Android users to pay on the website.

How the payment code works is described in [PAYMENTS.md](./PAYMENTS.md). This document covers only **setup and release**.

> Google changes Play Console menus and policies often. If a menu name below doesn't match, use the search bar at the top of Play Console. The requirement itself is usually still there.

**Fixed values used throughout**

| Thing | Value | Where it's defined |
|---|---|---|
| Package name | `com.snakkly.app` | `app.json` → `android.package` |
| Standard product id (all stores) | `snakkly.standard.monthly` | `src/lib/iap-products.ts` |
| Premium product id (all stores) | `snakkly.premium.monthly` | `src/lib/iap-products.ts` |
| Default prices | 149 kr / 299 kr per month | Play Console (charged), `tier_configs` (fallback label only) |
| Public website | `https://snakkly.no` | separate repo `snakkly-frontend-website` |
| API host | `https://<api-host>` (your deployed Next.js backend) | |

The package name and product ids **can never be changed or reused** after you create them in Play Console. Double-check them before you create anything.

---

## Overview: order of operations

1. Create the Google Play developer account and verify your identity.
2. Set up the payments profile (merchant account) so Google can pay you.
3. Fix the release blockers in the app (account deletion, etc.).
4. Create the app in Play Console.
5. Build a signed AAB with EAS and upload it manually to **Internal testing**.
6. Create the two subscription products.
7. Connect Play to RevenueCat (service account + real-time developer notifications).
8. Configure RevenueCat and the production server env vars.
9. Fill in the store listing and all the "App content" declarations.
10. Test buying, upgrading, restoring and cancelling on Android.
11. Closed testing: 12 testers for 14 days (personal accounts only).
12. Apply for production access → submit for review → release.

---

## 1. Google Play developer account

1. Go to <https://play.google.com/console/signup> and sign in with the Google account that should **own** the app. Use a long-lived account, not a personal throwaway.
2. Choose the account type:
   - **Organization**: requires a **D-U-N-S number** for your company. Get one free from Dun & Bradstreet; it can take days to weeks. Organization accounts **skip the 12-tester / 14-day closed testing requirement** and show the company name as the developer.
   - **Personal**: faster to set up, but new personal accounts must run a closed test with at least **12 testers opted in for 14 consecutive days** before they can publish to production (see step 11).
   - If you have an ENK/AS registered in Brønnøysund, an organization account is recommended.
3. Pay the one-time **USD 25** registration fee.
4. Complete **identity verification** (government ID, plus organization documents for an organization account). Verify the contact email and phone number.
5. Wait for verification to finish. Play Console lets you work on the app before then, but you can't publish until it's done.

---

## 2. Payments profile (to receive money)

Google pays out your subscription revenue through a **payments profile** (merchant account). Without it, you can't create paid products.

1. Play Console → **Settings** (gear, left menu at "All apps" level) → **Payments profile**, or open **Monetization setup** inside an app. Choose **Create payments profile** / **Set up a merchant account**.
2. Enter:
   - **Account type**: Business (organization) or Individual. It must match the developer account.
   - **Legal name and address**. These must match your bank account and tax registration.
   - **Public merchant name**: shown on customers' card statements, e.g. `SNAKKLY`.
   - **Customer support email**.
3. **Bank account** (Payment methods → Add payment method → Bank account): enter IBAN + BIC/SWIFT for a Norwegian account. Google sends a small test deposit that you must confirm. It usually arrives in 2–5 business days.
4. **Tax info** (Payments profile → Settings → Manage tax info):
   - Fill in the US tax form. A non-US individual normally uses **W-8BEN**; a non-US company uses **W-8BEN-E**. Claim the Norway–US tax treaty so no US withholding is applied.
   - **Norwegian VAT (MVA)**: for sales to Norwegian consumers, Google is the merchant of record and collects and remits VAT. Prices you set in Play are **VAT-inclusive** for Norway. You don't add MVA on top.
5. Google's **service fee for subscriptions is 15%**. Factor this in when setting prices.
6. Payouts happen monthly once your balance passes the minimum payout threshold.

---

## 3. Release blockers to fix in the app first

Check these before building the release AAB:

- [ ] **Account deletion (mandatory).** Any app that lets users create accounts must provide **(a)** an in-app way to delete the account and its data, and **(b)** a **public web URL** where users can request deletion without reinstalling the app. Play Console asks for this URL in *Data safety*. The backend doesn't have a delete-account endpoint yet (`app/api/auth` has none), so add one, add a button in the app, and add a page on snakkly.no (e.g. `https://snakkly.no/slett-konto`).
- [ ] **No steering to the website.** In the Android app, buy only through Play. Don't link to the web checkout or write "subscribe at snakkly.no" in the app or the Play description.
- [ ] **RevenueCat Android key.** Set `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (`goog_…`) for production builds. Without it, the buy buttons show "store unavailable".
- [ ] **Privacy policy URL.** The app has `PrivacyPolicyScreen`, but Play needs a **public URL** (e.g. `https://snakkly.no/personvern`) with the same content, covering microphone audio, AI processing (Azure / OpenAI), payments and deletion.
- [ ] **Foreground service permission.** `app.json` requests `FOREGROUND_SERVICE_MEDIA_PLAYBACK`. Play requires a *Foreground service* declaration (with a short video) for it. If background audio isn't actually needed, remove `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK` from `android.permissions` to avoid the declaration.
- [ ] **Production API URL.** Set `EXPO_PUBLIC_API_URL=https://<api-host>` for EAS production builds (EAS → project → Environment variables → *production*, or an `env` block in the `production` profile of `eas.json`). Otherwise the release build tries to guess a LAN address (`src/config.ts`).
- [ ] **Google Sign-In.** Set `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` for production builds. The Android OAuth client must also have the **Play App Signing SHA-1** (see step 5.5).
- [ ] **Keystore backup.** The file `@bestnordic__norsk-app.bak.jks` in the repo root is an Android keystore backup and is **not git-ignored**. Move it to a password manager or secure storage, and add `*.jks` to `.gitignore`. Never commit it.
- [ ] **Version.** `app.json` → `version` (e.g. `1.0.0`) is the user-visible version. `versionCode` is auto-incremented by EAS (`appVersionSource: remote` + `autoIncrement: true` in `eas.json`).

---

## 4. Create the app in Play Console

1. Play Console → **All apps** → **Create app**.
   - App name: `Snakkly` (max 30 characters; you can change it later).
   - Default language: **Norwegian – no-NO** (add English translations later if you want).
   - App or game: **App**. Free or paid: **Free** (the download is free and subscriptions are in-app purchases. A free app can **never** be changed to paid).
   - Accept the declarations.
2. You land on the **Dashboard**. Its "Set up your app" checklist mirrors steps 9–12 here.

---

## 5. Build and upload the first AAB (manual upload)

Google's API won't accept the first upload of a new app, so the first one must be done by hand in the browser.

1. Install and log in to EAS:
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. Build a production Android App Bundle:
   ```bash
   eas build --platform android --profile production
   ```
   On the first run, EAS asks to generate an **upload keystore**. Let it, and EAS stores it for you. Back it up with `eas credentials` → Android → production → *Download credentials*, and keep the `.jks` and its passwords somewhere safe outside the repo.
3. Download the `.aab` from the build page on expo.dev.
4. Play Console → your app → **Testing → Internal testing** → **Create new release**.
   - **Play App Signing** is mandatory and turned on automatically for new apps; there is nothing to choose. On the first upload, Google generates the app signing key and re-signs the app with it. Your EAS keystore becomes the **upload key**. Ignore *"Change app signing key"* on the App integrity page.
   - Upload the `.aab`. Release name defaults to the version.
   - Release notes: e.g. `<no-NO>Første testversjon</no-NO>`.
   - **Next → Save → Start rollout to Internal testing**.
   - Under **Testers**, create an email list with your own Google account(s) and copy the opt-in link.
5. **Copy the signing certificates** from **Test and release → App integrity → App signing**:
   - **App signing key certificate**: SHA-1 and SHA-256 (Google's key, used by builds installed from Play).
   - **Upload key certificate**: SHA-1 and SHA-256 (your EAS key).

   Use them in:
   - **Google Cloud → Credentials → Android OAuth client** for `com.snakkly.app`: add the **App signing SHA-1**. If Google Sign-In works in a dev build but fails with `DEVELOPER_ERROR` in the Play build, this is the cause. You can create a second Android OAuth client for the upload/debug SHA-1.
   - **`assetlinks.json`** on snakkly.no (website repo, `public/.well-known/assetlinks.json`): put **both** SHA-256 fingerprints in `sha256_cert_fingerprints`, so `/r/<code>` referral links open the app. Verify with the *Deep links* page in Play Console (Grow → Deep links) after the next upload.

Later uploads can be automated (see step 12.4).

---

## 6. Create the subscription products

Follow [PAYMENTS.md → 2.2 Create the subscriptions](./PAYMENTS.md#22-create-the-subscriptions). It covers both products, the `monthly` base plans, grace period and prices. The page unlocks once the build from step 5 is uploaded.

---

## 7. Connect Google Play to RevenueCat

Follow [PAYMENTS.md → 2.3 Service account](./PAYMENTS.md#23-service-account-lets-revenuecat-verify-and-acknowledge-purchases), [2.4 Real-time developer notifications](./PAYMENTS.md#24-real-time-developer-notifications) and [2.5 License testers](./PAYMENTS.md#25-license-testers). RevenueCat, not our server, verifies and acknowledges Play purchases; our server only hears about them through the RevenueCat webhook.

---

## 8. RevenueCat and production configuration

1. Finish [PAYMENTS.md → 4. RevenueCat wiring](./PAYMENTS.md#4-revenuecat-wiring): the Play Store app with its service account, imported products, entitlements, the `default` Offering, restore behaviour and the webhook.
2. Set the env vars from [PAYMENTS.md → 5](./PAYMENTS.md#5-environment-variables):
   - **Backend:** `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH`. Redeploy after setting them.
   - **EAS production environment:** `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (`goog_…`). Rebuild the app after setting it.

---

## 9. Store listing and "App content" declarations

Play Console → Snakkly → **Grow → Store presence → Main store listing** and **Policy → App content**. All items must be complete before review.

### 9.1 Main store listing

| Field | Requirement | Suggestion |
|---|---|---|
| App name | ≤ 30 characters | `Snakkly – Norskprøven muntlig` |
| Short description | ≤ 80 characters | `Øv til Norskprøven muntlig B1/B2 med AI-sensor og tilbakemelding.` |
| Full description | ≤ 4000 characters | What the test is, how practice works, tiers. No keyword stuffing and no "best #1" claims |
| App icon | 512×512 PNG, 32-bit, ≤ 1 MB | `assets/brand/snakkly-icon-512.png` |
| Feature graphic | 1024×500 JPG/PNG, no transparency | Needs to be made |
| Phone screenshots | 2–8 images, 16:9 or 9:16, 320–3840 px per side | Login, topic list, exam in progress, results/feedback, subscription |
| Tablet screenshots | Optional (recommended if you support tablets) | |
| Category | | **Education** |
| Contact details | Email required; website recommended | support email, `https://snakkly.no` |

Add an **English (en-US)** translation of the listing if you want to reach non-Norwegian searchers.

### 9.2 App content (Policy → App content)

- **Privacy policy**: the public URL from step 3.
- **App access**: choose *All or some functionality is restricted* and give reviewers a **working test account** (email + password) that has a **paid tier** (set it via the admin panel, so reviewers don't have to buy one) and enough quota. Explain: "Log in, choose a topic, press record". Reviewers reject apps they can't get into.
- **Ads**: *No, my app does not contain ads*.
- **Content rating**: fill in the IARC questionnaire (category *Reference, News, or Educational*). You'll get ratings such as PEGI 3.
- **Target audience**: **18 and over** (or 16+). Avoid ages under 13, which triggers the Families policy.
- **News app**: No.
- **Data safety**: declare honestly. For Snakkly, roughly:
  - *Personal info*: name, email address (account management). User IDs.
  - *Audio*: voice or sound recordings, collected for **App functionality**, processed by AI providers, not shared for advertising.
  - *App activity*: in-app actions (exam history, results).
  - *Financial info*: *Purchase history* (subscriptions bought through Google Play, processed by Google and RevenueCat). Card details are handled by Google Play, not the app.
  - Encrypted in transit: **Yes**. Users can request deletion: **Yes**, plus the **deletion URL** from step 3.
  - Data is *shared* with service providers (Azure/OpenAI) only to process requests on your behalf. Google's definition of "processing by a service provider" isn't counted as sharing; read the help text in the form.
- **Government apps**: No. **Financial features**: None. **Health**: None.
- **Foreground service permissions**: only if you kept `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (step 3). Describe the use case and attach a short screen recording.
- **Advertising ID**: declare whether the app uses it. Snakkly doesn't use ads, but if a library adds the `AD_ID` permission, either declare it or remove it.

### 9.3 Countries and pricing

**Test and release → Production → Countries/regions**: add Norway (and others you want). Subscriptions can only be bought in countries where the base plan has a price (step 6).

---

## 10. Test buying on Android

Use a **license tester** account (Play Console → Setup → License testing) that has opted in to the internal track. Test purchases are free and renew quickly (a monthly plan renews every few minutes).

1. Install Snakkly from the internal testing opt-in link (step 5.4) and log in as a **free** user.
2. Open the subscription screen. Both plans show the **Play price** in NOK, not the `tier_configs` fallback. If the fallback shows, see Troubleshooting.
3. Buy **Standard**. The Play purchase sheet opens, then PaymentResult shows "Standard". The tier badge updates, and RevenueCat → Customers shows the user (App User ID = our `users.id`) with the `standard` entitlement.
4. Buy **Premium**. This replaces the Standard subscription (Play subscriptions page shows only one), and the tier becomes Premium.
5. **Manage subscription** opens Google Play's subscription page. Cancel there. The app keeps Premium until the period ends, then drops to Free (via the RevenueCat webhook).
6. **Restore purchases** on a second Snakkly account on the same device. You should see the "owned by another account" message, and the second account stays Free.
7. Check the server logs for `POST /api/revenuecat/webhook` returning 200 after each step.
8. Also check:
   - [ ] Google Sign-In works in the Play-installed build (step 5.5).
   - [ ] A `https://snakkly.no/r/<code>` referral link opens the app.

## 11. Closed testing (personal accounts: 12 testers × 14 days)

Skip this step if you have an **organization** account.

1. **Test and release → Testing → Closed testing → Create track** (or use *Alpha*).
2. Create a release: promote the internal build (or upload a new one).
3. Testers: an email list of **at least 12 people** (friends, family, Norwegian learners from your network). Share the opt-in link; each person must **accept and install**.
4. Keep at least 12 opted in for **14 consecutive days**. Encourage them to actually use the app; Google asks about tester engagement.
5. After 14 days, the Dashboard shows **Apply for production access**. Answer the questionnaire about the test (how you recruited testers, feedback received, what you changed, why it's ready). Google reviews this in about 7 days.

---

## 12. Production release

1. **Test and release → Production → Create new release**: promote the tested build from closed or internal testing (or upload a new AAB).
2. Release notes in Norwegian (`no-NO`) and English if you added it.
3. **Review release → Start rollout to Production**. Consider a **staged rollout** (e.g. 20%) for the first release.
4. **Review** usually takes a few hours to a few days, and can take up to about a week for a new developer account. You'll get an email. Watch **Publishing overview** and **Policy status** for any rejection reasons.
5. Once approved, the app goes live, unless you enabled *Managed publishing*, in which case you press **Publish**.

### 12.1 Releasing updates later

1. Bump `version` in `app.json` (e.g. `1.0.1`). `versionCode` increments automatically.
2. `eas build -p android --profile production`
3. Upload, either manually as in step 5.4 or with **EAS Submit**:
   - Create a separate service account (or reuse one) and give it **Release** permissions for Snakkly in Play Console → Users and permissions (*Release to production, exclude devices, and use Play App Signing* + *Release apps to testing tracks*).
   - Save its JSON key outside the repo and reference it in `eas.json`:
     ```json
     "submit": {
       "production": {
         "android": {
           "serviceAccountKeyPath": "../secrets/play-release-key.json",
           "track": "internal"
         }
       }
     }
     ```
   - `eas submit -p android --latest`, then promote internal → production in Play Console.

---

## 13. After launch: checklist

- [ ] **Android vitals**: watch crash and ANR rates (Quality → Android vitals). Bad vitals reduce visibility in Play.
- [ ] **Ratings and reviews**: reply to reviews.
- [ ] **Target API level**: Google raises the minimum target SDK every year (deadline usually 31 August). Upgrade the Expo SDK in time; Play Console → *Policy status* warns you in advance.
- [ ] **Payouts**: Google pays out Play revenue monthly to the payments profile (step 2). Apple pays out monthly for iOS sales. Stripe pays out web (Web Billing) revenue automatically.
- [ ] **Price changes**: change prices in each store: Play base plan, App Store, and the Web Billing products in RevenueCat. Existing subscribers follow each store's price-change rules. Update `tier_configs` too; it's only the fallback label.
- [ ] **RevenueCat**: watch the dashboard (Customers, Charts) and the webhook delivery status. Failed deliveries are retried, but a long run of failures means the backend is down or `REVENUECAT_WEBHOOK_AUTH` doesn't match.
- [ ] **Keystore and service-account keys**: back them up and keep them out of git. If the upload key is lost, you can request an upload-key reset from Play Console (App integrity), because Google holds the actual app-signing key.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Subscription screen shows `tier_configs` prices (e.g. "149 kr") instead of Play prices, or buying says "store unavailable" | `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` missing from the build, products not attached to the `default` Offering (or the Offering isn't *current*), app not installed from a Play track, tester not opted in, base plan not **Active**, or the country has no price. New products can take a few hours to propagate. |
| "Your app doesn't have any in-app products yet… add the BILLING permission" | Upload an AAB built with `react-native-purchases` to any track first (step 5), wait a few minutes and reload. |
| RevenueCat shows "invalid credentials" for the Play app | Service-account permissions not applied yet (wait up to 36 h, or edit/save a product), or the account wasn't invited to this app (PAYMENTS.md 2.3). |
| Tier doesn't update after buying | The client syncs right after the purchase (`/api/revenuecat/sync`). Check that call and `REVENUECAT_SECRET_API_KEY` in the server logs. For later changes, check webhook deliveries in RevenueCat (401 = `REVENUECAT_WEBHOOK_AUTH` mismatch). |
| Purchases are refunded after 3 days | RevenueCat never acknowledged them, usually because of invalid Play credentials in RevenueCat (PAYMENTS.md 2.3). |
| Renewals/cancellations reach RevenueCat late | RTDN not configured (PAYMENTS.md 2.4). RevenueCat then only notices changes when it polls. |
| Google Sign-In `DEVELOPER_ERROR` only in the Play build | Add the **App signing SHA-1** from App integrity to the Android OAuth client. |
| Referral links open the browser instead of the app | `assetlinks.json` on snakkly.no lacks the App signing SHA-256, or isn't served at `/.well-known/assetlinks.json` with `Content-Type: application/json` and without redirects. |
| Rejected: "Account deletion" / "Data safety" | Add the in-app deletion and public deletion URL (step 3), and make Data safety match what the app actually does. |
| Rejected: "Unable to access app" | Provide a working reviewer login with a paid tier in *App access* (9.2). |
