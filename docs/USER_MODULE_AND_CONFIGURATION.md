# User Module, Subscriptions & Configuration Guide

This document details the architecture, authentication system, tiered subscription models, daily quota limits, referral reward engine, and instructions on how administrators can update configuration parameters.

---

## 1. Overview of Implemented User Module

The user module provides:
1. **Authentication (Better Auth)**:
   - Email and password registration & login with secure hashing (`bcryptjs` / internal Better Auth crypto).
   - **Email verification** for email/password accounts: a 6-digit code *and* a link are sent in one email via [Resend](https://resend.com). Login is refused (`EMAIL_NOT_VERIFIED`) until verified. Codes/links expire after 15 minutes, allow 5 attempts, and can be re-sent every 60 seconds. Hashed codes are stored in the Better Auth `verification` table (`identifier = email-verify:<email>`). See `lib/email-verification.ts`.
   - Google OAuth authentication (`expo-auth-session` in the app, `google-auth-library` server verification & automatic account linking). Google accounts skip email verification. Linking Google to an existing *unverified* password account does **not** mark it verified, so a pre-registered password can't be used to take over the address.
   - Shared client/server form validation in `src/validation/auth.ts`.
   - Extensible Apple ID placeholder endpoint (`/api/auth/apple`) ready for future Apple Services ID configuration.
   - Session & token management supporting session cookies and Bearer JWTs.
2. **Tiered Subscriptions & Stripe Billing**:
   - Three tiers: **Free**, **Standard**, and **Premium**.
   - Stripe Checkout Sessions and webhooks handling plan upgrades, downgrades, and cancellations.
3. **Daily Test Quotas (Calendar Day Reset)**:
   - Users are restricted to a configurable number of tests per calendar day (resetting at 00:00:00 Europe/Oslo time).
   - Enforced on the server inside `POST /api/exam/start`.
4. **Referral Reward Engine**:
   - Each registered user receives a unique referral code (e.g. `A1B2C3D4`).
   - When a friend signs up with that code **and verifies their email** (or signs up with Google), the referrer receives extra bonus tests per day for a configurable number of days.
5. **Web Admin Configuration Portal**:
   - Web UI at `/admin` (under the **⚙️ Abonnement & Verveinnstillinger** tab) allowing administrators to modify daily test limits, monthly prices, feature bullet lists per tier, and referral bonus days without code changes or server redeployments.
6. **Database Fallback & Seeding Strategy**:
   - `src/db/seed.ts` idempotently seeds default tier configurations (`FREE`, `STANDARD`, `PREMIUM`) and referral bonus parameters into Neon PostgreSQL.
   - If database rows are uninitialized, the application transparently falls back to in-code defaults defined in `lib/tier-policy.ts`.

---

## 1b. Email Verification & Google Sign-In Setup

| Variable | Where | Purpose |
|---|---|---|
| `RESEND_API_KEY` | server | Resend API key. If unset in development, the code and link are logged to the server console instead of emailed. Required in production. |
| `EMAIL_FROM` | server | Sender, e.g. `Snakkly <no-reply@yourdomain.no>`. The domain must be verified in Resend (`onboarding@resend.dev` only delivers to your own Resend account address). |
| `NEXT_PUBLIC_APP_URL` / `BETTER_AUTH_URL` | server | Base URL used to build the verification link. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID` | server | Accepted audiences for Google ID tokens. If none are set (development only), unsigned dev tokens are accepted. |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | app | OAuth client IDs used by `expo-auth-session`. Without the ID for the current platform, the button falls back to a dev-only mock in `__DEV__` builds. |

Google Cloud Console setup: create a **Web** OAuth client (authorised JavaScript origin + redirect URI = your web app URL, e.g. `http://localhost:8081`), an **Android** client (package `no.norskapp.muntlig` + SHA-1 of the signing key) and an **iOS** client (bundle ID `no.norskapp.muntlig`). Native sign-in requires a development build (`npx expo run:android` / `run:ios`); Expo Go can't receive the redirect. The app URL scheme is `snakkly` (see `app.json`).

Migration `drizzle/0003_verify_existing_users.sql` marks all accounts that existed before verification was introduced as verified.

---

## 2. Configuration Parameters & Default Values

| Parameter | Location / Key | Default Value | Description |
|---|---|---|---|
| **Free Tier Limit** | `tier_configs.daily_test_limit` (`FREE`) | **1 test/day** | Allowed tests per calendar day for free users |
| **Free Tier Features** | `tier_configs.features_json` (`FREE`) | `['1 test per dag', 'B1 og B2 temaer', 'Full AI evaluering']` | In-app feature list displayed to Free users |
| **Standard Tier Limit**| `tier_configs.daily_test_limit` (`STANDARD`) | **5 tests/day** | Allowed tests per calendar day for Standard subscribers |
| **Standard Tier Price**| `tier_configs.price_cents` (`STANDARD`) | **14900 øre** (149 kr) | Monthly price for Standard plan |
| **Standard Tier Features**| `tier_configs.features_json` (`STANDARD`) | `['5 tester per dag', 'B1 og B2 temaer', 'Prioritert AI stemme', 'Detaljert tilbakemelding']` | In-app feature list displayed to Standard subscribers |
| **Premium Tier Limit** | `tier_configs.daily_test_limit` (`PREMIUM`) | **20 tests/day** | Allowed tests per calendar day for Premium subscribers |
| **Premium Tier Price** | `tier_configs.price_cents` (`PREMIUM`) | **29900 øre** (299 kr) | Monthly price for Premium plan |
| **Premium Tier Features**| `tier_configs.features_json` (`PREMIUM`) | `['Ubegrenset/20 tester per dag', 'Alt i Standard', 'Full historikk og uttaleanalyse', '24/7 tilgang']` | In-app feature list displayed to Premium subscribers |
| **Referral Bonus Tests** | `system_configs` (`REFERRAL_BONUS_DAILY_TESTS`) | **2 tests/day** | Extra daily tests awarded to referrer for each registered friend |
| **Referral Bonus Duration**| `system_configs` (`REFERRAL_BONUS_DURATION_DAYS`) | **7 days** | Number of days the referral bonus stays active |
| **Daily Quota Reset Time** | `lib/tier-policy.ts` | **00:00:00 Europe/Oslo** | Calendar midnight in Norwegian timezone |

---

## 3. Database Seeding & Fallback Strategy

The database includes an idempotent seeding script (`src/db/seed.ts` via `npm run db:seed`) that seeds:
1. Four realistic official Norskprøven oral topics (2 B1, 2 B2).
2. Test user quota (`test_user_candidate_1`).
3. Tier configurations (`tier_configs`) for `FREE`, `STANDARD`, and `PREMIUM` with daily test limits, monthly pricing, and default feature bullet lists.
4. System referral configurations (`system_configs`) for `REFERRAL_BONUS_DAILY_TESTS` (2) and `REFERRAL_BONUS_DURATION_DAYS` (7).

If the database tables are ever empty or unreachable, the application falls back safely to in-code defaults defined in [`lib/tier-policy.ts`](../lib/tier-policy.ts) (`DEFAULT_TIER_CONFIGS` and `DEFAULT_REFERRAL_CONFIG`).

---

## 4. How to Update Configurable Values

You have **three methods** to update test limits, pricing, feature lists, and referral settings:

### Method 1: Via the Web Admin Portal (Recommended)
1. Start the web server:
   ```bash
   npm run dev
   ```
2. Open your browser and navigate to:
   ```
   http://localhost:3000/admin
   ```
3. Enter your `ADMIN_SECRET` (configured in `.env.local`, defaults to `admin123` in dev).
4. Click on the tab **⚙️ Abonnement & Verveinnstillinger**.
5. In the form cards:
   - **Gratis Nivå (Free)**: Change the daily tests per day, and dynamically add, edit, or remove planned feature bullet points, then click **Lagre FREE plan**.
   - **Standard Nivå**: Adjust daily test limit, monthly price in NOK, and included features, then click **Lagre STANDARD plan**.
   - **Premium Nivå**: Adjust daily test limit, monthly price in NOK, and included features, then click **Lagre PREMIUM plan**.
   - **Verveprogram Innstillinger**: Change the bonus tests per day (e.g. +2) and bonus duration (e.g. 7 days), then click **Lagre Verveinnstillinger**.
   - **Oppfrisk**: Click **↻ Oppfrisk** at any time to reload the latest values directly from the database.
6. The changes take effect **immediately** for all users without restarting the application.

---

### Method 2: Via Admin REST API (`PUT /api/admin/config`)

You can automate or script configuration updates using HTTP PUT requests with the `x-admin-secret` header.

#### Update Tier Limit, Price & Features:
```bash
curl -X PUT http://localhost:3000/api/admin/config \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: your_admin_secret" \
  -d '{
    "tier": "STANDARD",
    "dailyTestLimit": 8,
    "priceCents": 19900,
    "currency": "NOK",
    "features": [
      "8 tester per dag",
      "B1 og B2 temaer",
      "Prioritert AI stemme",
      "Detaljert tilbakemelding"
    ]
  }'
```

#### Update Referral Bonus Parameters:
```bash
curl -X PUT http://localhost:3000/api/admin/config \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: your_admin_secret" \
  -d '{
    "bonusDailyTests": 3,
    "durationDays": 14
  }'
```

---

### Method 3: Directly via SQL in Database (psql / Neon Console)

You can also run SQL queries directly against your Neon PostgreSQL database:

```sql
-- 1. Update Free Tier to 2 tests per day:
INSERT INTO tier_configs (tier, daily_test_limit, price_cents, currency, features_json, updated_at)
VALUES ('FREE', 2, 0, 'NOK', '["2 tester per dag", "B1 og B2 temaer", "Full AI evaluering"]'::jsonb, NOW())
ON CONFLICT (tier) DO UPDATE
SET daily_test_limit = EXCLUDED.daily_test_limit,
    features_json = EXCLUDED.features_json,
    updated_at = NOW();

-- 2. Update Standard Tier to 10 tests per day and 179 NOK:
INSERT INTO tier_configs (tier, daily_test_limit, price_cents, currency, features_json, updated_at)
VALUES ('STANDARD', 10, 17900, 'NOK', '["10 tester per dag", "B1 og B2 temaer", "Prioritert AI stemme", "Detaljert tilbakemelding"]'::jsonb, NOW())
ON CONFLICT (tier) DO UPDATE
SET daily_test_limit = EXCLUDED.daily_test_limit,
    price_cents = EXCLUDED.price_cents,
    features_json = EXCLUDED.features_json,
    updated_at = NOW();

-- 3. Update Referral Bonus to +3 tests per day for 10 days:
INSERT INTO system_configs (key, value, description, updated_at)
VALUES
  ('REFERRAL_BONUS_DAILY_TESTS', '3', 'Antall ekstra tester per dag gitt for hver vervet venn', NOW()),
  ('REFERRAL_BONUS_DURATION_DAYS', '10', 'Antall dager vervebonusen er aktiv', NOW())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = NOW();
```

---

## 5. Database Migrations Workflow (`db:generate` & `db:migrate`)

When modifying database models in `src/db/schema.ts`:

1. **Generate SQL migration script**:
   ```bash
   npm run db:generate
   ```
   This generates a versioned `.sql` file in `drizzle/` (e.g. `drizzle/0001_tan_master_mold.sql`).

2. **Execute migration against database**:
   ```bash
   npm run db:migrate
   ```
   This runs `src/db/migrate.ts` which connects to `DATABASE_URL` / `DIRECT_DATABASE_URL` and applies all pending migrations safely.


