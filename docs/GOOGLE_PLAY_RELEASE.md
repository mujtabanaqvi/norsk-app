# Publishing Snakkly to Google Play (from scratch)

A step-by-step checklist for taking Snakkly from zero to a live listing on Google Play. It covers accounts, server configuration, Stripe, builds, testing and review.

> **The Android app sells nothing in-app.** Users subscribe on the web (Stripe), and the Android app only reads their tier from the server. It refreshes the tier whenever the app returns to the foreground. That's why steps 2, 6 and 7 (payments profile, Play subscription products, service account/RTDN) are **skipped**. They are kept for reference in case Play Billing is re-enabled later (load `expo-iap` on Android in `src/lib/iap.ts`).
>
> **Play policy:** Play's payments policy forbids buy buttons, prices with a call to action, upsells, and text or links that steer users to pay on the website. The app hides these on Android via `canPurchaseInApp` (`src/lib/iap.ts`). Keep it that way when adding new screens or copy.

How the payment code works is described in [PAYMENTS.md](./PAYMENTS.md). This document covers only **setup and release**.

> Google changes Play Console menus and policies often. If a menu name below doesn't match, use the search bar at the top of Play Console. The requirement itself is usually still there.

**Fixed values used throughout**

| Thing | Value | Where it's defined |
|---|---|---|
| Package name | `com.snakkly.app` | `app.json` → `android.package` |
| Standard product id (iOS; Play only if re-enabled) | `snakkly.standard.monthly` | `src/lib/iap-products.ts` |
| Premium product id (iOS; Play only if re-enabled) | `snakkly.premium.monthly` | `src/lib/iap-products.ts` |
| Default prices | 149 kr / 299 kr per month | `tier_configs` table (admin panel) |
| Public website | `https://snakkly.no` | separate repo `snakkly-frontend-website` |
| API host | `https://<api-host>` (your deployed Next.js backend) | |

The package name and product ids **can never be changed or reused** after you create them in Play Console. Double-check them before you create anything.

---

## Overview: order of operations

1. Create the Google Play developer account and verify your identity.
2. ~~Payments profile~~ (skip: nothing is sold through Play).
3. Fix the release blockers in the app (account deletion, etc.).
4. Create the app in Play Console.
5. Build a signed AAB with EAS and upload it manually to **Internal testing**.
6. ~~Subscription products~~ (skip).
7. ~~Service account + RTDN~~ (skip).
8. Configure the production server env vars and set up live Stripe. This is the only revenue path for Android users.
9. Fill in the store listing and all the "App content" declarations.
10. Test that a web subscription unlocks the Android app.
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

## 2. Payments profile (to receive money): SKIP, only needed if Play Billing is re-enabled

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
5. Google's **service fee for subscriptions is 15%**. Factor this in when setting prices; Stripe on the web is roughly 1.5–3% + per-transaction fee.
6. Payouts happen monthly once your balance passes the minimum payout threshold.

---

## 3. Release blockers to fix in the app first

Check these before building the release AAB:

- [ ] **Account deletion (mandatory).** Any app that lets users create accounts must provide **(a)** an in-app way to delete the account and its data, and **(b)** a **public web URL** where users can request deletion without reinstalling the app. Play Console asks for this URL in *Data safety*. The backend doesn't have a delete-account endpoint yet (`app/api/auth` has none), so add one, add a button in the app, and add a page on snakkly.no (e.g. `https://snakkly.no/slett-konto`).
- [ ] **No purchase steering on Android.** Already handled by `canPurchaseInApp` (`src/lib/iap.ts`): no buy buttons, prices, upsells or website links. Re-check any new copy, including server error messages the app displays (e.g. the daily-limit message in `app/api/exam/start/route.ts`), and the store listing and screenshots. Don't write "subscribe at snakkly.no" in the Play description.
- [ ] **Web subscribers can cancel.** Android users manage their subscription on the website. The web subscription screen has a **Manage subscription** button for Stripe subscribers (`POST /api/stripe/portal`), but it only works once the Stripe Customer portal is configured in the dashboard (8.2 step 6), in both test and live mode.
- [ ] **Optional: drop the BILLING permission.** `expo-iap` (still used for iOS) pulls in the Play Billing library, which adds `com.android.vending.BILLING`. It's harmless, but you can remove it by adding `"blockedPermissions": ["com.android.vending.BILLING"]` under `android` in `app.json`. Remove that again if Play Billing is ever re-enabled.
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
   - App or game: **App**. Free or paid: **Free** (subscriptions are bought on the website; the download itself is free. A free app can **never** be changed to paid).
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

