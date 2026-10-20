CREATE TABLE "exam_themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"title_no" text NOT NULL,
	"description_no" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_themes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "theme_id" uuid;--> statement-breakpoint
ALTER TABLE "exam_topics" ADD COLUMN "theme_id" uuid;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_theme_id_exam_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."exam_themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_topics" ADD CONSTRAINT "exam_topics_theme_id_exam_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."exam_themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_exam_sessions_theme_id" ON "exam_sessions" USING btree ("theme_id");--> statement-breakpoint
CREATE INDEX "idx_exam_topics_theme_id" ON "exam_topics" USING btree ("theme_id");