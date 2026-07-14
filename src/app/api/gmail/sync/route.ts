import { auth } from "@clerk/nextjs/server";
import { syncGmailOwner } from "@/lib/gmail-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return Response.json(await syncGmailOwner(userId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Gmail sync failed." }, { status: 502 });
  }
}
