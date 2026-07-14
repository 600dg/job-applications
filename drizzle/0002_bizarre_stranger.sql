CREATE TABLE "email_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"application_id" uuid NOT NULL,
	"gmail_message_id" text NOT NULL,
	"gmail_thread_id" text NOT NULL,
	"subject" text NOT NULL,
	"sender" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"excerpt" text NOT NULL,
	"detected_status" text NOT NULL,
	"confidence" integer NOT NULL,
	"reason" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_suggestions_owner_state_idx" ON "email_suggestions" USING btree ("owner_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "email_suggestions_owner_message_idx" ON "email_suggestions" USING btree ("owner_id","gmail_message_id");