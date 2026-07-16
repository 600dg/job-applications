CREATE TABLE "job_provider_usage" (
	"provider" text NOT NULL,
	"period_kind" text NOT NULL,
	"period_start" date NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_provider_usage_provider_period_kind_period_start_pk" PRIMARY KEY("provider","period_kind","period_start")
);
--> statement-breakpoint
CREATE TABLE "job_search_cooldowns" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"last_searched_at" timestamp with time zone DEFAULT now() NOT NULL
);
