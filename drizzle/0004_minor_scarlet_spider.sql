CREATE TABLE "learning_profiles" (
	"user_id" varchar(128) PRIMARY KEY NOT NULL,
	"insight_json" jsonb NOT NULL,
	"based_on_session_ids" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