## 6. Create the subscription products: SKIP, only needed if Play Billing is re-enabled

The **Monetize → Products → Subscriptions** page unlocks once a build containing the billing library is uploaded. `expo-iap` adds it automatically, so step 5 takes care of this. If the page still says you need to add the BILLING permission, wait a few minutes after the upload and reload.

Do this once for each tier:

| | Standard | Premium |
|---|---|---|
| Product ID | `snakkly.standard.monthly` | `snakkly.premium.monthly` |
| Name | Snakkly Standard | Snakkly Premium |
| Base plan ID | `monthly` | `monthly` |
| Price (NOK, incl. MVA) | 149 kr | 299 kr |

1. **Monetize with Play → Products → Subscriptions → Create subscription.**
   - **Product ID**: exactly as in the table. It's permanent.
   - **Name**: as in the table (users see this in Play and their subscriptions page).
2. Add **benefits** (up to 4 short lines shown on the Play subscription page), e.g. "Flere prøver per dag", "Detaljert tilbakemelding".
3. **Add base plan**:
   - Base plan ID: `monthly`.
   - Type: **Auto-renewing**, billing period **Monthly**.
   - **Grace period**: e.g. 7 days. **Account hold**: the remainder up to 30 days. The server already maps grace period → active and account hold → past due.
   - **Resubscribe**: allow.
   - **Tags**: optional.
   - **Prices**: *Set prices* → select all countries/regions you want → enter **NOK 149** (or 299) for Norway. Play converts the rest; adjust key markets by hand if you like.
   - **Save**, then **Activate** the base plan.
4. Optional: add an **offer** (e.g. a 7-day free trial for new customers). The app doesn't depend on offers, so you can add them later.
5. Keep store prices **in sync with `tier_configs`** (admin panel → *Abonnement & Verveinnstillinger*). The Android app shows the store's localized price (`displayPrice`), while the web shows `tier_configs.price_cents`. They are independent, so update both when changing prices.

Upgrades/downgrades: Standard and Premium are separate subscriptions on Play. Switching plans goes through the app's buy flow. The server recomputes the tier from every active subscription (`recomputeUserTier()`), so the user keeps the highest tier they pay for.

---

## 7. Google Cloud: service account + Real-time developer notifications: SKIP, only needed if Play Billing is re-enabled

The server needs to (a) call the **Google Play Developer API** to verify and acknowledge purchases (`lib/iap/google.ts`), and (b) receive **RTDN** pushes for renewals, cancellations and refunds (`app/api/iap/google/rtdn`).

### 7.1 Google Cloud project

1. Open <https://console.cloud.google.com>. Reuse the project that already has the Google Sign-In OAuth clients, or create one called `snakkly`.
2. **APIs & Services → Library**: enable
   - **Google Play Android Developer API**
   - **Cloud Pub/Sub API**

### 7.2 Service account for verifying purchases

1. **IAM & Admin → Service accounts → Create service account**, e.g. `play-billing@<project>.iam.gserviceaccount.com`. No project roles are needed.
2. Open it → **Keys → Add key → Create new key → JSON**. A file downloads. Treat it like a password.
3. Play Console (**All apps** level) → **Users and permissions → Invite new users**:
   - Email: the service account email.
   - **App permissions** → add Snakkly with:
     - *View app information and download bulk reports (read-only)*
     - *View financial data, orders, and cancellation survey responses*
     - *Manage orders and subscriptions*
   - **Invite user**. Service accounts are added immediately; no email confirmation is needed.
4. Permissions can take **up to 24–36 hours** to apply. If the verify endpoint returns `401/403 The current user has insufficient permissions`, a known trick is to edit any subscription's description, save it, and change it back. That forces a refresh.
5. Convert the JSON key into a single line for the env var:
   ```bash
   node -e "console.log(JSON.stringify(require('./play-billing-key.json')))"
   ```
   Put the output in `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.

### 7.3 Pub/Sub topic for RTDN

1. **Pub/Sub → Topics → Create topic**: ID `play-rtdn`. Untick *Add a default subscription*.
2. Open the topic → **Permissions** (info panel) → **Add principal**:
   - Principal: `google-play-developer-notifications@system.gserviceaccount.com`
   - Role: **Pub/Sub Publisher**
3. Play Console → Snakkly → **Monetize with Play → Monetization setup**:
   - **Real-time developer notifications** → Topic name: `projects/<project-id>/topics/play-rtdn`
   - Notification content: **Subscriptions, voided purchases, and all one-time products**
   - **Send test notification**: should report success. Save.

### 7.4 Authenticated push subscription to the server

1. Create a service account for signing push requests, e.g. `pubsub-push@<project>.iam.gserviceaccount.com` (no roles needed). You can reuse the one from 7.2.
2. **Pub/Sub → Subscriptions → Create subscription**:
   - ID: `play-rtdn-push`, topic: `play-rtdn`
   - Delivery type: **Push**
   - Endpoint URL: `https://<api-host>/api/iap/google/rtdn`
   - **Enable authentication** → service account: the one from step 1
   - **Audience**: `https://<api-host>/api/iap/google/rtdn` (same as the endpoint)
   - Retry policy: *Retry after exponential backoff delay*
   - Create. If the console asks to grant the Pub/Sub service agent the **Service Account Token Creator** role, accept.
