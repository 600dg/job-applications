import "server-only";

import { searchAdzuna, isAdzunaConfigured } from "@/lib/adzuna";
import { searchEluta } from "@/lib/eluta";
import {
  JOB_SOURCE_LABELS,
  type JobListing,
  type JobSearchInput,
  type JobSource,
  type ProviderSearchResult,
  type ProviderStatus,
} from "@/lib/job-discovery";
import { isJoobleConfigured, searchJooble } from "@/lib/jooble";
import { cacheProviderSearch, getCachedProviderSearch } from "@/lib/job-search-cache";
import { JobSearchLimitError, reserveProviderRequests } from "@/lib/job-search-limits";

type SearchManyInput = Omit<JobSearchInput, "query"> & { queries: string[] };

type ProviderDefinition = {
  source: JobSource;
  enabled: () => boolean;
  search: (input: JobSearchInput) => Promise<ProviderSearchResult>;
  unavailableMessage: string;
};

const PROVIDERS: ProviderDefinition[] = [
  {
    source: "jooble",
    enabled: isJoobleConfigured,
    search: searchJooble,
    unavailableMessage: "Add JOOBLE_API_KEY to enable this source.",
  },
  {
    source: "adzuna",
    enabled: isAdzunaConfigured,
    search: searchAdzuna,
    unavailableMessage: "Add ADZUNA_APP_ID and ADZUNA_APP_KEY to enable this source.",
  },
  {
    source: "eluta",
    enabled: () => true,
    search: searchEluta,
    unavailableMessage: "",
  },
];

export async function searchJobProviders(input: SearchManyInput) {
  const queries = input.queries.slice(0, 4);
  const providerRuns = await Promise.all(
    PROVIDERS.map(async (provider) => {
      if (!provider.enabled()) {
        return {
          jobs: [] as JobListing[],
          totalResults: 0,
          hasMore: false,
          status: statusFor(provider, false, false, 0, 0, null, null, provider.unavailableMessage),
        };
      }

      const searches = queries.map((query) => ({ ...input, query }));
      const cached = await Promise.all(searches.map((search) => getCachedProviderSearch(provider.source, search)));
      const cachedResults = cached.filter((result): result is ProviderSearchResult => result !== null);
      const missingSearches = searches.filter((_, index) => cached[index] === null);
      let budget: Awaited<ReturnType<typeof reserveProviderRequests>> = null;
      try {
        budget = await reserveProviderRequests(provider.source, missingSearches.length);
      } catch (error) {
        if (!(error instanceof JobSearchLimitError)) throw error;
        const jobs = cachedResults.flatMap((result) => result.jobs);
        return {
          jobs,
          totalResults: Math.max(0, ...cachedResults.map((result) => result.totalResults)),
          hasMore: cachedResults.some((result) => result.hasMore),
          status: statusFor(
            provider,
            true,
            cachedResults.length > 0,
            jobs.length,
            cachedResults.length,
            0,
            null,
            error.message,
          ),
        };
      }

      const runs = await Promise.allSettled(
        missingSearches.map(async (search) => {
          const result = await provider.search(search);
          await cacheProviderSearch(provider.source, search, result);
          return result;
        }),
      );
      const successful = runs.filter(
        (run): run is PromiseFulfilledResult<ProviderSearchResult> => run.status === "fulfilled",
      );
      const results = [...cachedResults, ...successful.map((run) => run.value)];
      const jobs = results.flatMap((result) => result.jobs);
      const totalResults = Math.max(0, ...results.map((result) => result.totalResults));
      const hasMore = results.some((result) => result.hasMore);
      const failedCount = runs.length - successful.length;
      const message =
        results.length === 0
          ? "This source could not be reached."
          : failedCount > 0
            ? `${failedCount} of ${runs.length} new searches failed; cached results were kept.`
            : missingSearches.length === 0
              ? `Reused ${cachedResults.length} cached searches without spending API requests.`
              : `Used ${missingSearches.length} API request${missingSearches.length === 1 ? "" : "s"} and reused ${cachedResults.length} cached search${cachedResults.length === 1 ? "" : "es"}.`;

      return {
        jobs,
        totalResults,
        hasMore,
        status: statusFor(
          provider,
          true,
          results.length > 0,
          jobs.length,
          cachedResults.length,
          budget?.remaining ?? null,
          budget?.period ?? null,
          message,
        ),
      };
    }),
  );

  const allJobs = providerRuns.flatMap((run) => run.jobs);
  return {
    jobs: deduplicateJobs(allJobs),
    totalResults: providerRuns.reduce((sum, run) => sum + run.totalResults, 0),
    hasMore: providerRuns.some((run) => run.hasMore),
    providers: providerRuns.map((run) => run.status),
  };
}

function deduplicateJobs(jobs: JobListing[]) {
  const deduplicated = new Map<string, JobListing>();
  for (const job of jobs) {
    const key = [job.company, job.title, job.location].map(normalize).join("|");
    const existing = deduplicated.get(key);
    if (!existing) {
      deduplicated.set(key, job);
      continue;
    }
    const sources = [...new Set([...existing.sources, ...job.sources])];
    const newer = Date.parse(job.publishedAt) > Date.parse(existing.publishedAt) ? job : existing;
    deduplicated.set(key, {
      ...newer,
      sources,
      description: newer.description.length >= existing.description.length ? newer.description : existing.description,
      salary: newer.salary ?? existing.salary,
      employmentType: newer.employmentType ?? existing.employmentType,
    });
  }
  return [...deduplicated.values()];
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(inc|ltd|llc|corp|corporation|company|co)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function statusFor(
  provider: ProviderDefinition,
  enabled: boolean,
  ok: boolean,
  resultCount: number,
  cachedCount: number,
  budgetRemaining: number | null,
  budgetPeriod: "day" | "week" | "month" | null,
  message: string,
): ProviderStatus {
  return {
    source: provider.source,
    label: JOB_SOURCE_LABELS[provider.source],
    enabled,
    ok,
    resultCount,
    cachedCount,
    budgetRemaining,
    budgetPeriod,
    message,
  };
}
