CREATE TYPE "public"."cefr_level" AS ENUM('B1', 'B2');--> statement-breakpoint
CREATE TYPE "public"."co_candidate_mode" AS ENUM('AI_PEER', 'HUMAN_LOCAL');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('ACTIVE', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."usage_source" AS ENUM('REALTIME_VOICE_AGENT', 'POST_EXAM_RUBRIC_EVAL');--> statement-breakpoint
CREATE TABLE "exam_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"topic_id" uuid,
	"level" "cefr_level" NOT NULL,
	"co_candidate_mode" "co_candidate_mode" NOT NULL,
	"status" "session_status" DEFAULT 'ACTIVE' NOT NULL,
	"transcript_json" jsonb,
	"evaluation_json" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"title_no" text NOT NULL,
	"level" "cefr_level" NOT NULL,
	"monologue_prompt_no" text NOT NULL,
	"discussion_prompt_no" text NOT NULL,
	"follow_up_questions_no" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_topics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"source" "usage_source" NOT NULL,
	"llm_model" varchar(64) NOT NULL,
	"llm_prompt_tokens" integer DEFAULT 0 NOT NULL,
	"llm_completion_tokens" integer DEFAULT 0 NOT NULL,
	"tts_characters" integer DEFAULT 0 NOT NULL,
	"stt_audio_seconds" numeric(10, 2) DEFAULT '0' NOT NULL,
	"estimated_cost_usd" numeric(10, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_quotas" (
	"user_id" varchar(128) PRIMARY KEY NOT NULL,
	"remaining_audio_seconds" integer DEFAULT 1800 NOT NULL,
	"total_llm_tokens_used" bigint DEFAULT 0 NOT NULL,
	"total_tts_characters_used" bigint DEFAULT 0 NOT NULL,
	"total_stt_seconds_used" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_topic_id_exam_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."exam_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_session_id_exam_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_exam_sessions_user_id" ON "exam_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_exam_sessions_status" ON "exam_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_exam_sessions_topic_id" ON "exam_sessions" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "idx_usage_ledger_session_id" ON "usage_ledger" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_usage_ledger_user_id" ON "usage_ledger" USING btree ("user_id");