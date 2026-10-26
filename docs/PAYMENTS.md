# Payments & Subscriptions

Snakkly sells two monthly subscriptions, **Standard** and **Premium**. **RevenueCat** handles every platform:

| Platform | Where the user pays | Who processes the payment |
|---|---|---|
| iOS app | App Store in-app purchase | Apple |
| Android app | Google Play Billing | Google |
| Web app | RevenueCat **Web Billing** checkout | **Stripe** (your account, connected to RevenueCat) |

The app uses one SDK (`react-native-purchases`) on all three platforms. The backend has one webhook. Stripe is only used for web payments, and the code holds no Stripe keys.

This guide is in setup order: **0** fixed values → **1** App Store → **2** Google Play → **3** Stripe + Web Billing → **4** RevenueCat wiring → **5** env vars → **6** testing. The last section explains how the code works.

---

## 0. Fixed values (use exactly these everywhere)

| | Standard | Premium |
|---|---|---|
| Product id (App Store, Google Play **and** Web Billing) | `snakkly.standard.monthly` | `snakkly.premium.monthly` |
| Google Play base plan id | `monthly` | `monthly` |
| Billing period | 1 month, auto-renewing | 1 month, auto-renewing |
| Price (Norway, incl. MVA) | 149 kr | 299 kr |
| RevenueCat entitlement | `standard` | `premium` |
| Bundle id / package name | `com.snakkly.app` | |

How a purchase is mapped to a tier:
- **App:** by the **package identifier** in the Offering (`standard` / `premium`, §4.4).
- **Server:** by the product id in `src/lib/iap-products.ts` or, failing that, by the **entitlement** the product grants (§4.3).

On the web, the product id can be a Stripe price id (`price_…`), so the package identifiers and entitlements **must** be set exactly as described. **Product ids can never be changed or reused** in App Store Connect or Play Console.

---

## 1. App Store (iOS)

**Prerequisites:** an Apple Developer Program membership, and the app record `com.snakkly.app` in App Store Connect.

### 1.1 Agreements, tax and banking
App Store Connect → **Business** (Agreements, Tax, and Banking): accept the **Paid Apps Agreement**, then add a bank account and tax forms. Paid products don't load until the agreement is **Active**.

### 1.2 Create the subscription group and products
1. App Store Connect → your app → **Monetization → Subscriptions** → **Subscription Groups → +** → name: `Snakkly`.
2. In the group, click **Create** (subscription) twice:

   | Field | Standard | Premium |
   |---|---|---|
   | Reference name (internal) | `Snakkly Standard monthly` | `Snakkly Premium monthly` |
   | Product ID | `snakkly.standard.monthly` | `snakkly.premium.monthly` |
   | Subscription duration | 1 month | 1 month |
   | Price | NOK 149 (Norway), then let Apple fill other countries | NOK 299 |
   | Localization (no + en) | display name "Standard" + one-line description | "Premium" + description |
   | Review information | a screenshot of the subscription screen + notes | same |

3. **Upgrade levels.** In the group's level list, put **Premium at level 1** (highest) and **Standard at level 2**. Apple then treats switching between them as an upgrade or downgrade of the same subscription, instead of a second one.
4. Set **Availability** to the countries you sell in.
5. **Group localization**: add the group display name (`Snakkly`) in Norwegian and English.

Your first subscriptions must be **submitted together with an app version**. On the version page, under *In-App Purchases and Subscriptions*, select both before you submit for review. After that, new products can be submitted on their own.

### 1.3 Keys RevenueCat needs
1. **In-App Purchase key:** Users and Access → **Integrations → In-App Purchase → Generate**. Download the `.p8` file (you can download it only once) and note the **Key ID** and the **Issuer ID**.
2. **App Store Connect API key** (lets RevenueCat import products and prices): Users and Access → Integrations → **App Store Connect API → Team Keys → +**, role *App Manager*. Download the `.p8` file and note its Key ID.
3. Both are uploaded to RevenueCat in step 4.1.

### 1.4 Server notifications
After you create the App Store app in RevenueCat (4.1), it shows an **Apple Server Notification URL**. Paste it into App Store Connect → your app → **App Information → App Store Server Notifications**, under both **Production** and **Sandbox**, choosing **Version 2**.

