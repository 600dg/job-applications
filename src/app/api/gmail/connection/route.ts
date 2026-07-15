import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { gmailConnections } from "@/db/schema";

export async function DELETE() {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return Response.json({ error: "Unauthorized." }, { status: 401 });

  await getDb().delete(gmailConnections).where(eq(gmailConnections.ownerId, userId));
  return Response.json({ ok: true });
}
