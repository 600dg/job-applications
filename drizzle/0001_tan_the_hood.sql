ALTER TABLE "resumes" ADD COLUMN "page_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "parse_status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "extracted_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "ats_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "ats_analysis" jsonb NOT NULL;