import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { listPendingGmailImportReviews, resolveGmailImportReviews } from "@/lib/gmail-import-review";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1).max(100),
  excludedIds: z.array(z.string().uuid()).max(100),
});

export async function GET() {
  const ownerId = await requireUserId();
  return Response.json({ importReviews: await listPendingGmailImportReviews(ownerId) });
}

export async function POST(request: Request) {
  const ownerId = await requireUserId();
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose which reviewed emails to import." }, { status: 400 });
  const candidateIds = new Set(parsed.data.candidateIds);
  if (parsed.data.excludedIds.some((id) => !candidateIds.has(id))) {
    return Response.json({ error: "An excluded email was not part of this review." }, { status: 400 });
  }

  try {
    const result = await resolveGmailImportReviews(ownerId, parsed.data.candidateIds, parsed.data.excludedIds);
    return Response.json({
      ...result,
      excluded: parsed.data.excludedIds.length,
      importReviews: await listPendingGmailImportReviews(ownerId),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The Gmail review could not be completed." },
      { status: 409 },
    );
  }
}
