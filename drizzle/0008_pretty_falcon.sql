CREATE TABLE "gmail_message_reviews" (
	"owner_id" text NOT NULL,
	"gmail_message_id" text NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"analysis_version" integer NOT NULL,
	"analyses" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gmail_message_reviews_owner_id_gmail_message_id_pk" PRIMARY KEY("owner_id","gmail_message_id")
);
--> statement-breakpoint
CREATE INDEX "gmail_message_reviews_owner_idx" ON "gmail_message_reviews" USING btree ("owner_id");