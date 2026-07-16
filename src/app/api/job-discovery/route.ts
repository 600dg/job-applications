import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { resumes } from "@/db/schema";
import { rankJobsLocally, rankJobsWithAi } from "@/lib/ai-job-ranking";
import { requireUserId } from "@/lib/auth";
import type { JobDiscoveryResult } from "@/lib/job-discovery";
import { searchJobProviders } from "@/lib/job-search";
import { enforceSearchCooldown, JobSearchLimitError } from "@/lib/job-search-limits";
import { generateResumeSearchProfile } from "@/lib/resume-search-profile";

export const runtime = "nodejs";
export const maxDuration = 60;

const profileRequestSchema = z.object({
  action: z.literal("profile"),
  resumeId: z.string().uuid(),
});

const searchRequestSchema = z.object({
  action: z.literal("search"),
  resumeId: z.string().uuid(),
  queries: z.array(z.string().trim().min(2).max(100)).min(1).max(4),
  title: z.string().trim().max(120).optional().default(""),
  location: z.string().trim().max(120).optional().default(""),
  sort: z.enum(["rank", "post"]).default("rank"),
  page: z.number().int().min(1).max(10).default(1),
});

const requestSchema = z.discriminatedUnion("action", [profileRequestSchema, searchRequestSchema]);

export async function POST(request: Request) {
  const ownerId = await requireUserId();
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Choose a readable résumé and valid search criteria." }, { status: 400 });
  }

  const resume = await loadReadableResume(parsed.data.resumeId, ownerId);
  if ("error" in resume) return Response.json({ error: resume.error }, { status: resume.status });

  if (parsed.data.action === "profile") {
    const profile = await generateResumeSearchProfile(resume.extractedText);
    return Response.json({ profile });
  }

  const queries = [...new Set(parsed.data.queries.map((query) => query.trim()))].slice(0, 4);
  try {
    await enforceSearchCooldown(ownerId);
  } catch (error) {
    if (error instanceof JobSearchLimitError) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    throw error;
  }
  const searchResult = await searchJobProviders({
    queries,
    title: parsed.data.title,
    location: parsed.data.location,
    sort: parsed.data.sort,
    page: parsed.data.page,
    pageSize: 10,
  });

  const candidates = rankJobsLocally(resume.extractedText, searchResult.jobs).slice(0, 40);
  let jobs = candidates;
  let rankingSource: JobDiscoveryResult["rankingSource"] = "local";
  if (process.env.OPENAI_API_KEY && jobs.length) {
    try {
      jobs = await rankJobsWithAi(resume.extractedText, candidates);
      rankingSource = "ai";
    } catch (error) {
      console.error("AI job ranking failed; returning local rankings", error);
    }
  }

  const result: JobDiscoveryResult = {
    jobs,
    totalResults: searchResult.totalResults,
    uniqueResults: searchResult.jobs.length,
    rankingSource,
    searchedAt: new Date().toISOString(),
    page: parsed.data.page,
    hasMore: searchResult.hasMore,
    queries,
    providers: searchResult.providers,
  };
  return Response.json({ result });
}

async function loadReadableResume(resumeId: string, ownerId: string) {
  const [resume] = await getDb()
    .select({ extractedText: resumes.extractedText, parseStatus: resumes.parseStatus })
    .from(resumes)
    .where(and(eq(resumes.id, resumeId), eq(resumes.ownerId, ownerId)))
    .limit(1);

  if (!resume) return { error: "Résumé not found.", status: 404 as const };
  if (resume.parseStatus !== "ready" || resume.extractedText.trim().length < 40) {
    return { error: "This résumé does not contain enough readable text.", status: 422 as const };
  }
  return resume;
}
