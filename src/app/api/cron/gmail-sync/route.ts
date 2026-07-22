import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { gmailConnections } from "@/db/schema";
import { syncGmailOwner } from "@/lib/gmail-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== "Bearer " + process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const connections = await getDb()
    .select({ ownerId: gmailConnections.ownerId })
    .from(gmailConnections)
    .where(eq(gmailConnections.status, "active"));
  const results = [];
  for (const connection of connections) {
    try {
      const result = await syncGmailOwner(connection.ownerId);
      results.push({ ownerId: connection.ownerId, ok: true, awaitingReview: result.importReviews.length });
    } catch {
      results.push({ ownerId: connection.ownerId, ok: false });
    }
  }
  return Response.json({ ok: true, connections: results.length, results });
}
