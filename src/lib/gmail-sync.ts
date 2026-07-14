import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { applications, emailSuggestions, gmailConnections } from "@/db/schema";
import { toApplication } from "@/lib/application-data";
import type { ApplicationStatus } from "@/lib/applications";
import { classifyApplicationEmail, type GmailMessageSummary } from "@/lib/email-suggestions";
import { decryptRefreshToken, googleOAuthConfig } from "@/lib/gmail-connection";

const GMAIL_QUERY = 'newer_than:90d -in:sent -in:drafts {subject:application subject:interview subject:assessment subject:offer "thank you for applying" "not moving forward"}';
const STATUS_RANK: Record<ApplicationStatus, number> = { Wishlist: 0, Applied: 1, Assessment: 2, Interview: 3, Offer: 4, Rejected: 5 };

type GmailListResponse = { messages?: Array<{ id: string; threadId: string }> };
type GmailMessageResponse = {
  id: string;
  threadId: string;
  internalDate?: string;
  snippet?: string;
  payload?: { headers?: Array<{ name: string; value: string }> };
};
type RefreshResponse = { access_token?: string; error?: string };

function header(message: GmailMessageResponse, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function gmailFetch<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: "Bearer " + accessToken }, cache: "no-store" });
  if (!response.ok) throw new Error("Gmail returned " + response.status + ".");
  return response.json() as Promise<T>;
}

async function accessTokenFor(ownerId: string) {
  const [connection] = await getDb().select().from(gmailConnections).where(eq(gmailConnections.ownerId, ownerId)).limit(1);
  const config = googleOAuthConfig();
  if (!connection || !config) throw new Error("Gmail is not configured.");
  const refreshToken = decryptRefreshToken(connection.refreshTokenCiphertext, connection.refreshTokenIv, connection.refreshTokenTag);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    cache: "no-store",
  });
  const data = await response.json() as RefreshResponse;
  if (!response.ok || !data.access_token) throw new Error("Google authorization expired. Reconnect Gmail.");
  return data.access_token;
}

function shouldAutoApply(currentStatus: ApplicationStatus, detectedStatus: ApplicationStatus, confidence: number) {
  if (confidence < 90) return false;
  if (detectedStatus === "Offer" || detectedStatus === "Rejected") return true;
  return STATUS_RANK[detectedStatus] >= STATUS_RANK[currentStatus];
}

export async function syncGmailOwner(ownerId: string) {
  const db = getDb();
  try {
    const accessToken = await accessTokenFor(ownerId);
    const params = new URLSearchParams({ maxResults: "30", q: GMAIL_QUERY });
    const list = await gmailFetch<GmailListResponse>("https://gmail.googleapis.com/gmail/v1/users/me/messages?" + params, accessToken);
    const messages = await Promise.all((list.messages ?? []).map(async ({ id }) => {
      const detailParams = new URLSearchParams({ format: "metadata" });
      detailParams.append("metadataHeaders", "Subject");
      detailParams.append("metadataHeaders", "From");
      detailParams.append("metadataHeaders", "Date");
      return gmailFetch<GmailMessageResponse>("https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(id) + "?" + detailParams, accessToken);
    }));

    const rows = await db.select().from(applications).where(eq(applications.ownerId, ownerId));
    const applicationMap = new Map(rows.map((row) => [row.id, toApplication(row)]));
    const classified = messages.map((message): GmailMessageSummary => ({
      id: message.id,
      threadId: message.threadId,
      subject: header(message, "Subject") || "No subject",
      sender: header(message, "From") || "Unknown sender",
      receivedAt: message.internalDate ? new Date(Number(message.internalDate)) : new Date(header(message, "Date")),
      snippet: message.snippet ?? "",
    })).map((message) => classifyApplicationEmail(message, Array.from(applicationMap.values()))).filter((message) => message !== null);

    let updated = 0;
    for (const message of classified) {
      const current = applicationMap.get(message.applicationId);
      if (!current) continue;
      const autoApply = shouldAutoApply(current.status, message.detectedStatus, message.confidence);
      const [audit] = await db.insert(emailSuggestions).values({
        ownerId,
        applicationId: message.applicationId,
        gmailMessageId: message.id,
        gmailThreadId: message.threadId,
        subject: message.subject,
        sender: message.sender,
        receivedAt: Number.isNaN(message.receivedAt.getTime()) ? new Date() : message.receivedAt,
        excerpt: message.snippet.slice(0, 500),
        detectedStatus: message.detectedStatus,
        confidence: message.confidence,
        reason: message.reason,
        state: autoApply ? "processing" : "ignored",
      }).onConflictDoNothing().returning({ id: emailSuggestions.id });
      if (!audit || !autoApply) continue;

      const [changed] = await db.update(applications).set({ status: message.detectedStatus, updatedAt: new Date() })
        .where(and(eq(applications.id, message.applicationId), eq(applications.ownerId, ownerId))).returning();
      if (changed) {
        applicationMap.set(changed.id, toApplication(changed));
        updated += 1;
        await db.update(emailSuggestions).set({ state: "applied", updatedAt: new Date() }).where(eq(emailSuggestions.id, audit.id));
      }
    }

    await db.update(gmailConnections).set({ status: "active", lastSyncedAt: new Date(), lastError: "", updatedAt: new Date() }).where(eq(gmailConnections.ownerId, ownerId));
    return { scanned: messages.length, updated, applications: Array.from(applicationMap.values()) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail sync failed.";
    // Keep the connection eligible for later scheduled retries. A temporary
    // Google or network error should not silently disable future checks.
    await db.update(gmailConnections).set({ status: "active", lastError: message, updatedAt: new Date() }).where(eq(gmailConnections.ownerId, ownerId));
    throw error;
  }
}
