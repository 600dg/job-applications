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

export async function analyzeJobFitWithAi(resume: string, jobPosting: string): Promise<FitAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const client = new OpenAI({ apiKey });
  const response = await client.responses.parse({
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
    input: [
      {
        role: "system",
        content:
          "You are a careful job-fit analyst. Compare only evidence explicitly present in the resume with requirements explicitly present in the job description. Never invent experience, dates, or credentials. Treat explicitly required years of experience as a material scoring constraint and preferred years more softly. Compare them only with dated or explicitly stated résumé evidence; if that evidence falls short, include the requirement in gaps and lower the score proportionately. Do not infer a numeric requirement from a senior title alone. Treat missing evidence as a gap, explain adjacent experience honestly, and make concise ATS-oriented suggestions. Score fit from 0 to 100 and calculate coverage as the percentage of material requirements with direct or clearly adjacent evidence.",
      },
      {
        role: "user",
        content: `RESUME\n${resume}\n\nJOB DESCRIPTION\n${jobPosting}`,
      },
    ],
    text: {
      format: zodTextFormat(fitAnalysisSchema, "fit_analysis"),
    },
  });

  if (!response.output_parsed) throw new Error("The model did not return a fit analysis.");
  return response.output_parsed;
}
