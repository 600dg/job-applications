import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { FitAnalysis } from "@/lib/fit-analysis";

const fitAnalysisSchema = z.object({
  score: z.number().int().min(0).max(100),
  band: z.enum(["Strong fit", "Competitive fit", "Stretch fit", "Limited fit", "Needs more detail"]),
  action: z.string().min(1).max(300),
  summary: z.string().min(1).max(800),
  matchedQualifications: z.array(z.string().min(1).max(200)).max(10),
  gaps: z.array(z.string().min(1).max(200)).max(10),
  keywords: z.array(z.string().min(1).max(100)).max(15),
  suggestions: z.array(z.string().min(1).max(300)).max(8),
  signalsConsidered: z.number().int().min(0).max(100),
  coverage: z.number().int().min(0).max(100),
});

export async function analyzeJobFitWithAi(
  resume: string,
  jobPosting: string,
  offlineAnalysis: FitAnalysis,
): Promise<FitAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const client = new OpenAI({ apiKey, timeout: 50_000, maxRetries: 1 });
  const response = await client.responses.parse({
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
    input: [
      {
        role: "system",
        content:
          "You are a careful but practical job-fit analyst. Compare only evidence explicitly present in the resume with requirements explicitly present in the job description. Never invent experience, dates, or credentials. Give meaningful credit for clearly transferable or adjacent experience even when wording is not exact, and do not over-penalize optional qualifications or keyword differences. Treat explicit hard requirements and required years as material constraints; treat preferred experience softly. Compare numeric experience only with dated or explicitly stated résumé evidence. Do not infer a numeric requirement from a senior title alone. Missing evidence should be a candid gap, not an automatic disqualification. Make concise ATS-oriented suggestions. Score fit from 0 to 100 and calculate coverage across material requirements. A deterministic offline comparison is supplied as a calibration signal; assess it critically rather than blindly copying it.",
      },
      {
        role: "user",
        content: `OFFLINE JOB-SPECIFIC COMPARISON\n${JSON.stringify(offlineAnalysis)}\n\nRESUME\n${resume}\n\nJOB DESCRIPTION\n${jobPosting}`,
      },
    ],
    text: {
      format: zodTextFormat(fitAnalysisSchema, "fit_analysis"),
    },
  });

  if (!response.output_parsed) throw new Error("The model did not return a fit analysis.");
  const aiAnalysis = response.output_parsed;
  const score = Math.round(offlineAnalysis.score * 0.3 + aiAnalysis.score * 0.7);
  const coverage = Math.round(offlineAnalysis.coverage * 0.3 + aiAnalysis.coverage * 0.7);
  const band =
    aiAnalysis.signalsConsidered < 3
      ? "Needs more detail"
      : score >= 75
        ? "Strong fit"
        : score >= 55
          ? "Competitive fit"
          : score >= 35
            ? "Stretch fit"
            : "Limited fit";
  return {
    ...aiAnalysis,
    score,
    coverage,
    band,
    offlineScore: offlineAnalysis.score,
    aiScore: aiAnalysis.score,
  };
}
