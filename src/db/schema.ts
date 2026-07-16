import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AtsAnalysis } from "@/lib/resumes";

export const userProfiles = pgTable("user_profiles", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  sampleDataSeeded: boolean("sample_data_seeded").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    company: text("company").notNull(),
    role: text("role").notNull(),
    location: text("location").notNull(),
    status: text("status").notNull(),
    appliedDate: date("applied_date").notNull(),
    source: text("source").notNull(),
    notes: text("notes").notNull().default(""),
    gmailOriginMessageId: text("gmail_origin_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("applications_owner_idx").on(table.ownerId),
    index("applications_owner_status_idx").on(table.ownerId, table.status),
    index("applications_owner_applied_date_idx").on(table.ownerId, table.appliedDate),
    uniqueIndex("applications_owner_gmail_origin_idx").on(table.ownerId, table.gmailOriginMessageId),
  ],
);

export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    fileName: text("file_name").notNull(),
    blobUrl: text("blob_url").notNull(),
    blobPathname: text("blob_pathname").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    pageCount: integer("page_count").notNull().default(0),
    parseStatus: text("parse_status").notNull().default("ready"),
    extractedText: text("extracted_text").notNull().default(""),
    atsScore: integer("ats_score").notNull().default(0),
    atsAnalysis: jsonb("ats_analysis").$type<AtsAnalysis>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("resumes_owner_idx").on(table.ownerId)],
);

export const emailSuggestions = pgTable(
  "email_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    applicationId: uuid("application_id").notNull(),
    gmailMessageId: text("gmail_message_id").notNull(),
    gmailThreadId: text("gmail_thread_id").notNull(),
    subject: text("subject").notNull(),
    sender: text("sender").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    excerpt: text("excerpt").notNull(),
    detectedStatus: text("detected_status").notNull(),
    confidence: integer("confidence").notNull(),
    reason: text("reason").notNull(),
    state: text("state").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("email_suggestions_owner_state_idx").on(table.ownerId, table.state),
    uniqueIndex("email_suggestions_owner_message_idx").on(table.ownerId, table.gmailMessageId),
  ],
);

export const gmailConnections = pgTable("gmail_connections", {
  ownerId: text("owner_id").primaryKey(),
  email: text("email").notNull(),
  status: text("status").notNull().default("active"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobProviderUsage = pgTable(
  "job_provider_usage",
  {
    provider: text("provider").notNull(),
    periodKind: text("period_kind").notNull(),
    periodStart: date("period_start").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.provider, table.periodKind, table.periodStart] })],
);

export const jobSearchCooldowns = pgTable("job_search_cooldowns", {
  ownerId: text("owner_id").primaryKey(),
  lastSearchedAt: timestamp("last_searched_at", { withTimezone: true }).notNull().defaultNow(),
});
