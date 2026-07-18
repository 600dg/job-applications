DROP INDEX "applications_owner_gmail_origin_idx";--> statement-breakpoint
DROP INDEX "email_suggestions_owner_message_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "applications_owner_gmail_origin_idx" ON "applications" USING btree ("owner_id","gmail_origin_message_id","company","role");--> statement-breakpoint
CREATE UNIQUE INDEX "email_suggestions_owner_message_idx" ON "email_suggestions" USING btree ("owner_id","gmail_message_id","application_id");