### 1.5 Sandbox testers
Users and Access → **Sandbox → Test Accounts → +**. Use an email that isn't an Apple ID. On the test iPhone, sign in under *Settings → App Store → Sandbox Account*.

---

## 2. Google Play (Android)

**Prerequisites:** a Play developer account, the app created in Play Console, and at least one AAB containing `react-native-purchases` uploaded to **Internal testing**. The subscription pages stay locked until such a build is uploaded. See [GOOGLE_PLAY_RELEASE.md](./GOOGLE_PLAY_RELEASE.md), steps 1–5.

### 2.1 Payments profile
Play Console → **Settings → Payments profile**: create the merchant account, with legal name, address, Norwegian bank account (IBAN/BIC) and tax info (W-8BEN or W-8BEN-E). Google collects Norwegian MVA, so Play prices include VAT. The full walkthrough is in GOOGLE_PLAY_RELEASE.md step 2.

### 2.2 Create the subscriptions
Play Console → your app → **Monetize with Play → Products → Subscriptions → Create subscription**. Do this once for each tier:

1. **Product ID:** `snakkly.standard.monthly` (or `snakkly.premium.monthly`). **Name:** `Snakkly Standard` (or `Snakkly Premium`).
2. **Benefits:** up to 4 short lines, e.g. "Flere prøver per dag", "Detaljert tilbakemelding".
3. **Add base plan:**
   - **Base plan ID:** `monthly`
   - **Type:** Auto-renewing, **billing period:** Monthly
   - **Grace period:** 7 days. **Account hold:** the remainder up to 30 days
   - **Resubscribe:** allow
   - **Prices:** *Set prices* → select all countries → **NOK 149** (or 299) for Norway. Play converts the other countries.
   - **Save → Activate** the base plan. Products with no active base plan are invisible to the app.
4. Offers (e.g. a free trial) are optional; the app doesn't rely on them.

In RevenueCat, Play products show up as `snakkly.standard.monthly:monthly` (product id plus base plan). The server handles that format.

### 2.3 Service account (lets RevenueCat verify and acknowledge purchases)
1. Google Cloud Console (the project that has your Google Sign-In clients): enable the **Google Play Android Developer API** and the **Cloud Pub/Sub API**.
2. **IAM & Admin → Service accounts → Create**, e.g. `revenuecat@<project>.iam.gserviceaccount.com`. Give it the roles RevenueCat's guide asks for (currently **Pub/Sub Editor** and **Monitoring Viewer**).
3. On that service account: **Keys → Add key → JSON**. Download it and keep it secret.
4. Play Console (All apps level) → **Users and permissions → Invite new users** → the service-account email → app permissions for Snakkly:
   - *View app information*
   - *View financial data*
   - *Manage orders and subscriptions*
5. You upload the JSON in RevenueCat in step 4.1. Permissions can take **up to 36 hours** to apply. Editing and saving any subscription's description often makes them apply sooner.

### 2.4 Real-time developer notifications
In RevenueCat's Play Store app settings (after 4.1), open **Google developer notifications**, select your Cloud project, and copy the topic name it creates. Then go to Play Console → **Monetize with Play → Monetization setup → Real-time developer notifications**:
- Paste the topic.
- Content: *Subscriptions, voided purchases, and all one-time products*.
- Click **Send test notification**; RevenueCat should show it as received.

### 2.5 License testers
Play Console → **Settings → License testing**: add the Google accounts that will test. Their purchases are free and renew every few minutes: a monthly test subscription renews every 5 minutes and Google ends it after 6 renewals (about 30 minutes), after which the app correctly shows the user as Free again. Test *Cancel subscription* within that window. They must opt in to the internal track and install the app **from Play**; a locally installed build can't load products.

---

## 3. Web: Stripe + RevenueCat Web Billing

### 3.1 Stripe account (once)
1. Sign up at <https://dashboard.stripe.com/register> with country **Norway** and currency **NOK**.
2. **Activate payments:**
   - business type and organisasjonsnummer
   - representative's ID
   - Norwegian bank account for payouts
   - statement descriptor `SNAKKLY`
   - support email
