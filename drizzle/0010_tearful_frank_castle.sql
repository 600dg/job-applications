ALTER TABLE "applications" ADD COLUMN "salary" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "job_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "job_description" text DEFAULT '' NOT NULL;