import "server-only";

import { createHash } from "node:crypto";
import { getCache } from "@vercel/functions";
import type { JobSearchInput, JobSource, ProviderSearchResult } from "@/lib/job-discovery";

const CACHE_TTL_SECONDS = 15 * 60;
const localCache = new Map<string, { expiresAt: number; value: ProviderSearchResult }>();

export async function getCachedProviderSearch(source: JobSource, input: JobSearchInput) {
  const key = cacheKey(source, input);
  try {
    const cached = await getCache({ namespace: "job-discovery" }).get(key);
    if (cached) return cached as ProviderSearchResult;
  } catch {}
  const cached = localCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) localCache.delete(key);
  return null;
}

export async function cacheProviderSearch(source: JobSource, input: JobSearchInput, value: ProviderSearchResult) {
  const key = cacheKey(source, input);
  try {
    await getCache({ namespace: "job-discovery" }).set(key, value, {
      ttl: CACHE_TTL_SECONDS,
      tags: [`jobs-${source}`],
      name: `${source}-job-search`,
    });
  } catch {
    localCache.set(key, { expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000, value });
    trimLocalCache();
  }
}

function cacheKey(source: JobSource, input: JobSearchInput) {
  const normalized = JSON.stringify({
    source,
    query: input.query.trim().toLowerCase(),
    title: input.title?.trim().toLowerCase() ?? "",
    location: input.location?.trim().toLowerCase() ?? "",
    sort: input.sort,
    page: input.page,
    pageSize: input.pageSize,
  });
  return createHash("sha256").update(normalized).digest("hex");
}

function trimLocalCache() {
  if (localCache.size <= 100) return;
  const now = Date.now();
  for (const [key, entry] of localCache) {
    if (entry.expiresAt <= now || localCache.size > 80) localCache.delete(key);
  }
}