3. Server env vars:
   - `GOOGLE_RTDN_AUDIENCE` = the audience URL above
   - `GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL` = the push service account email
4. Press **Send test notification** in Play Console again and check the server logs for a request to `/api/iap/google/rtdn`. A `401` means the audience or email doesn't match.

---

## 8. Production server configuration (+ Stripe from scratch)

### 8.1 Env vars on the production backend

| Variable | Value |
|---|---|
| `GOOGLE_PLAY_*`, `GOOGLE_RTDN_*` | Not needed while Android sells nothing in-app (step 7) |
| `STRIPE_SECRET_KEY` | `sk_live_…` (8.2) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the live webhook (8.2) |
| `NEXT_PUBLIC_APP_URL` | Public URL of the web app (allowed Stripe return origin) |

Redeploy after changing them. The full list is in [PAYMENTS.md](./PAYMENTS.md#environment-variables).

### 8.2 Stripe (web payments)

Stripe is how **web and Android users** subscribe (Android users pay on the website), so a live account is needed before launch. The checkout uses inline `price_data` from `tier_configs`, so **you don't need to create Products or Prices in Stripe**.

1. Sign up at <https://dashboard.stripe.com/register> (country: **Norway**, currency **NOK**).
2. **Activate the account** (Settings → Business → *Activate payments*):
   - Business type (sole proprietorship / company), organisasjonsnummer, address.
   - Representative's personal details and ID verification.
   - Business website: `https://snakkly.no`, product description: "Subscription for AI-based Norskprøven speaking practice".
   - **Bank account** (Norwegian IBAN) for payouts.
   - **Public details**: statement descriptor `SNAKKLY`, support email, support URL.
3. **Tax**: if you're MVA-registered, register Norwegian VAT under Settings → Tax, or include MVA in the `tier_configs` price. The current checkout doesn't enable Stripe Tax automatically, so prices are charged exactly as configured.
4. **API keys** (Developers → API keys, with the *Test mode* toggle **off**): copy the **Secret key** `sk_live_…` → `STRIPE_SECRET_KEY`. Consider a **restricted key** with write access to Checkout Sessions, Customers and Subscriptions only.
5. **Webhook** (Developers → Webhooks → *Add endpoint*):
   - URL: `https://<api-host>/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`.
6. **Customer portal (required).** The web app's *Manage subscription* button opens it, and it's the only place Android users can cancel. Go to **Settings → Billing → Customer portal** (do it in both test and live mode) and set:
   - **Cancel subscriptions**: on, mode *At end of billing period*. Optionally collect a cancellation reason.
   - **Update payment methods**: on. **Invoice history**: on. **Customer information**: email/billing address as you like.
   - **Switch plans / Update quantities**: **off**. The tier comes from the subscription's metadata and prices are created inline, so a plan switch in the portal would not change the user's tier. Upgrades go through Checkout in the app.
   - **Business information**: headline, privacy policy URL and terms URL. Default redirect link: `https://<web-app>/subscription`.
   - Save.

   Also enable the *Subscription* emails (receipts, failed payment, upcoming renewal) under Settings → Emails. They're the main reminder Android users get, since nothing appears in Play.
7. Test the live flow once with a real card on the web app, then refund yourself from the dashboard.

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
- **App access**: choose *All or some functionality is restricted* and give reviewers a **working test account** (email + password) that has a **paid tier** (set it via the admin panel, since it can't be bought in the app) and enough quota. Explain: "Log in, choose a topic, press record". Reviewers reject apps they can't get into.
- **Ads**: *No, my app does not contain ads*.
- **Content rating**: fill in the IARC questionnaire (category *Reference, News, or Educational*). You'll get ratings such as PEGI 3.
- **Target audience**: **18 and over** (or 16+). Avoid ages under 13, which triggers the Families policy.
- **News app**: No.
- **Data safety**: declare honestly. For Snakkly, roughly:
  - *Personal info*: name, email address (account management). User IDs.
  - *Audio*: voice or sound recordings, collected for **App functionality**, processed by AI providers, not shared for advertising.
  - *App activity*: in-app actions (exam history, results).
  - *Financial info*: none collected in the Android app. Payments happen on the website through Stripe; the app only receives the subscription tier.
  - Encrypted in transit: **Yes**. Users can request deletion: **Yes**, plus the **deletion URL** from step 3.
  - Data is *shared* with service providers (Azure/OpenAI) only to process requests on your behalf. Google's definition of "processing by a service provider" isn't counted as sharing; read the help text in the form.
- **Government apps**: No. **Financial features**: None. **Health**: None.
- **Foreground service permissions**: only if you kept `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (step 3). Describe the use case and attach a short screen recording.
- **Advertising ID**: declare whether the app uses it. Snakkly doesn't use ads, but if a library adds the `AD_ID` permission, either declare it or remove it.

### 9.3 Countries and pricing

**Test and release → Production → Countries/regions**: add Norway (and others you want). Country availability only controls where the app can be downloaded. Subscriptions are sold on the website, wherever Stripe accepts the customer's card.

---

## 10. Test that a web subscription unlocks the Android app

1. Install Snakkly from the internal testing opt-in link (step 5.4) and log in as a **free** user.
2. Confirm the Android app shows **no** buy buttons, prices, "Upgrade"/"Unlock more" prompts or links to the website. The subscription screen is read-only ("Ditt abonnement") and says subscriptions can't be purchased in the app.
3. Leave the app in the background. In a browser, log in to the web app with the **same account** and subscribe with Stripe.
4. Return to the Android app: the tier badge updates to Standard/Premium without restarting (the profile is re-read on foreground).
5. The subscription screen now shows "Abonnementet ditt administreres via nettsiden…" (managed on the website, no link).
6. Cancel the subscription via Stripe. After the period ends (or after `customer.subscription.deleted`), the app drops back to Free on the next foreground.
7. Also check:
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
- [ ] **Payouts**: Stripe pays out to your bank account automatically (Stripe dashboard → *Balance → Payouts*). Apple pays out monthly for iOS sales.
- [ ] **Price changes**: change `tier_configs` (admin panel); this is what Stripe charges new web/Android subscribers. Existing Stripe subscriptions keep their old price. Also change the App Store prices for iOS.
- [ ] **Keystore and service-account keys**: back them up and keep them out of git. If the upload key is lost, you can request an upload-key reset from Play Console (App integrity), because Google holds the actual app-signing key.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Tier doesn't update after paying on the web | Check the Stripe webhook delivered (Stripe dashboard → Webhooks) and that the same account is used in both places. The app re-reads the profile when it returns to the foreground. |
| Android app shows buy buttons or prices | It's running a build where `expo-iap` loads on Android, i.e. `canPurchaseInApp` is true. Check `src/lib/iap.ts`. |
| Google Sign-In `DEVELOPER_ERROR` only in the Play build | Add the **App signing SHA-1** from App integrity to the Android OAuth client. |
| Referral links open the browser instead of the app | `assetlinks.json` on snakkly.no lacks the App signing SHA-256, or isn't served at `/.well-known/assetlinks.json` with `Content-Type: application/json` and without redirects. |
| Rejected: "Account deletion" / "Data safety" | Add the in-app deletion and public deletion URL (step 3), and make Data safety match what the app actually does. |
| Rejected: "Unable to access app" | Provide a working reviewer login with a paid tier in *App access* (9.2). |
| *Rows below apply only if Play Billing is re-enabled* | |
| "Your app doesn't have any in-app products yet… add the BILLING permission" | Upload an AAB built with `expo-iap` to any track first (step 5). |
| Products don't load in the app (`getSubscriptions` returns empty) | App not installed from a Play track, tester not opted in, base plan not **Active**, the country has no price, or a product ID typo. New products can take a few hours to propagate. |
| `/api/iap/google/verify` returns 500 "insufficient permissions" | Service-account permissions not applied yet (wait up to 36 h, or edit/save a product), or the account wasn't invited to this app (7.2). |
| `/api/iap/google/verify` returns 500 "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured" / JSON parse error | Env var missing on the server, or not single-line JSON. |
| Purchases are refunded after 3 days | The server never acknowledged them. Check the verify endpoint logs. |
| RTDN never arrives / returns 401 | Topic missing Publisher grant for `google-play-developer-notifications@…`, push subscription not authenticated, or audience/email mismatch with `GOOGLE_RTDN_AUDIENCE` / `GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL`. |
