import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { applications, emailSuggestions, gmailConnections, gmailMessageReviews } from "@/db/schema";
import {
  GMAIL_AI_ANALYSIS_VERSION,
  verifyApplicationEmailsWithAi,
  type EmailReviewInput,
} from "@/lib/ai-email-analysis";
import { toApplication } from "@/lib/application-data";
import type { Application, ApplicationStatus } from "@/lib/applications";
import {
  analyzeApplicationEmails,
  findMatchingApplication,
  findMatchingApplications,
  isPotentialApplicationEmail,
  type GmailMessageSummary,
} from "@/lib/email-suggestions";
import { GmailAuthorizationError, requireClerkGmailAccess } from "@/lib/gmail-connection";

const GMAIL_QUERY =
  'newer_than:365d -in:sent -in:drafts -in:spam -in:trash -from:mg.brokerbay.com -from:skyslope.com -subject:"registered offer" -subject:"offer presentation" -subject:"rental application" {"your application" "your applications" "thank you for applying" "thank you for your interest" "application acknowledgement" "application confirmation" "application submitted" "applications submitted" "application status" "application update" subject:application subject:candidacy subject:interview subject:assessment "talent acquisition" "hiring process" "selection process" "next steps" "phone screen" "screening call" "interview availability" "interview invitation" "invite you to interview" "meet the team" assessment "coding challenge" "skills test" "pre-employment assessment" "background check" "reference check" "not moving forward" "not be moving forward" "regret to inform" "no longer under consideration" "decided not to proceed" "pursue other candidates" "other candidates" "not selected" "not successful" "will not proceed" "position has been filled" "job offer" "offer of employment" from:greenhouse.io from:ashbyhq.com from:myworkday.com from:smartrecruiters.com from:icims.com from:lever.co from:dayforce.com}';
const STATUS_RANK: Record<ApplicationStatus, number> = {
  Wishlist: 0,
  Applied: 1,
  Assessment: 2,
  Interview: 3,
  Offer: 4,
  Rejected: 5,
};
const MESSAGE_BATCH_SIZE = 10;
const GMAIL_LIST_PAGE_SIZE = 100;
const GMAIL_MAX_PAGES = 5;
const MAX_AI_REVIEWS_PER_SYNC = 30;

type GmailListResponse = { messages?: Array<{ id: string; threadId: string }>; nextPageToken?: string };
type GmailPayload = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPayload[];
  headers?: Array<{ name: string; value: string }>;
};
type GmailMessageResponse = {
  id: string;
  threadId: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPayload;
};
type GmailProfileResponse = { emailAddress?: string };

function header(message: GmailMessageResponse, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBodyData(data: string) {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|p|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function messageBody(payload?: GmailPayload): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBodyData(payload.body.data);
  const childText = (payload.parts ?? []).map(messageBody).filter(Boolean);
  if (childText.length) return childText.join("\n");
  if (payload.mimeType === "text/html" && payload.body?.data) return stripHtml(decodeBodyData(payload.body.data));
  return payload.body?.data ? decodeBodyData(payload.body.data) : "";
}

async function gmailFetch<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: "Bearer " + accessToken }, cache: "no-store" });
  if (response.status === 401 || response.status === 403) {
    throw new GmailAuthorizationError("Google authorization needs attention. Reconnect Gmail in Account settings.");
  }
  if (!response.ok) throw new Error("Gmail returned " + response.status + ".");
  return response.json() as Promise<T>;
}

async function loadMessages(accessToken: string, references: Array<{ id: string }>) {
  const messages: GmailMessageResponse[] = [];
  for (let index = 0; index < references.length; index += MESSAGE_BATCH_SIZE) {
    const batch = references.slice(index, index + MESSAGE_BATCH_SIZE);
    messages.push(
      ...(await Promise.all(
        batch.map(({ id }) =>
          gmailFetch<GmailMessageResponse>(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(id) + "?format=full",
            accessToken,
          ),
        ),
      )),
    );
  }
  return messages;
}

async function listMessageReferences(accessToken: string) {
  const references = new Map<string, { id: string; threadId: string }>();
  let pageToken = "";
  for (let page = 0; page < GMAIL_MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ maxResults: String(GMAIL_LIST_PAGE_SIZE), q: GMAIL_QUERY });
    if (pageToken) params.set("pageToken", pageToken);
    const list = await gmailFetch<GmailListResponse>(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?" + params,
      accessToken,
    );
    for (const message of list.messages ?? []) references.set(message.id, message);
    pageToken = list.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return Array.from(references.values());
}

function shouldAutoApply(currentStatus: ApplicationStatus, detectedStatus: ApplicationStatus, confidence: number) {
  if (confidence < 90) return false;
  if (detectedStatus === "Offer" || detectedStatus === "Rejected") return true;
  return STATUS_RANK[detectedStatus] >= STATUS_RANK[currentStatus];
}

