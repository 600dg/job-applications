import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { ResumeSearchProfile } from "@/lib/job-discovery";

const profileSchema = z.object({
  headline: z.string().min(1).max(160),
  suggestedQueries: z.array(z.string().min(2).max(80)).min(4).max(8),
  skills: z.array(z.string().min(1).max(60)).max(12),
  industries: z.array(z.string().min(1).max(60)).max(6),
});

const ROLE_RULES = [
  ["Financial analyst", ["finance", "financial analysis", "bachelor of commerce", "bloomberg"]],
  ["Business analyst", ["business analytics", "business analysis", "requirements", "sharepoint"]],
  ["Data analyst", ["sql", "python", "tableau", "r studio", "analytics"]],
  ["Research analyst", ["research", "quantitative", "bloomberg", "analysis"]],
  ["Credit analyst", ["credit", "lending", "mortgage", "banking", "financial statements"]],
  ["Commercial banking analyst", ["commercial banking", "banking", "client relationship", "finance"]],
  ["Commercial real estate analyst", ["commercial real estate", "real estate", "finance", "sales"]],
  ["Mortgage underwriter", ["mortgage", "lending", "credit", "real estate"]],
  ["Operations analyst", ["operations", "excel", "sql", "process", "sharepoint"]],
  ["Wealth management associate", ["wealth management", "canadian securities course", "client relationship"]],
] as const;

const SKILLS = [
  "Excel",
  "SQL",
  "Python",
  "R",
  "Tableau",
  "Bloomberg Terminal",
  "SharePoint",
  "Financial analysis",
  "Business analytics",
  "Quantitative research",
  "Client relationship management",
  "Consultative sales",
  "Mortgage lending",
  "Real estate",
  "Canadian Securities Course",
] as const;

const INDUSTRY_RULES: Array<[string, string[]]> = [
  ["Banking", ["bank", "banking", "securities"]],
  ["Finance", ["finance", "financial"]],
  ["Real estate", ["real estate", "mortgage"]],
  ["Government", ["government", "revenue agency"]],
  ["Data and analytics", ["analytics", "sql", "tableau"]],
];

export async function generateResumeSearchProfile(resume: string): Promise<ResumeSearchProfile> {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await generateWithAi(resume);
    } catch (error) {
      console.error("AI search-profile generation failed; returning local suggestions", error);
    }
  }
  return generateLocally(resume);
}

async function generateWithAi(resume: string): Promise<ResumeSearchProfile> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.parse({
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
    input: [
      {
        role: "system",
        content:
          "Create a broad but credible job-search profile from evidence explicitly present in the resume. Suggest distinct job-title queries, not long Boolean strings. Include adjacent roles only when the resume provides transferable evidence. Do not invent credentials, industries, experience, seniority, or preferences. Prefer 6 to 8 concise queries that job boards are likely to match.",
      },
      {
        role: "user",
        content: `RESUME\n${resume.slice(0, 18_000)}`,
      },
    ],
    text: { format: zodTextFormat(profileSchema, "resume_job_search_profile") },
  });
  if (!response.output_parsed) throw new Error("The model did not return a search profile.");
  return { ...response.output_parsed, generatedBy: "ai" };
}

function generateLocally(resume: string): ResumeSearchProfile {
  const normalized = resume.toLowerCase();
  const rankedRoles = ROLE_RULES.map(([role, evidence]) => ({
    role,
    score: evidence.filter((term) => normalized.includes(term)).length,
  }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map(({ role }) => role);
  const suggestedQueries =
    rankedRoles.length >= 4
      ? rankedRoles
      : ["Business analyst", "Financial analyst", "Data analyst", "Operations analyst", ...rankedRoles].filter(
          (role, index, roles) => roles.indexOf(role) === index,
        );
  const skills = SKILLS.filter((skill) => normalized.includes(skill.toLowerCase())).slice(0, 12);
  const industries = INDUSTRY_RULES.filter(([, terms]) => terms.some((term) => normalized.includes(term)))
    .map(([industry]) => industry)
    .slice(0, 6);

  return {
    headline: "Résumé-based searches built from your strongest visible experience and transferable skills.",
    suggestedQueries: suggestedQueries.slice(0, 8),
    skills,
    industries,
    generatedBy: "local",
  };
}
