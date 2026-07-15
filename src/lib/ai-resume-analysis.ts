import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { AtsAnalysis } from "@/lib/resumes";

const checkSchema = z.object({
  id: z.enum(["summary", "experience", "impact", "skills", "keywords", "structure", "credibility"]),
  label: z.string().min(1).max(80),
  status: z.enum(["pass", "warning", "fail"]),
  points: z.number().int().min(0).max(20),
  maxPoints: z.number().int().min(1).max(20),
  detail: z.string().min(1).max(300),
});

const resumeAnalysisSchema = z.object({
  score: z.number().int().min(0).max(100),
  band: z.enum(["Excellent", "Good", "Needs work", "Low readability"]),
  checks: z.array(checkSchema).length(7),
  suggestions: z.array(z.string().min(1).max(300)).min(1).max(6),
});

export async function analyzeResumeWithAi(text: string, pageCount: number): Promise<AtsAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";
  const client = new OpenAI({ apiKey });
  const response = await client.responses.parse({
    model,
    input: [
      {
        role: "system",
        content:
          "You are a careful ATS résumé reviewer. Evaluate only the supplied extracted text, never invent facts, and never repeat contact details or other personal identifiers. Review these seven categories exactly once with these exact maximum points: summary 10, experience 20, impact 20, skills 15, keywords 15, structure 10, credibility 10. The check ids must match those category names. Points must not exceed that category's maximum, and the overall score must equal the sum of check points. Use pass for at least 80% of a category, warning for at least 50%, otherwise fail. Give specific, honest improvements without suggesting fabricated credentials or results. Because you only receive extracted text, do not claim to assess typography, colors, columns, spacing, or visual design.",
      },
      {
        role: "user",
        content: `PDF PAGE COUNT: ${pageCount}\n\nEXTRACTED RÉSUMÉ TEXT\n${text}`,
      },
    ],
    text: { format: zodTextFormat(resumeAnalysisSchema, "resume_analysis") },
  });

  if (!response.output_parsed) throw new Error("The model did not return a résumé analysis.");

  const analysis = response.output_parsed;
  const score = analysis.checks.reduce((total, check) => total + check.points, 0);
  const band = score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 40 ? "Needs work" : "Low readability";

  return {
    ...analysis,
    score,
    band,
    source: "ai",
    analyzedAt: new Date().toISOString(),
    model,
  };
}
