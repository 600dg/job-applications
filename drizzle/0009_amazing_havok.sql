CREATE TABLE "gmail_import_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"gmail_message_id" text NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"subject" text NOT NULL,
	"sender" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"excerpt" text NOT NULL,
	"analyses" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "gmail_import_reviews_owner_state_idx" ON "gmail_import_reviews" USING btree ("owner_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "gmail_import_reviews_owner_message_idx" ON "gmail_import_reviews" USING btree ("owner_id","gmail_message_id");