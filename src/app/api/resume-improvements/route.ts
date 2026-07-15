import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { resumes } from "@/db/schema";
import { generateResumeImprovements } from "@/lib/ai-resume-improvements";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  resumeId: z.string().uuid(),
  jobPosting: z.string().trim().min(80).max(30_000).optional(),
});

export async function POST(request: Request) {
  const ownerId = await requireUserId();
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "A valid résumé is required." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "AI improvements are not configured yet." }, { status: 503 });
  }

  const [resume] = await getDb()
    .select({ extractedText: resumes.extractedText, parseStatus: resumes.parseStatus })
    .from(resumes)
    .where(and(eq(resumes.id, parsed.data.resumeId), eq(resumes.ownerId, ownerId)))
    .limit(1);

  if (!resume) return Response.json({ error: "Résumé not found." }, { status: 404 });
  if (resume.parseStatus !== "ready" || resume.extractedText.trim().length < 40) {
    return Response.json({ error: "This résumé does not contain enough readable text." }, { status: 422 });
  }

  try {
    const report = await generateResumeImprovements(resume.extractedText, parsed.data.jobPosting);
    return Response.json({ report });
  } catch (error) {
    console.error("AI résumé improvements failed", error);
    return Response.json(
      { error: "The résumé improvements could not be generated. Try again shortly." },
      { status: 502 },
    );
  }
}