function sortedApplications(applicationMap: Map<string, Application>) {
  return Array.from(applicationMap.values()).sort(
    (left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.company.localeCompare(right.company),
  );
}

export async function syncGmailOwner(ownerId: string) {
  const db = getDb();
  try {
    const { accessToken, email: clerkEmail } = await requireClerkGmailAccess(ownerId);
    const profile = await gmailFetch<GmailProfileResponse>(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      accessToken,
    );
    const email = profile.emailAddress || clerkEmail;
    if (!email)
      throw new GmailAuthorizationError("Google did not return a Gmail address. Reconnect Gmail in Account settings.");

    await db
      .insert(gmailConnections)
      .values({
        ownerId,
        email,
        status: "active",
        lastError: "",
      })
      .onConflictDoUpdate({
        target: gmailConnections.ownerId,
        set: { email, status: "active", lastError: "", updatedAt: new Date() },
      });

    const references = await listMessageReferences(accessToken);
    const messages = await loadMessages(accessToken, references);
    const summaries = messages
      .map((message): GmailMessageSummary => ({
        id: message.id,
        threadId: message.threadId,
        subject: header(message, "Subject") || "No subject",
        sender: header(message, "From") || "Unknown sender",
        receivedAt: message.internalDate ? new Date(Number(message.internalDate)) : new Date(header(message, "Date")),
        snippet: message.snippet ?? "",
        bodyText: messageBody(message.payload).slice(0, 20_000),
      }))
      .sort((left, right) => left.receivedAt.getTime() - right.receivedAt.getTime());

    const [rows, priorAudits, priorReviews] = await Promise.all([
      db.select().from(applications).where(eq(applications.ownerId, ownerId)),
      db
        .select({
          applicationId: emailSuggestions.applicationId,
          gmailMessageId: emailSuggestions.gmailMessageId,
          gmailThreadId: emailSuggestions.gmailThreadId,
        })
        .from(emailSuggestions)
        .where(eq(emailSuggestions.ownerId, ownerId)),
      db.select().from(gmailMessageReviews).where(eq(gmailMessageReviews.ownerId, ownerId)),
    ]);
    const applicationMap = new Map(rows.map((row) => [row.id, toApplication(row)]));
    const processedPairs = new Set(priorAudits.map((audit) => `${audit.gmailMessageId}:${audit.applicationId}`));
    const threadApplicationIds = new Map<string, Set<string>>();
    for (const audit of priorAudits) {
      const applicationIds = threadApplicationIds.get(audit.gmailThreadId) ?? new Set<string>();
      applicationIds.add(audit.applicationId);
      threadApplicationIds.set(audit.gmailThreadId, applicationIds);
    }

    const reviewMap = new Map(
      priorReviews
        .filter((review) => review.analysisVersion === GMAIL_AI_ANALYSIS_VERSION)
        .map((review) => [review.gmailMessageId, review.analyses]),
    );
    const pendingReviewMessages = summaries
      .filter((message) => isPotentialApplicationEmail(message) && !reviewMap.has(message.id))
      .sort((left, right) => right.receivedAt.getTime() - left.receivedAt.getTime());
    const reviewsThisSync = pendingReviewMessages.slice(0, MAX_AI_REVIEWS_PER_SYNC);
    if (reviewsThisSync.length) {
      const messagesByThread = new Map<string, GmailMessageSummary[]>();
      for (const message of summaries) {
        const threadMessages = messagesByThread.get(message.threadId) ?? [];
        threadMessages.push(message);
        messagesByThread.set(message.threadId, threadMessages);
      }
      const reviewInputs: EmailReviewInput[] = reviewsThisSync.map((message) => {
        const knownApplications = new Map<string, Application>();
        for (const applicationId of threadApplicationIds.get(message.threadId) ?? []) {
          const application = applicationMap.get(applicationId);
          if (application) knownApplications.set(application.id, application);
        }
        for (const application of findMatchingApplications(
          message,
          Array.from(applicationMap.values()),
          analyzeApplicationEmails(message),
        )) {
          knownApplications.set(application.id, application);
        }
        const earlierThreadMessages = (messagesByThread.get(message.threadId) ?? [])
          .filter((threadMessage) => threadMessage.receivedAt < message.receivedAt)
          .slice(-2);
        return {
          message,
          knownApplications: Array.from(knownApplications.values()).slice(0, 12),
          earlierThreadMessages,
        };
      });
      const verifiedReviews = await verifyApplicationEmailsWithAi(reviewInputs);
      for (const message of reviewsThisSync) {
        const analyses = verifiedReviews.get(message.id) ?? [];
        reviewMap.set(message.id, analyses);
        await db
          .insert(gmailMessageReviews)
          .values({
            ownerId,
            gmailMessageId: message.id,
            gmailThreadId: message.threadId,
            analysisVersion: GMAIL_AI_ANALYSIS_VERSION,
            analyses,
          })
          .onConflictDoUpdate({
            target: [gmailMessageReviews.ownerId, gmailMessageReviews.gmailMessageId],
            set: {
              gmailThreadId: message.threadId,
              analysisVersion: GMAIL_AI_ANALYSIS_VERSION,
              analyses,
              updatedAt: new Date(),
            },
          });
      }
    }

    let created = 0;
    let updated = 0;
    for (const message of summaries) {
      const analyses = reviewMap.get(message.id);
      if (!analyses?.length) continue;

      const targets = new Map<
        string,
        { application: Application; analysis?: (typeof analyses)[number]; newlyCreated: boolean }
      >();
      for (const analysis of analyses) {
        let current = findMatchingApplication(message, Array.from(applicationMap.values()), analysis) ?? undefined;
        let newlyCreated = false;

        if (!current && analysis.confidence >= 90) {
          const receivedAt = Number.isNaN(message.receivedAt.getTime()) ? new Date() : message.receivedAt;
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
              notes: "Imported automatically from a Gmail job application email.",
              gmailOriginMessageId: message.id,
              updatedAt: receivedAt,
            })
            .onConflictDoNothing({
              target: [
                applications.ownerId,
                applications.gmailOriginMessageId,
                applications.company,
                applications.role,
              ],
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
          if (row) {
            current = toApplication(row);
            applicationMap.set(current.id, current);
            newlyCreated = Boolean(inserted);
            if (newlyCreated) created += 1;
          }
        }

        if (current) targets.set(current.id, { application: current, analysis, newlyCreated });
      }

      for (const target of targets.values()) {
        const current = target.application;
        const analysis = target.analysis;
        const newlyCreated = target.newlyCreated;
        const processedPair = `${message.id}:${current.id}`;
        if (processedPairs.has(processedPair)) continue;
        const receivedAt = Number.isNaN(message.receivedAt.getTime()) ? new Date() : message.receivedAt;
        const confidence = analysis?.confidence ?? 90;
        const detectedStatus = analysis?.detectedStatus ?? current.status;
        const autoApply = newlyCreated || shouldAutoApply(current.status, detectedStatus, confidence);
        const statusChanged = !newlyCreated && autoApply && current.status !== detectedStatus;
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
            excerpt: message.snippet.slice(0, 500),
            detectedStatus,
            confidence,
            reason: analysis?.reason ?? "OpenAI verified this update against an existing Gmail application.",
            state: newlyCreated || statusChanged || timestampChanged ? "processing" : "ignored",
          })
          .onConflictDoNothing()
          .returning({ id: emailSuggestions.id });
        if (!audit) continue;

        processedPairs.add(processedPair);
        const threadIds = threadApplicationIds.get(message.threadId) ?? new Set<string>();
        threadIds.add(current.id);
        threadApplicationIds.set(message.threadId, threadIds);
        if (newlyCreated) {
          await db
            .update(emailSuggestions)
            .set({ state: "applied", updatedAt: new Date() })
            .where(and(eq(emailSuggestions.id, audit.id), eq(emailSuggestions.ownerId, ownerId)));
          continue;
        }
        if (!statusChanged && !timestampChanged) continue;

        const [changed] = await db
          .update(applications)
          .set({
            ...(statusChanged ? { status: detectedStatus } : {}),
            updatedAt: timestampChanged ? receivedAt : new Date(current.updatedAt),
          })
          .where(and(eq(applications.id, current.id), eq(applications.ownerId, ownerId)))
          .returning();
        if (changed) {
          const application = toApplication(changed);
          applicationMap.set(application.id, application);
          if (statusChanged) updated += 1;
          await db
            .update(emailSuggestions)
            .set({ state: "applied", updatedAt: new Date() })
            .where(and(eq(emailSuggestions.id, audit.id), eq(emailSuggestions.ownerId, ownerId)));
        }
      }
    }

    await db
      .update(gmailConnections)
      .set({ status: "active", lastSyncedAt: new Date(), lastError: "", updatedAt: new Date() })
      .where(eq(gmailConnections.ownerId, ownerId));
    return {
      scanned: messages.length,
      reviewed: reviewsThisSync.length,
      pendingAiReview: Math.max(0, pendingReviewMessages.length - reviewsThisSync.length),
      created,
      updated,
      applications: sortedApplications(applicationMap),
      email,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail sync failed.";
    const status = error instanceof GmailAuthorizationError ? "needs_reconnect" : "active";
    await db
      .update(gmailConnections)
      .set({ status, lastError: message, updatedAt: new Date() })
      .where(eq(gmailConnections.ownerId, ownerId));
    throw error;
  }
}