3. You don't need API keys, webhooks, products or customer-portal settings in Stripe. RevenueCat creates and manages them.

### 3.2 Web Billing app in RevenueCat
1. RevenueCat → your project → **Apps & providers → + New → Web Billing**.
2. Click **Connect Stripe** and approve the Stripe Connect screen with your Stripe account. Do this once for test mode and once for live mode if RevenueCat asks.
3. Fill in the app settings:
   - app name `Snakkly`
   - support email
   - default currency **NOK**
   - links to your terms and privacy policy
   - checkout appearance (logo and colors), if you like
4. The app gets two public keys: a **sandbox** key (Stripe test mode) and a **production** key, both starting with `rcb_`.

> **Stripe Billing app instead of Web Billing.** If your web app in RevenueCat has a key starting with `strp_`, it is a *Stripe Billing* app. The code supports it too. Its products are your **Stripe prices** (`price_…`) rather than ids you choose, so the tier comes only from §4.3 and §4.4. Attach each Stripe price to the right entitlement and package. 3.3 then becomes "pick the Standard and Premium prices"; make sure they are monthly recurring prices in NOK.

### 3.3 Web Billing products
RevenueCat → **Product catalog → Products → + New** → select the Web Billing app. Do this once for each tier:

| Field | Standard | Premium |
|---|---|---|
| Identifier | `snakkly.standard.monthly` | `snakkly.premium.monthly` |
| Title (shown at checkout) | `Snakkly Standard` | `Snakkly Premium` |
| Type / duration | Subscription, 1 month | Subscription, 1 month |
| Price | NOK 149 | NOK 299 |

RevenueCat creates the matching product and price in your Stripe account. Web users manage their subscription in the Web Billing **customer portal**, which the app's *Manage subscription* button opens.

---

## 4. RevenueCat wiring

### 4.1 Project and apps
Create the project **Snakkly** and add one app per store under **Apps & providers**:
- **App Store:** bundle id `com.snakkly.app`. Upload the In-App Purchase key (`.p8`, Key ID, Issuer ID) and the App Store Connect API key from 1.3. Copy the **Apple Server Notification URL** it shows into App Store Connect (1.4).
- **Play Store:** package `com.snakkly.app`. Upload the service-account JSON (2.3) and set up developer notifications (2.4).
- **Web Billing:** set up in 3.2.

### 4.2 Products
**Product catalog → Products**:
- For each store app, click **Import** to pull in the App Store and Play products.
- The Web Billing products already exist from 3.3.

You should end up with **six** products: 2 × App Store, 2 × Play (`…:monthly`), 2 × web (Web Billing ids, or Stripe `price_…` ids for a Stripe Billing app).

### 4.3 Entitlements
**Product catalog → Entitlements → + New**:
- `standard`: attach the three Standard products.
- `premium`: attach the three Premium products.

The server uses these to find the tier of products whose id isn't one of ours (e.g. Stripe `price_…`). Each product belongs to exactly one of the two entitlements.

### 4.4 Offering
**Product catalog → Offerings → + New** → identifier `default`. Mark it **Current**, then add two packages:

| Package identifier | Products (one per store) |
|---|---|
| `standard` (custom) | App Store, Play and Web Billing Standard products |
| `premium` (custom) | App Store, Play and Web Billing Premium products |

Use exactly these two package identifiers: the app uses them to decide which button buys which package.

The app loads the current Offering and shows each package's real price. A plan that isn't in the current Offering can't be bought.

### 4.5 Project settings
- **Restore behavior:** **Keep with original App User ID.** A store subscription then stays with the Snakkly account that bought it, and restoring it on a different account shows "owned by another account".
- **Webhook** (**Integrations → Webhooks → + New**):
  - URL: `https://<api-host>/api/revenuecat/webhook`
  - Authorization header value: a long random string, e.g. `Bearer 3f9c…`. Put the same value in `REVENUECAT_WEBHOOK_AUTH`.
  - Scope: all apps, both production and sandbox events.
