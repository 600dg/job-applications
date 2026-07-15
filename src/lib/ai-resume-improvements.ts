import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ResumeImprovementReport } from "@/lib/resume-improvements";

const reportSchema = z.object({
  overview: z.string().min(1).max(500),
  edits: z
    .array(
      z.object({
        category: z.enum(["Summary", "Experience", "Impact", "Skills", "Keywords", "Clarity"]),
        original: z.string().min(1).max(500),
        revised: z.string().min(1).max(700),
        reason: z.string().min(1).max(300),
      }),
    )
    .min(1)
    .max(10),
  questions: z.array(z.string().min(1).max(250)).max(5),
});

export async function generateResumeImprovements(
  resume: string,
  jobPosting?: string,
): Promise<ResumeImprovementReport> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const mode = jobPosting ? "tailored" : "general";
  const client = new OpenAI({ apiKey });
  const response = await client.responses.parse({
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
    input: [
      {
        role: "system",
        content:
          "You are a meticulous résumé editor. Produce 5 to 10 high-impact, truthful edits. Every original field must be an exact, contiguous quote from the résumé text and must never contain an email address, phone number, street address, URL, or other contact detail. Preserve the candidate's meaning, seniority, tense, and factual claims. Do not invent metrics, tools, credentials, employers, responsibilities, or achievements. If a stronger rewrite needs missing facts or numbers, keep the rewrite factual and put a concise question in questions. Revised text should be ready to paste into a résumé. Reasons should explain the ATS, clarity, or job-alignment benefit. When a job description is supplied, prioritize truthful alignment and its terminology without keyword stuffing.",
      },
      {
        role: "user",
        content: jobPosting ? `RÉSUMÉ\n${resume}\n\nTARGET JOB DESCRIPTION\n${jobPosting}` : `RÉSUMÉ\n${resume}`,
      },
    ],
    text: { format: zodTextFormat(reportSchema, "resume_improvements") },
  });

  if (!response.output_parsed) throw new Error("The model did not return résumé improvements.");

  const edits = response.output_parsed.edits.filter(
    (edit) => resume.includes(edit.original) && !containsContactDetail(edit.original),
  );
  if (!edits.length) throw new Error("The model did not return verifiable résumé excerpts.");

  return { mode, ...response.output_parsed, edits };
}

function containsContactDetail(value: string) {
  return (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value) ||
    /(?:\+?\d[\d().\s-]{7,}\d)/.test(value) ||
    /\b(?:https?:\/\/|www\.|linkedin\.com)\S*/i.test(value)
  );
}
