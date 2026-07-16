import "server-only";

import type { JobListing, JobSearchInput, ProviderSearchResult } from "@/lib/job-discovery";

const JOOBLE_API_URL = "https://jooble.org/api";

type JoobleResponse = {
  totalCount?: number;
  jobs?: Array<{
    id?: string | number;
    title?: string;
    company?: string;
    location?: string;
    snippet?: string;
    salary?: string;
    type?: string;
    link?: string;
    updated?: string;
  }>;
};

export function isJoobleConfigured() {
  return Boolean(process.env.JOOBLE_API_KEY);
}

export async function searchJooble(search: JobSearchInput): Promise<ProviderSearchResult> {
  const apiKey = process.env.JOOBLE_API_KEY;
  if (!apiKey) throw new Error("JOOBLE_API_KEY is not configured.");

  const response = await fetch(`${JOOBLE_API_URL}/${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      keywords: [search.title, search.query].filter(Boolean).join(" "),
      location: search.location ?? "",
      page: String(search.page),
      ResultOnPage: String(search.pageSize),
      companysearch: "false",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) throw new Error(`Jooble returned ${response.status}.`);
  const data = (await response.json()) as JoobleResponse;
  const jobs = (Array.isArray(data.jobs) ? data.jobs : [])
    .map(toJobListing)
    .filter((job): job is JobListing => job !== null)
    .slice(0, search.pageSize);
  const totalResults = finiteNumber(data.totalCount) ?? jobs.length;

  return {
    jobs,
    totalResults,
    hasMore: search.page * search.pageSize < totalResults,
  };
}

function toJobListing(job: NonNullable<JoobleResponse["jobs"]>[number]): JobListing | null {
  const id = String(job.id ?? "").trim();
  const title = cleanText(job.title);
  const company = cleanText(job.company) || "Company not listed";
  const url = safeHttpUrl(job.link);
  if (!id || !title || !url) return null;

  return {
    id: `jooble:${id}`,
    source: "jooble",
    sources: ["jooble"],
    title,
    company,
    location: cleanText(job.location) || "Canada",
    description: cleanText(job.snippet).slice(0, 2_500),
    url,
    publishedAt: safeDate(job.updated),
    salary: cleanText(job.salary) || null,
    employmentType: cleanText(job.type) || null,
  };
}

function cleanText(value: unknown) {
  return typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

function safeHttpUrl(value: unknown) {
  try {
    const url = new URL(typeof value === "string" ? value : "");
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeDate(value: unknown) {
  const date = new Date(typeof value === "string" ? value : "");
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
