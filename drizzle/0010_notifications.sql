CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(32) DEFAULT 'ANNOUNCEMENT' NOT NULL,
	"title_no" text NOT NULL,
	"title_en" text NOT NULL,
	"message_no" text NOT NULL,
	"message_en" text NOT NULL,
	"action_route" varchar(64),
	"target_audience" varchar(32) DEFAULT 'ALL' NOT NULL,
	"target_user_id" varchar(128),
	"created_by_id" varchar(128) DEFAULT 'SYSTEM' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"notification_id" uuid,
	"type" varchar(32) DEFAULT 'SYSTEM' NOT NULL,
	"title_no" text NOT NULL,
	"title_en" text NOT NULL,
	"message_no" text NOT NULL,
	"message_en" text NOT NULL,
	"action_route" varchar(64),
	"dedup_key" varchar(128),
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_created_at" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notifications_type" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_notifications_user_created" ON "user_notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_notifications_user_unread" ON "user_notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_notifications_dedup" ON "user_notifications" USING btree ("user_id","dedup_key");

