import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { applications, emailSuggestions, gmailConnections } from "@/db/schema";
import { toApplication } from "@/lib/application-data";
import type { Application, ApplicationStatus } from "@/lib/applications";
import {
  analyzeApplicationEmail,
  detectApplicationStatus,
  findMatchingApplication,
  type GmailMessageSummary,
} from "@/lib/email-suggestions";
import { GmailAuthorizationError, requireClerkGmailAccess } from "@/lib/gmail-connection";

const GMAIL_QUERY =
  'newer_than:365d -in:sent -in:drafts -in:spam -in:trash -from:mg.brokerbay.com -from:skyslope.com -subject:"registered offer" -subject:"offer presentation" -subject:"rental application" {"thank you for applying" "received your application" "application acknowledgement" "application confirmation" subject:application subject:candidacy subject:interview subject:assessment assessment interview "not moving forward" "not be moving forward" "regret to inform" "going in a direction" "careful consideration" "other candidates" "not selected" "will not proceed" "position has been filled" "job offer"}';
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
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function messageBody(payload?: GmailPayload): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBodyData(payload.body.data);
  const childText = (payload.parts ?? []).map(messageBody).filter(Boolean);
  if (childText.length) return childText.join(" ");
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

    const [rows, priorAudits] = await Promise.all([
      db.select().from(applications).where(eq(applications.ownerId, ownerId)),
      db
        .select({
          applicationId: emailSuggestions.applicationId,
          gmailMessageId: emailSuggestions.gmailMessageId,
          gmailThreadId: emailSuggestions.gmailThreadId,
        })
        .from(emailSuggestions)
        .where(eq(emailSuggestions.ownerId, ownerId)),
    ]);
    const applicationMap = new Map(rows.map((row) => [row.id, toApplication(row)]));
    const processedMessageIds = new Set(priorAudits.map((audit) => audit.gmailMessageId));
    const threadApplicationIds = new Map(priorAudits.map((audit) => [audit.gmailThreadId, audit.applicationId]));

    let created = 0;
    let updated = 0;
    for (const message of summaries) {
      if (processedMessageIds.has(message.id)) continue;
      const signal = detectApplicationStatus(message);
      const analysis = analyzeApplicationEmail(message);
      if (!signal || (!analysis && !threadApplicationIds.has(message.threadId))) continue;

      const threadApplicationId = threadApplicationIds.get(message.threadId);
      let current = threadApplicationId ? applicationMap.get(threadApplicationId) : undefined;
      current ??= findMatchingApplication(message, Array.from(applicationMap.values()), analysis) ?? undefined;
      let newlyCreated = false;

      if (!current && analysis && analysis.confidence >= 90) {
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
            target: [applications.ownerId, applications.gmailOriginMessageId],
          })
          .returning();

        const row =
          inserted ??
          (await db
            .select()
            .from(applications)
            .where(and(eq(applications.ownerId, ownerId), eq(applications.gmailOriginMessageId, message.id)))
            .limit(1)
            .then(([existing]) => existing));
        if (row) {
          current = toApplication(row);
          applicationMap.set(current.id, current);
          newlyCreated = Boolean(inserted);
          if (newlyCreated) created += 1;
        }
      }

      if (!current) continue;
      const receivedAt = Number.isNaN(message.receivedAt.getTime()) ? new Date() : message.receivedAt;
      const confidence = analysis?.confidence ?? 90;
      const detectedStatus = analysis?.detectedStatus ?? signal.status;
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
          reason: analysis?.reason ?? `${signal.reason} It was matched through an existing Gmail conversation.`,
          state: newlyCreated || statusChanged || timestampChanged ? "processing" : "ignored",
        })
        .onConflictDoNothing()
        .returning({ id: emailSuggestions.id });
      if (!audit) continue;

      processedMessageIds.add(message.id);
      threadApplicationIds.set(message.threadId, current.id);
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

    await db
      .update(gmailConnections)
      .set({ status: "active", lastSyncedAt: new Date(), lastError: "", updatedAt: new Date() })
      .where(eq(gmailConnections.ownerId, ownerId));
    return { scanned: messages.length, created, updated, applications: sortedApplications(applicationMap), email };
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
