import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { resumes } from "@/db/schema";
import { analyzeJobFitWithAi } from "@/lib/ai-fit-analysis";
import { generateResumeImprovements } from "@/lib/ai-resume-improvements";
import { analyzeJobFit } from "@/lib/fit-analysis";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  resumeId: z.string().uuid(),
  jobPosting: z.string().trim().min(80).max(30_000),
});

export async function POST(request: Request) {
  const ownerId = await requireUserId();
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json({ error: "Choose a readable résumé and provide a full job description." }, { status: 400 });
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

  const offlineAnalysis = analyzeJobFit(resume.extractedText, parsed.data.jobPosting);
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ analysis: offlineAnalysis, improvements: null, source: "local" });
  }

  try {
    const [analysisResult, improvementsResult] = await Promise.allSettled([
      analyzeJobFitWithAi(resume.extractedText, parsed.data.jobPosting, offlineAnalysis),
      generateResumeImprovements(resume.extractedText, parsed.data.jobPosting),
    ]);
    if (analysisResult.status === "rejected") throw analysisResult.reason;
    if (improvementsResult.status === "rejected") {
      console.error("Tailored résumé improvements failed", improvementsResult.reason);
    }
    return Response.json({
      analysis: analysisResult.value,
      improvements: improvementsResult.status === "fulfilled" ? improvementsResult.value : null,
      source: "ai",
    });
  } catch (error) {
    console.error("AI fit analysis failed", error);
    return Response.json({ analysis: offlineAnalysis, improvements: null, source: "local" });
  }
}
