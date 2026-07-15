import { auth } from "@clerk/nextjs/server";
import { GmailAuthorizationError } from "@/lib/gmail-connection";
import { syncGmailOwner } from "@/lib/gmail-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return Response.json(await syncGmailOwner(userId));
  } catch (error) {
    const status = error instanceof GmailAuthorizationError ? 409 : 502;
    return Response.json({ error: error instanceof Error ? error.message : "Gmail sync failed." }, { status });
  }
}
