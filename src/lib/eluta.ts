import "server-only";

import { XMLParser } from "fast-xml-parser";
import type { JobListing, JobSearchInput, ProviderSearchResult } from "@/lib/job-discovery";

const ELUTA_SEARCH_URL = "https://www.eluta.ca/opensearch";
const MAX_RESPONSE_LENGTH = 500_000;

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  processEntities: false,
  trimValues: true,
});

export async function searchEluta(search: JobSearchInput): Promise<ProviderSearchResult> {
  if (search.page > 1) return { jobs: [], totalResults: 0, hasMore: false };

  const params = new URLSearchParams({
    q: search.query,
    sort: search.sort,
  });
  if (search.location?.trim()) params.set("l", search.location.trim());
  if (search.title?.trim()) params.set("tq", search.title.trim());

  const response = await fetch(`${ELUTA_SEARCH_URL}?${params.toString()}`, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml",
      "User-Agent": "Trackline/1.0 (+https://job-applications-red.vercel.app)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Eluta returned ${response.status}.`);
  }

  const xml = await response.text();
  if (!xml || xml.length > MAX_RESPONSE_LENGTH) {
    throw new Error("Eluta returned an invalid response.");
  }

  const parsed = parser.parse(xml) as unknown;
  const rss = readRecord(readRecord(parsed)?.rss);
  const channel = readRecord(rss?.channel);
  if (!channel) throw new Error("Eluta returned an unreadable feed.");

  const rawItems = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
  const jobs = rawItems
    .map(toElutaJob)
    .filter((job): job is JobListing => job !== null)
    .slice(0, search.pageSize);
  const totalResults = readNumber(channel["opensearch:totalResults"]) ?? jobs.length;

  return { jobs, totalResults, hasMore: false };
}

function toElutaJob(value: unknown): JobListing | null {
  const item = readRecord(value);
  if (!item) return null;

  const id = readString(item.guid);
  const title = cleanText(readString(item.title));
  const company = cleanText(readString(item.employer));
  const location = cleanText(readString(item.location));
  const description = cleanText(readString(item.description)).slice(0, 2_500);
  const url = safeElutaUrl(readString(item.link));
  const publishedAt = safeDate(readString(item.pubDate));

  if (!id || !title || !company || !url) return null;
  return {
    id: `eluta:${id}`,
    source: "eluta",
    sources: ["eluta"],
    title,
    company,
    location: location || "Canada",
    description,
    url,
    publishedAt,
    salary: null,
    employmentType: null,
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  const record = readRecord(value);
  return typeof record?.["#text"] === "string" ? record["#text"] : "";
}

function readNumber(value: unknown) {
  const number = Number(readString(value) || value);
  return Number.isFinite(number) ? number : null;
}

function safeElutaUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["eluta.ca", "www.eluta.ca"].includes(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function safeDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function cleanText(value: string) {
  return value
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
