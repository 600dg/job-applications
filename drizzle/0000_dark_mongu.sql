CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"location" text NOT NULL,
	"status" text NOT NULL,
	"applied_date" date NOT NULL,
	"source" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"file_name" text NOT NULL,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"sample_data_seeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "applications_owner_idx" ON "applications" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "applications_owner_status_idx" ON "applications" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "applications_owner_applied_date_idx" ON "applications" USING btree ("owner_id","applied_date");--> statement-breakpoint
CREATE INDEX "resumes_owner_idx" ON "resumes" USING btree ("owner_id");