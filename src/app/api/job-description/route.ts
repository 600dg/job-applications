import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { fetchJobDescription } from "@/lib/job-description-fetch";

export const runtime = "nodejs";
export const maxDuration = 20;

const requestSchema = z.object({ url: z.string().trim().min(4).max(2_000) });

export async function POST(request: Request) {
  await requireUserId();
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid public job URL." }, { status: 400 });
  try {
    return Response.json(await fetchJobDescription(parsed.data.url));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The job page could not be imported." },
      { status: 422 },
    );
  }
}
