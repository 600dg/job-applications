export type JobDiscoverySort = "rank" | "post";
export type JobSource = "eluta" | "jooble" | "adzuna";

export type JobSearchInput = {
  query: string;
  title?: string;
  location?: string;
  sort: JobDiscoverySort;
  page: number;
  pageSize: number;
};

export type JobListing = {
  id: string;
  source: JobSource;
  sources: JobSource[];
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  publishedAt: string;
  salary: string | null;
  employmentType: string | null;
};

export type ProviderSearchResult = {
  jobs: JobListing[];
  totalResults: number;
  hasMore: boolean;
};

export type ProviderStatus = {
  source: JobSource;
  label: string;
  enabled: boolean;
  ok: boolean;
  resultCount: number;
  cachedCount: number;
  budgetRemaining: number | null;
  budgetPeriod: "day" | "week" | "month" | null;
  message: string;
};

export type JobRecommendation = "Strong match" | "Worth reviewing" | "Possible fit" | "Low priority";

export type RankedJob = JobListing & {
  score: number;
  recommendation: JobRecommendation;
  rationale: string;
  matchingSignals: string[];
  concerns: string[];
  experience: {
    requiredYears: number | null;
    requiredLabel: string | null;
    resumeYears: number | null;
    match: "meets" | "close" | "below" | "unknown";
    preferredOnly: boolean;
    summary: string;
  };
};

export type ResumeSearchProfile = {
  headline: string;
  suggestedQueries: string[];
  skills: string[];
  industries: string[];
  generatedBy: "ai" | "local";
};

export type JobDiscoveryResult = {
  jobs: RankedJob[];
  totalResults: number;
  uniqueResults: number;
  rankingSource: "ai" | "local";
  searchedAt: string;
  page: number;
  hasMore: boolean;
  queries: string[];
  providers: ProviderStatus[];
};

export const JOB_SOURCE_LABELS: Record<JobSource, string> = {
  eluta: "Eluta",
  jooble: "Jooble",
  adzuna: "Adzuna",
};
