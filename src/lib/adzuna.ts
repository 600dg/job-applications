import "server-only";

import type { JobListing, JobSearchInput, ProviderSearchResult } from "@/lib/job-discovery";

const ADZUNA_API_URL = "https://api.adzuna.com/v1/api/jobs/ca/search";

type AdzunaResponse = {
  count?: number;
  results?: Array<{
    id?: string | number;
    title?: string;
    description?: string;
    redirect_url?: string;
    created?: string;
    salary_min?: number;
    salary_max?: number;
    contract_time?: string;
    contract_type?: string;
    company?: { display_name?: string };
    location?: { display_name?: string };
  }>;
};

export function isAdzunaConfigured() {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

export async function searchAdzuna(search: JobSearchInput): Promise<ProviderSearchResult> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) throw new Error("Adzuna credentials are not configured.");

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(search.pageSize),
    what: [search.title, search.query].filter(Boolean).join(" "),
    "content-type": "application/json",
  });
  if (search.location?.trim()) params.set("where", search.location.trim());
  if (search.sort === "post") params.set("sort_by", "date");

  const response = await fetch(`${ADZUNA_API_URL}/${search.page}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Trackline/1.0 (+https://job-applications-red.vercel.app)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) throw new Error(`Adzuna returned ${response.status}.`);
  const data = (await response.json()) as AdzunaResponse;
  const jobs = (Array.isArray(data.results) ? data.results : [])
    .map(toJobListing)
    .filter((job): job is JobListing => job !== null)
    .slice(0, search.pageSize);
  const totalResults = finiteNumber(data.count) ?? jobs.length;

  return {
    jobs,
    totalResults,
    hasMore: search.page * search.pageSize < totalResults,
  };
}

function toJobListing(job: NonNullable<AdzunaResponse["results"]>[number]): JobListing | null {
  const id = String(job.id ?? "").trim();
  const title = cleanText(job.title);
  const url = safeHttpUrl(job.redirect_url);
  if (!id || !title || !url) return null;

  return {
    id: `adzuna:${id}`,
    source: "adzuna",
    sources: ["adzuna"],
    title,
    company: cleanText(job.company?.display_name) || "Company not listed",
    location: cleanText(job.location?.display_name) || "Canada",
    description: cleanText(job.description).slice(0, 2_500),
    url,
    publishedAt: safeDate(job.created),
    salary: formatSalary(job.salary_min, job.salary_max),
    employmentType: [job.contract_time, job.contract_type].map(cleanText).filter(Boolean).join(" · ") || null,
  };
}

function formatSalary(minimum: unknown, maximum: unknown) {
  const min = finiteNumber(minimum);
  const max = finiteNumber(maximum);
  if (min === null && max === null) return null;
  const money = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });
  if (min !== null && max !== null && min !== max) return `${money.format(min)}–${money.format(max)}`;
  return money.format(min ?? max ?? 0);
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
