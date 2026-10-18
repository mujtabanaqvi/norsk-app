# User Module, Subscriptions & Configuration Guide

This document details the architecture, authentication system, tiered subscription models, daily quota limits, referral reward engine, and instructions on how administrators can update configuration parameters.

---

## 1. Overview of Implemented User Module

The user module provides:
1. **Authentication (Better Auth)**:
   - Email and password registration & login with secure hashing (`bcryptjs` / internal Better Auth crypto).
   - Google OAuth authentication (`google-auth-library` server verification & automatic account linking).
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
   - When a friend signs up with that code, the referrer receives extra bonus tests per day for a configurable number of days.
5. **Web Admin Configuration Portal**:
   - Web UI at `/admin` (under the **⚙️ Abonnement & Verveinnstillinger** tab) allowing administrators to modify daily test limits, monthly prices, and referral bonus days without code changes or server redeployments.

---

## 2. Configuration Parameters & Default Values

| Parameter | Location / Key | Default Value | Description |
|---|---|---|---|
| **Free Tier Limit** | `tier_configs.daily_test_limit` (`FREE`) | **1 test/day** | Allowed tests per calendar day for free users |
| **Standard Tier Limit**| `tier_configs.daily_test_limit` (`STANDARD`) | **5 tests/day** | Allowed tests per calendar day for Standard subscribers |
| **Standard Tier Price**| `tier_configs.price_cents` (`STANDARD`) | **14900 øre** (149 kr) | Monthly price for Standard plan |
| **Premium Tier Limit** | `tier_configs.daily_test_limit` (`PREMIUM`) | **20 tests/day** | Allowed tests per calendar day for Premium subscribers |
| **Premium Tier Price** | `tier_configs.price_cents` (`PREMIUM`) | **29900 øre** (299 kr) | Monthly price for Premium plan |
| **Referral Bonus Tests** | `system_configs` (`REFERRAL_BONUS_DAILY_TESTS`) | **2 tests/day** | Extra daily tests awarded to referrer for each registered friend |
| **Referral Bonus Duration**| `system_configs` (`REFERRAL_BONUS_DURATION_DAYS`) | **7 days** | Number of days the referral bonus stays active |
| **Daily Quota Reset Time** | `lib/tier-policy.ts` | **00:00:00 Europe/Oslo** | Calendar midnight in Norwegian timezone |

---

## 3. How to Update Configurable Values

You have **three methods** to update test limits, pricing, and referral settings:

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
   - **Gratis Nivå (Free)**: Change the daily tests per day (e.g. 1 to 2) and click **Lagre Gratis Nivå**.
   - **Standard Nivå**: Adjust the daily test limit and/or monthly price in NOK, then click **Lagre Standard Nivå**.
   - **Premium Nivå**: Adjust the daily test limit and/or monthly price in NOK, then click **Lagre Premium Nivå**.
   - **Verveprogram Innstillinger**: Change the bonus tests per day (e.g. +2) and bonus duration (e.g. 7 days), then click **Lagre Verveinnstillinger**.
6. The changes take effect **immediately** for all users without restarting the application.

---

### Method 2: Via Admin REST API (`PUT /api/admin/config`)

You can automate or script configuration updates using HTTP PUT requests with the `x-admin-secret` header.

#### Update Tier Limit & Price:
```bash
curl -X PUT http://localhost:3000/api/admin/config \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: your_admin_secret" \
  -d '{
    "tier": "STANDARD",
    "dailyTestLimit": 8,
    "priceCents": 19900,
    "currency": "NOK"
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
INSERT INTO tier_configs (tier, daily_test_limit, price_cents, currency, updated_at)
VALUES ('FREE', 2, 0, 'NOK', NOW())
ON CONFLICT (tier) DO UPDATE
SET daily_test_limit = EXCLUDED.daily_test_limit, updated_at = NOW();

-- 2. Update Standard Tier to 10 tests per day and 179 NOK:
INSERT INTO tier_configs (tier, daily_test_limit, price_cents, currency, updated_at)
VALUES ('STANDARD', 10, 17900, 'NOK', NOW())
ON CONFLICT (tier) DO UPDATE
SET daily_test_limit = EXCLUDED.daily_test_limit, price_cents = EXCLUDED.price_cents, updated_at = NOW();

-- 3. Update Referral Bonus to +3 tests per day for 10 days:
INSERT INTO system_configs (key, value, description, updated_at)
VALUES
  ('REFERRAL_BONUS_DAILY_TESTS', '3', 'Antall ekstra tester per dag gitt for hver vervet venn', NOW()),
  ('REFERRAL_BONUS_DURATION_DAYS', '10', 'Antall dager vervebonusen er aktiv', NOW())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = NOW();
```

---

## 4. Database Migrations Workflow (`db:generate` & `db:migrate`)

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

