ALTER TABLE "tier_configs" ADD COLUMN "daily_audio_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_quotas" ADD COLUMN "audio_seconds_used_today" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_quotas" ADD COLUMN "audio_usage_day" date;--> statement-breakpoint
UPDATE "tier_configs" SET "daily_audio_minutes" = 90 WHERE "tier" = 'STANDARD';--> statement-breakpoint
UPDATE "tier_configs" SET "daily_audio_minutes" = 180 WHERE "tier" = 'PREMIUM';