# Payments & Subscriptions

Snakkly sells two monthly subscriptions (**Standard**, **Premium**) through three channels:

| Platform | Billing | Why |
|---|---|---|
| iOS app | App Store in-app purchase (StoreKit 2 via `expo-iap`) | App Store Guideline 3.1.1 requires IAP for digital subscriptions. |
| Android app | Google Play Billing (via `expo-iap`) | Play's payments policy requires Play Billing for digital subscriptions. |
| Web (Expo web build) | Stripe Checkout | No store rules on the web. |

The **server is the only source of truth**. The client never decides a user's tier. Every purchase is verified server-side, and every provider writes to the same `subscriptions` table. `users.subscription_tier` is always recomputed from that table by `recomputeUserTier()` in `lib/entitlements.ts`: the highest tier among subscriptions that are `ACTIVE`/`TRIALING` and still inside their paid period. One provider's cancellation therefore never downgrades a user who still pays through another.

## Flows

### Native (iOS / Android)

1. `SubscriptionScreen` → `buySubscription(tier, user.iapAccountToken)` in `src/lib/iap.ts` opens the store sheet. `iapAccountToken` (a per-user UUID) is sent as Apple `appAccountToken` / Google `obfuscatedAccountId`, which ties the store purchase to the Snakkly account.
2. The store delivers the result to `purchaseUpdatedListener` (started in `App.tsx` while logged in).
3. The listener posts the purchase to the server:
   - iOS: `POST /api/iap/apple/verify { signedTransaction }`, the StoreKit 2 JWS (`purchase.purchaseToken`). It is verified offline against Apple's root CAs in `certs/apple/`.
   - Android: `POST /api/iap/google/verify { purchaseToken }`. The server fetches `purchases.subscriptionsv2` from the Play Developer API and **acknowledges** the purchase. Unacknowledged purchases are refunded after 3 days.
4. Only after the server confirms does the client call `finishTransaction`. If verification fails, the store replays the transaction on the next launch.
5. The app navigates to **PaymentResult**, which polls `/api/auth/me` until the new tier shows, then offers "Start a test".
6. Renewals, cancellations, refunds and billing retries arrive server-to-server:
   - Apple: App Store Server Notifications V2 → `POST /api/iap/apple/notifications`
   - Google: Real-Time Developer Notifications via Pub/Sub push → `POST /api/iap/google/rtdn`

"Restore purchases" (required by Apple) re-verifies everything `getAvailablePurchases()` returns. A store subscription that is already linked to a different Snakkly account is refused with `403 OWNED_BY_OTHER_ACCOUNT`.

### Web (Stripe)

1. `SubscriptionScreen` calls `POST /api/stripe/checkout` with `successUrl = <origin>/payment/success?session_id={CHECKOUT_SESSION_ID}` and `cancelUrl = <origin>/payment/canceled`. Return URLs must be on the request origin or `NEXT_PUBLIC_APP_URL`.
2. The browser goes to Stripe Checkout. Stripe then redirects back into the app, where React Navigation `linking` maps `payment/:result` to **PaymentResult**.
3. PaymentResult calls `GET /api/stripe/checkout/session?session_id=…`. If the session is paid, that endpoint fulfils immediately. `POST /api/stripe/webhook` fulfils the same subscription idempotently, so whichever arrives first wins.

If a user already has an active subscription from another channel, purchasing is disabled in the UI ("managed through …"). Stripe checkout also refuses it with `409 MANAGED_BY_OTHER_PROVIDER`.

## Product ids

Defined once in `src/lib/iap-products.ts` and used by both client and server:

| Tier | Product id (App Store & Play) |
|---|---|
| Standard | `snakkly.standard.monthly` |
| Premium | `snakkly.premium.monthly` |

## One-time store setup

**App Store Connect**
1. Create one subscription group (e.g. "Snakkly") with both products, both 1 month. Keep Premium at a higher level than Standard so that switching between them counts as an upgrade or downgrade.
2. App Information → App Store Server Notifications → Version 2 URL for both Production and Sandbox: `https://<api-host>/api/iap/apple/notifications`.
3. Note the app's **Apple ID** (numeric) → `APPLE_APP_APPLE_ID`. Production verification needs it.
4. Create Sandbox testers under Users and Access → Sandbox.

**Google Play Console**
1. Monetize → Subscriptions: create both product ids, each with a monthly auto-renewing base plan.
2. Google Cloud: create a service account and invite it in Play Console → Users and permissions with "View financial data" and "Manage orders and subscriptions". Put its JSON key in `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
3. Create a Pub/Sub topic and grant `google-play-developer-notifications@system.gserviceaccount.com` the Publisher role on it. Then set the topic in Play Console → Monetization setup → Real-time developer notifications.
4. Create a **push** subscription to `https://<api-host>/api/iap/google/rtdn` with authentication enabled: choose a service account, and set the audience to the same URL (→ `GOOGLE_RTDN_AUDIENCE`, and that service account's email → `GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL`).
5. Add license testers (Setup → License testing) and upload a build to the internal testing track. Play Billing only works for builds installed from Play.

## Environment variables

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe API key (`sk_test_…` locally). |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret. Required in production, where unsigned webhooks are rejected. |
| `APPLE_BUNDLE_ID` | Defaults to `com.snakkly.app`. |
| `APPLE_APP_APPLE_ID` | Numeric App Store app id. Enables production verification. |
| `APPLE_ALLOW_SANDBOX` | `true` to accept sandbox transactions in a production deployment. Needed during App Review. |
| `APPLE_ROOT_CERTS_DIR` | Optional override for `certs/apple`. |
| `GOOGLE_PLAY_PACKAGE_NAME` | Defaults to `com.snakkly.app`. |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Service-account key JSON (one line). |
| `GOOGLE_RTDN_AUDIENCE` | Audience configured on the Pub/Sub push subscription. |
| `GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL` | Optional: only accept pushes signed by this service account. |

## Testing locally

- **Web / Stripe:** run `npm run dev` and `npm run mobile:web`, plus `stripe listen --forward-to localhost:3000/api/stripe/webhook` (put the printed `whsec_…` in `.env.local`). Pay with card `4242 4242 4242 4242`. You should land on PaymentResult inside the web app. It works even without `stripe listen`, because the session lookup fulfils the subscription.
- **Native IAP:** needs a development build (`npx expo run:android` / `npx expo run:ios`). Store purchases do not work in Expo Go. The store has to reach the API, so point `EXPO_PUBLIC_API_URL` at a reachable host. Notifications additionally need a public URL (e.g. a tunnel).
  - iOS: sign in with a Sandbox tester on the device. Sandbox renewals are accelerated (1 month ≈ 5 minutes).
  - Android: install from the internal testing track as a license tester. Test renewals are accelerated too.
