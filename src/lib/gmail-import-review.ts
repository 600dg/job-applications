import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { applications, emailSuggestions, gmailImportReviews } from "@/db/schema";
import { toApplication } from "@/lib/application-data";
import type { Application, ApplicationStatus } from "@/lib/applications";
import {
  findMatchingApplication,
  type ApplicationEmailAnalysis,
  type GmailImportReview,
  type GmailMessageSummary,
} from "@/lib/email-suggestions";

const STATUS_RANK: Record<ApplicationStatus, number> = {
  Wishlist: 0,
  Applied: 1,
  Assessment: 2,
  Interview: 3,
  Offer: 4,
  Rejected: 5,
};

function toReview(row: typeof gmailImportReviews.$inferSelect): GmailImportReview {
  return {
    id: row.id,
    gmailMessageId: row.gmailMessageId,
    subject: row.subject,
    sender: row.sender,
    receivedAt: row.receivedAt.toISOString(),
    excerpt: row.excerpt,
    applications: row.analyses,
  };
}

export async function listPendingGmailImportReviews(ownerId: string): Promise<GmailImportReview[]> {
  const rows = await getDb()
    .select()
    .from(gmailImportReviews)
    .where(and(eq(gmailImportReviews.ownerId, ownerId), eq(gmailImportReviews.state, "pending")))
    .orderBy(desc(gmailImportReviews.receivedAt))
    .limit(100);
  return rows.map(toReview);
}

export async function stageGmailImportReview(
  ownerId: string,
  message: GmailMessageSummary,
  analyses: ApplicationEmailAnalysis[],
) {
  if (!analyses.length) return;
  await getDb()
    .insert(gmailImportReviews)
    .values({
      ownerId,
      gmailMessageId: message.id,
      gmailThreadId: message.threadId,
      subject: message.subject,
      sender: message.sender,
      receivedAt: validDate(message.receivedAt),
      excerpt: message.snippet.slice(0, 500),
      analyses,
    })
    .onConflictDoNothing({
      target: [gmailImportReviews.ownerId, gmailImportReviews.gmailMessageId],
    });
}

