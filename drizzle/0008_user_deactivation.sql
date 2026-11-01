ALTER TABLE "user" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_user_created_at" ON "user" USING btree ("created_at");