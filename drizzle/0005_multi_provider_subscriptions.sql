CREATE TYPE "public"."payment_provider" AS ENUM('STRIPE', 'APPLE', 'GOOGLE');--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "stripe_subscription_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "stripe_price_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "provider" "payment_provider" DEFAULT 'STRIPE' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "external_id" varchar(512);--> statement-breakpoint
-- Existing rows are all Stripe subscriptions: their external id is the Stripe subscription id.
UPDATE "subscriptions" SET "external_id" = "stripe_subscription_id" WHERE "external_id" IS NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "external_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "product_id" varchar(255);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "environment" varchar(16) DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "iap_account_token" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_subscriptions_provider_external" ON "subscriptions" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_user_id" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_iap_account_token_unique" UNIQUE("iap_account_token");