CREATE TYPE "public"."co_candidate_mode" AS ENUM('AI_PEER', 'HUMAN_LOCAL');--> statement-breakpoint
CREATE TYPE "public"."exam_level" AS ENUM('B1', 'B2');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('ACTIVE', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "exam_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"level" "exam_level" NOT NULL,
	"co_candidate_mode" "co_candidate_mode" NOT NULL,
	"topic" text NOT NULL,
	"status" "session_status" DEFAULT 'ACTIVE' NOT NULL,
	"transcript_json" jsonb,
	"evaluation_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"llm_prompt_tokens" integer DEFAULT 0 NOT NULL,
	"llm_completion_tokens" integer DEFAULT 0 NOT NULL,
	"tts_characters" integer DEFAULT 0 NOT NULL,
	"stt_audio_seconds" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"estimated_cost_usd" numeric(12, 6) DEFAULT '0.000000' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_quotas" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"remaining_seconds" integer DEFAULT 0 NOT NULL,
	"total_tokens_used" bigint DEFAULT 0 NOT NULL,
	"total_cost_usd" numeric(12, 6) DEFAULT '0.000000' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_session_id_exam_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_exam_sessions_user_id" ON "exam_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_exam_sessions_status" ON "exam_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_exam_sessions_created_at" ON "exam_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_ledger_session_id" ON "usage_ledger" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_usage_ledger_user_id" ON "usage_ledger" USING btree ("user_id");