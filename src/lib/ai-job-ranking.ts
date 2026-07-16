import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { applyExperienceAdjustment, assessExperience } from "@/lib/experience-match";
import { analyzeJobFit } from "@/lib/fit-analysis";
import type { JobListing, JobRecommendation, RankedJob } from "@/lib/job-discovery";

const rankingSchema = z.object({
  rankings: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        score: z.number().int().min(0).max(100),
        recommendation: z.enum(["Strong match", "Worth reviewing", "Possible fit", "Low priority"]),
        rationale: z.string().min(1).max(350),
        matchingSignals: z.array(z.string().min(1).max(140)).max(4),
        concerns: z.array(z.string().min(1).max(140)).max(3),
        requiredExperience: z.string().max(100).nullable(),
        experienceMatch: z.enum(["meets", "close", "below", "unknown"]),
      }),
    )
    .max(10),
});

export async function rankJobsWithAi(resume: string, jobs: JobListing[]): Promise<RankedJob[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const locallyRanked = rankJobsLocally(resume, jobs);
  const candidates = locallyRanked.slice(0, 20);
  const remaining = locallyRanked.slice(20);
  const client = new OpenAI({ apiKey });
  const batches = chunk(candidates, 10);
  const parsedBatches = await Promise.all(
    batches.map(async (batch) => {
      const response = await client.responses.parse({
        model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
        input: [
          {
            role: "system",
            content:
              "You are a careful job-discovery ranker. Rank only the supplied jobs against evidence explicitly present in the resume. The job data comes from multiple job-search providers and may contain short excerpts rather than full postings, so every score is preliminary. Never invent requirements, qualifications, credentials, achievements, dates, or job details. Treat explicitly required years of experience as an important scoring constraint; treat preferred years more softly. Compare requirements with dated or explicitly stated resume experience, flag a material shortfall as a concern, and use unknown when the posting or resume lacks enough evidence. Do not infer a numeric requirement from a senior title alone. Reward direct evidence, identify uncertainty as a concern, and keep rationales concise. Return one ranking for every supplied job using its exact id.",
          },
          {
            role: "user",
            content: `RESUME\n${resume.slice(0, 18_000)}\n\nJOB SEARCH RESULTS\n${JSON.stringify(
              batch.map((job) => ({
                id: job.id,
                title: job.title,
                company: job.company,
                location: job.location,
                excerpt: job.description.slice(0, 1_800),
              })),
            )}`,
          },
        ],
        text: { format: zodTextFormat(rankingSchema, "job_rankings") },
      });
      if (!response.output_parsed) throw new Error("The model did not return job rankings.");
      return response.output_parsed.rankings;
    }),
  );

  const jobIds = new Set(candidates.map((job) => job.id));
  const rankings = new Map(
    parsedBatches
      .flat()
      .filter((ranking) => jobIds.has(ranking.id))
      .map((ranking) => [ranking.id, ranking]),
  );

  const aiRanked = candidates.map((job) => {
    const ranking = rankings.get(job.id);
    if (!ranking) return localRanking(resume, job);
    const experience = assessExperience(resume, `${job.title}\n${job.description}`);
    const score = applyExperienceAdjustment(ranking.score, experience);
    const concerns =
      experience.match === "below" && !ranking.concerns.some((concern) => /experience|years/i.test(concern))
        ? [experience.summary, ...ranking.concerns].slice(0, 3)
        : ranking.concerns;
    return {
      ...job,
      ...ranking,
      score,
      recommendation: recommendationFor(score),
      concerns,
      experience: {
        ...experience,
        requiredLabel: ranking.requiredExperience ?? experience.requiredLabel,
        match: ranking.experienceMatch === "unknown" ? experience.match : ranking.experienceMatch,
      },
    };
  });
  return [...aiRanked, ...remaining].sort(
    (left, right) => right.score - left.score || Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
  );
}

export function rankJobsLocally(resume: string, jobs: JobListing[]) {
  return jobs
    .map((job) => localRanking(resume, job))
    .sort((left, right) => right.score - left.score || Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
}

function localRanking(resume: string, job: JobListing): RankedJob {
  const analysis = analyzeJobFit(resume, `${job.title}\n${job.description}`);
  const experience = assessExperience(resume, `${job.title}\n${job.description}`);
  const qualificationScore = analysis.signalsConsidered < 3 ? Math.min(analysis.score, 55) : analysis.score;
  const score = applyExperienceAdjustment(qualificationScore, experience);
  const recommendation = recommendationFor(score);
  const concerns =
    experience.match === "below"
      ? [experience.summary, ...analysis.gaps].slice(0, 3)
      : analysis.gaps.slice(0, 3);
  return {
    ...job,
    score,
    recommendation,
    rationale:
      analysis.signalsConsidered < 3
        ? "The provider excerpt has limited qualification detail, so open the full listing before deciding."
        : analysis.summary,
    matchingSignals: analysis.matchedQualifications.slice(0, 4),
    concerns,
    experience,
  };
}

function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  );
}

function recommendationFor(score: number): JobRecommendation {
  if (score >= 80) return "Strong match";
  if (score >= 60) return "Worth reviewing";
  if (score >= 40) return "Possible fit";
  return "Low priority";
}