- **API keys:**
  - Copy each app's **public SDK key** into the `EXPO_PUBLIC_REVENUECAT_*` variables.
  - Create a **secret key, API v1**, and put it in `REVENUECAT_SECRET_API_KEY`.

---

## 5. Environment variables

| Variable | Where | Value |
|---|---|---|
| `REVENUECAT_SECRET_API_KEY` | backend | Secret API key (v1) |
| `REVENUECAT_WEBHOOK_AUTH` | backend | Exactly the webhook's Authorization header value |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | app (EAS env / `.env.local`) | App Store app public key (`appl_…`) |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | app | Play Store app public key (`goog_…`) |
| `EXPO_PUBLIC_REVENUECAT_WEB_KEY` | web build | Web app key: Web Billing `rcb_sb_…` / `rcb_…`, or Stripe Billing `strp_sb_…` / `strp_…` (sandbox locally, production live) |

`EXPO_PUBLIC_*` values are built into the app, so rebuild the app after changing them. If a platform's key is missing, or the app runs in Expo Go, the buy buttons say the store is unavailable.

The old variables (`STRIPE_*`, `APPLE_*`, `GOOGLE_PLAY_*`, `GOOGLE_RTDN_*`) are no longer used and can be deleted.

---

## 6. Testing

Before any test:
- Run `npm run db:migrate` once (migration `0006_revenuecat`).
- `EXPO_PUBLIC_API_URL` must point at an API the device can reach.

| Platform | How | What to check |
|---|---|---|
| **Web** | `npm run dev` + `npm run mobile:web` with the **sandbox** Web Billing key. Log in, choose a plan, pay with card `4242 4242 4242 4242`. | PaymentResult shows the tier straight away (through `/api/revenuecat/sync`, so no tunnel is needed). *Manage subscription* opens the customer portal. |
| **iOS** | `npx expo run:ios` on a device signed in with a Sandbox tester. This needs a development build; Expo Go can't buy. | Prices are in NOK. Buy, then switch to the other plan. Sandbox renewals are fast (1 month ≈ 5 min). |
| **Android** | `npx expo prebuild --clean` (once), then build and install **from the internal testing track** as a license tester. | Buy Standard, upgrade to Premium (Play shows a single subscription), cancel in Play. |
| **Restore** | On iOS or Android, log in as a second Snakkly account and tap *Restore purchases*. | "Owned by another account" appears, and the second account stays Free. |
| **Webhook** | Expose the API with a tunnel, then RevenueCat → Webhooks → **Send test event**. | `200`. A wrong Authorization value returns `401`. |

### Common problems

| Symptom | Cause |
|---|---|
| Plans show the `tier_configs` fallback price, or buying says "store unavailable" | Public key missing for that platform, Offering not **Current**, product missing from a package, Apple Paid Apps Agreement not active, Play base plan not active, or Android app not installed from Play. New products can take a few hours to appear. |
| "RevenueCat offering … has no "standard" package" | The current Offering's packages aren't named `standard` / `premium` (§4.4). The message lists the package → product pairs RevenueCat returned. |
| Purchase succeeds but tier stays Free | The product isn't one of our ids **and** isn't attached to the `standard` / `premium` entitlement (§4.3), or `REVENUECAT_SECRET_API_KEY` is wrong (see the `/api/revenuecat/sync` error in the server log). |
| Later renewals or cancellations don't arrive | Webhook URL or Authorization mismatch (RevenueCat shows the failed deliveries), or App Store / Play notifications not set up (1.4, 2.4). |
| Play purchases refunded after 3 days | RevenueCat couldn't acknowledge them: the service-account permissions (2.3) aren't active yet. |

---

## How the code works (reference)

- **Client:** [`src/lib/purchases.ts`](../src/lib/purchases.ts) wraps the SDK.
  - `App.tsx` calls `configurePurchases(user.id)` after login, so the RevenueCat App User ID is always our `users.id`.
  - `SubscriptionScreen` calls `buySubscription(tier)`. That function finds the package by its identifier (`standard` / `premium`), calls `Purchases.purchasePackage()` and then `POST /api/revenuecat/sync`, and the screen opens **PaymentResult**.
  - On Android, switching plans replaces the old Play subscription with time proration.
  - *Manage subscription* opens `customerInfo.managementURL`: the App Store page, Google Play, or the Web Billing portal.