export async function resolveGmailImportReviews(ownerId: string, candidateIds: string[], excludedIds: string[]) {
  const db = getDb();
  const uniqueIds = Array.from(new Set(candidateIds));
  const excluded = new Set(excludedIds);
  if (!uniqueIds.length) {
    return { created: 0, updated: 0, applications: await listOwnerApplications(ownerId) };
  }

  const candidates = await db
    .select()
    .from(gmailImportReviews)
    .where(
      and(
        eq(gmailImportReviews.ownerId, ownerId),
        eq(gmailImportReviews.state, "pending"),
        inArray(gmailImportReviews.id, uniqueIds),
      ),
    )
    .orderBy(gmailImportReviews.receivedAt);

  const ownedIds = new Set(candidates.map((candidate) => candidate.id));
  if (ownedIds.size !== uniqueIds.length) throw new Error("One or more review items are no longer pending.");
  if (excludedIds.some((id) => !ownedIds.has(id))) throw new Error("An excluded review item is invalid.");

  const excludedCandidateIds = candidates
    .filter((candidate) => excluded.has(candidate.id))
    .map((candidate) => candidate.id);
  if (excludedCandidateIds.length) {
    await db
      .update(gmailImportReviews)
      .set({ state: "excluded", updatedAt: new Date() })
      .where(and(eq(gmailImportReviews.ownerId, ownerId), inArray(gmailImportReviews.id, excludedCandidateIds)));
  }

  const rows = await db.select().from(applications).where(eq(applications.ownerId, ownerId));
  const applicationMap = new Map(rows.map((row) => [row.id, toApplication(row)]));
  let created = 0;
  let updated = 0;

  for (const candidate of candidates) {
    if (excluded.has(candidate.id)) continue;
    const message: GmailMessageSummary = {
      id: candidate.gmailMessageId,
      threadId: candidate.gmailThreadId,
      subject: candidate.subject,
      sender: candidate.sender,
      receivedAt: candidate.receivedAt,
      snippet: candidate.excerpt,
    };

    for (const analysis of candidate.analyses) {
      if (analysis.confidence < 90) continue;
      let current = findMatchingApplication(message, Array.from(applicationMap.values()), analysis) ?? undefined;
      let newlyCreated = false;
      const receivedAt = validDate(candidate.receivedAt);

      if (!current) {
        const [inserted] = await db
          .insert(applications)
          .values({
            ownerId,
            company: analysis.company,
            role: analysis.role,
            location: "Not specified",
            status: analysis.detectedStatus,
            appliedDate: receivedAt.toISOString().slice(0, 10),
            source: "Gmail",
            notes: "Imported from a Gmail job application email after review.",
            gmailOriginMessageId: message.id,
            updatedAt: receivedAt,
          })
          .onConflictDoNothing({
            target: [applications.ownerId, applications.gmailOriginMessageId, applications.company, applications.role],
          })
          .returning();
        const row =
          inserted ??
          (await db
            .select()
            .from(applications)
            .where(
              and(
                eq(applications.ownerId, ownerId),
                eq(applications.gmailOriginMessageId, message.id),
                eq(applications.company, analysis.company),
                eq(applications.role, analysis.role),
              ),
            )
            .limit(1)
            .then(([existing]) => existing));
        if (!row) continue;
        current = toApplication(row);
        newlyCreated = Boolean(inserted);
        applicationMap.set(current.id, current);
        if (newlyCreated) created += 1;
      }

      const statusChanged =
        !newlyCreated &&
        shouldApplyStatus(current.status, analysis.detectedStatus) &&
        current.status !== analysis.detectedStatus;
      const timestampChanged = !newlyCreated && receivedAt.getTime() > new Date(current.updatedAt).getTime();
      const [audit] = await db
        .insert(emailSuggestions)
        .values({
          ownerId,
          applicationId: current.id,
          gmailMessageId: message.id,
          gmailThreadId: message.threadId,
          subject: message.subject,
          sender: message.sender,
          receivedAt,
          excerpt: message.snippet,
          detectedStatus: analysis.detectedStatus,
          confidence: analysis.confidence,
          reason: analysis.reason,
          state: newlyCreated || statusChanged || timestampChanged ? "processing" : "ignored",
        })
        .onConflictDoNothing()
        .returning({ id: emailSuggestions.id });

      if (!audit || newlyCreated || (!statusChanged && !timestampChanged)) {
        if (audit && newlyCreated) {
          await markAuditApplied(ownerId, audit.id);
        }
        continue;
      }

      const [changed] = await db
        .update(applications)
        .set({
          ...(statusChanged ? { status: analysis.detectedStatus } : {}),
          updatedAt: timestampChanged ? receivedAt : new Date(current.updatedAt),
        })
        .where(and(eq(applications.id, current.id), eq(applications.ownerId, ownerId)))
        .returning();
      if (changed) {
        const application = toApplication(changed);
        applicationMap.set(application.id, application);
        if (statusChanged) updated += 1;
        await markAuditApplied(ownerId, audit.id);
      }
    }

    await db
      .update(gmailImportReviews)
      .set({ state: "applied", updatedAt: new Date() })
      .where(and(eq(gmailImportReviews.id, candidate.id), eq(gmailImportReviews.ownerId, ownerId)));
  }

  return { created, updated, applications: sortApplications(Array.from(applicationMap.values())) };
}

async function markAuditApplied(ownerId: string, id: string) {
  await getDb()
    .update(emailSuggestions)
    .set({ state: "applied", updatedAt: new Date() })
    .where(and(eq(emailSuggestions.id, id), eq(emailSuggestions.ownerId, ownerId)));
}

function shouldApplyStatus(current: ApplicationStatus, detected: ApplicationStatus) {
  if (detected === "Offer" || detected === "Rejected") return true;
  return STATUS_RANK[detected] >= STATUS_RANK[current];
}

function validDate(date: Date) {
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function sortApplications(items: Application[]) {
  return items.sort(
    (left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.company.localeCompare(right.company),
  );
}

async function listOwnerApplications(ownerId: string) {
  const rows = await getDb().select().from(applications).where(eq(applications.ownerId, ownerId));
  return sortApplications(rows.map(toApplication));
}