- **Server:** [`lib/revenuecat.ts`](../lib/revenuecat.ts).
  - `syncRevenueCatSubscriber(userId)` reads `GET /v1/subscribers/{id}` and writes one `subscriptions` row per product (`provider` = `APPLE` / `GOOGLE` / `STRIPE`, the last one meaning the web app). A product's tier comes from our product ids, else from the entitlement it grants, else from the tier already stored for that row. It then runs `recomputeUserTier()` ([`lib/entitlements.ts`](../lib/entitlements.ts)): the highest tier that is still active wins.
  - Both `/api/revenuecat/sync` (the caller only) and `/api/revenuecat/webhook` (any user, checked with the Authorization header) use this function. Webhook bodies are never trusted; the subscriber is always re-read.
- **Prices:** users are charged the store and Web Billing prices, and the app displays them. `tier_configs.price_cents` (admin panel) is only a fallback label, shown when RevenueCat can't be reached.
- **Cancelling:** stores don't let apps cancel subscriptions, so the *Your subscription* card on the subscription screen shows the plan, the renewal or end date and a **Cancel subscription** button. After a confirm it calls `openCancelSubscription()` in `src/lib/purchases.ts`, which opens the store that sold the subscription: the App Store sheet on iOS, the Play subscription page (also from web), or the Web Billing customer portal on web. An App Store subscription seen from Android/web, or a web subscription seen from the apps, gets step-by-step instructions instead. When the user comes back, the screen re-syncs from RevenueCat, and `/api/auth/me` returns `activeSubscriptionCancelsAtPeriodEnd` (from RevenueCat's `unsubscribe_detected_at`), so the card switches to "cancelled – you keep … until …". Access continues until the period ends.
- **One store per subscription:** a subscription can only be changed in the store that sold it. If the active subscription comes from another store, the buy buttons are disabled and a "managed through …" notice is shown.

## Promo codes

Promo codes give **Standard or Premium free for N months**, with no store and no card. Create them in the admin panel under *Kampanjekoder*: tier, months, optional max uses, optional last day to redeem, and a note.

- **Redeeming:** the *Have a promo code?* card on the subscription screen calls `POST /api/promo/redeem`. [`lib/promo-codes.ts`](../lib/promo-codes.ts) checks the code and writes a `subscriptions` row with `provider = 'PROMO'`, `externalId = promo:<codeId>:<userId>` and `current_period_end = now + N months`. It then runs `recomputeUserTier()`, so a promo works like any other subscription: the highest active tier wins. RevenueCat sync only touches `rc:` rows, so it never overwrites a promo grant.
- **Rules:**
  - Each user can redeem a code once.
  - `max_redemptions` is enforced under a row lock, so it can't be oversold.
  - A code that doesn't raise the user's tier is refused (`ALREADY_HAS_TIER`). A paying Standard user can still redeem a Premium code.
  - Deactivating a code stops new redemptions, but grants already made keep running.
- **Expiry:** promo grants have no webhook. `getUserDailyTestStatus()` (and so `/api/auth/me` and exam start) re-derives the tier whenever the stored tier isn't FREE, so an expired grant drops back to FREE on the next request.
- **Buying while on a promo:** a promo grant is not "managed elsewhere", so the buy buttons stay enabled. A purchase simply adds a store subscription alongside it.
- **Not on iOS:** App Store guideline 3.1.1 doesn't allow unlocking features with our own codes inside the iOS app, so the card is hidden there. iOS users redeem on the web, and the access follows their account into the iOS app.
- **Partial discounts (not built yet):** the store charges the price, so "50 % off Premium for 3 months" has to be a store-side offer:
  - App Store promotional or offer codes
  - Google Play developer-determined offers
  - a discounted Web Billing product
  The planned design is to put those in a separate RevenueCat offering (e.g. `promo_50_3m`), store its identifier on the promo code, and have `src/lib/purchases.ts` buy from `Purchases.getOfferings().all[id]` instead of `default`. `discount_percent` already exists in `promo_codes`, but the admin API only accepts `100` until then.
