"use client";

import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  Check,
  CircleOff,
  FileSearch,
  Lightbulb,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  JOB_SOURCE_LABELS,
  type JobDiscoveryResult,
  type JobDiscoverySort,
  type RankedJob,
  type ResumeSearchProfile,
} from "@/lib/job-discovery";
import type { SavedResume } from "@/lib/resumes";

const DEFAULT_SEARCHES = ["Business analyst", "Financial analyst", "Commercial banking", "Data analyst"];

export function JobDiscovery({ initialResumes }: { initialResumes: SavedResume[] }) {
  const readableResumes = initialResumes.filter((resume) => resume.parseStatus === "ready");
  const initialResume = readableResumes.find((resume) => resume.isPrimary) ?? readableResumes[0];
  const [resumeId, setResumeId] = useState(initialResume?.id ?? "");
  const [keywords, setKeywords] = useState("finance business analyst banking");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("Toronto ON");
  const [sort, setSort] = useState<JobDiscoverySort>("rank");
  const [profile, setProfile] = useState<ResumeSearchProfile | null>(null);
  const [selectedQueries, setSelectedQueries] = useState<string[]>([]);
  const [result, setResult] = useState<JobDiscoveryResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [generatingProfile, setGeneratingProfile] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  async function generateProfile() {
    if (!resumeId || generatingProfile) return;
    setGeneratingProfile(true);
    setError("");
    try {
      const response = await fetch("/api/job-discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "profile", resumeId }),
      });
      const data = (await response.json()) as { profile?: ResumeSearchProfile; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error ?? "Could not create search suggestions.");
      setProfile(data.profile);
      setSelectedQueries(data.profile.suggestedQueries.slice(0, 4));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create search suggestions.");
    } finally {
      setGeneratingProfile(false);
    }
  }

  async function searchJobs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resumeId || (!selectedQueries.length && keywords.trim().length < 2) || searching) return;
    setSearching(true);
    setError("");
    try {
      const nextResult = await requestSearch(1);
      setResult(nextResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Job search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function loadMore() {
    if (!result?.hasMore || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const nextResult = await requestSearch(result.page + 1);
      setResult({
        ...nextResult,
        jobs: deduplicateRankedJobs([...result.jobs, ...nextResult.jobs]),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load more jobs.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function requestSearch(page: number) {
    const queries = selectedQueries.length ? selectedQueries.slice(0, 4) : [keywords.trim()];
    const response = await fetch("/api/job-discovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "search", resumeId, queries, title, location, sort, page }),
    });
    const data = (await response.json()) as { result?: JobDiscoveryResult; error?: string };
    if (!response.ok || !data.result) throw new Error(data.error ?? "Job search failed.");
    return data.result;
  }

  function toggleQuery(query: string) {
    setSelectedQueries((current) => {
      if (current.includes(query)) return current.filter((item) => item !== query);
      if (current.length >= 4) return current;
      return [...current, query];
    });
  }

  function changeResume(value: string) {
    setResumeId(value);
    setProfile(null);
    setSelectedQueries([]);
    setResult(null);
  }

  const canSearch = Boolean(resumeId && (selectedQueries.length || keywords.trim().length >= 2));

  return (
    <section className="space-y-6" aria-labelledby="job-discovery-title">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
          <Search className="size-4" />
          Multi-source job discovery
        </div>
        <h2 id="job-discovery-title" className="text-2xl font-semibold tracking-tight">
          Find more roles that match your background.
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Build broad searches from your résumé, retrieve jobs from every configured provider, remove repeated listings,
          and rank the strongest leads. Scores remain preliminary until you review the full posting.
        </p>
      </div>

      <Card className="border-border/80 bg-card/80">
        <CardHeader>
          <CardTitle>Résumé search profile</CardTitle>
          <CardDescription>
            Generate distinct job-title searches from visible résumé evidence. Trackline runs up to four searches at
            once so one narrow keyword string does not hide relevant roles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="discovery-resume">Résumé used for suggestions and ranking</Label>
              <Select value={resumeId} onValueChange={changeResume}>
                <SelectTrigger id="discovery-resume" className="w-full">
                  <SelectValue placeholder="Choose a readable résumé" />
                </SelectTrigger>
                <SelectContent>
                  {readableResumes.map((resume) => (
                    <SelectItem key={resume.id} value={resume.id}>
                      {resume.fileName}
                      {resume.isPrimary ? " · Primary" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={!resumeId || generatingProfile}
              onClick={generateProfile}
            >
              {generatingProfile ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
              {generatingProfile ? "Reading résumé…" : "Suggest searches"}
            </Button>
          </div>

          {profile && (
            <div className="rounded-xl border bg-background/35 p-4">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <Lightbulb className="size-4 text-primary" />
                    <p className="text-sm font-medium">Recommended searches</p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{profile.headline}</p>
                </div>
                <Badge variant="outline">
                  {profile.generatedBy === "ai" ? "OpenAI suggestions" : "Local résumé suggestions"}
                </Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.suggestedQueries.map((query) => {
                  const selected = selectedQueries.includes(query);
                  return (
                    <Button
                      key={query}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      onClick={() => toggleQuery(query)}
                      aria-pressed={selected}
                    >
                      {selected && <Check className="size-3.5" />}
                      {query}
                    </Button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Select up to four. {selectedQueries.length}/4 selected.
              </p>
              {(profile.skills.length > 0 || profile.industries.length > 0) && (
                <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-4">
                  {[...new Set([...profile.industries, ...profile.skills])].map((item) => (
                    <Badge key={item} variant="secondary">
                      {item}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/80">
        <CardHeader>
          <CardTitle>Search criteria</CardTitle>
          <CardDescription>
            If résumé suggestions are selected, they replace the manual keyword field and run as separate searches.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={searchJobs} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_0.9fr_0.7fr]">
              <div className="space-y-2">
                <Label htmlFor="discovery-keywords">Manual keywords</Label>
                <Input
                  id="discovery-keywords"
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  placeholder="finance, analytics, lending…"
                  disabled={selectedQueries.length > 0}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discovery-title">Additional title focus</Label>
                <Input
                  id="discovery-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discovery-location">Location</Label>
                <Input
                  id="discovery-location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Toronto ON"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discovery-sort">Sort providers by</Label>
                <Select value={sort} onValueChange={(value) => setSort(value as JobDiscoverySort)}>
                  <SelectTrigger id="discovery-sort" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rank">Relevance</SelectItem>
                    <SelectItem value="post">Newest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-4 border-t pt-5 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Quick searches:</span>
                {DEFAULT_SEARCHES.map((suggestion) => (
                  <Button
                    key={suggestion}
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setSelectedQueries([]);
                      setKeywords(suggestion);
                    }}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
              <Button type="submit" size="lg" disabled={!canSearch || searching}>
                {searching ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {searching ? "Searching providers…" : "Search and rank"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {!readableResumes.length && (
        <div className="flex gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-200">
          <FileSearch className="mt-0.5 size-4 shrink-0" />
          Upload a readable résumé in Fit analysis before ranking jobs.
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      {result ? (
        <Results result={result} loadingMore={loadingMore} onLoadMore={loadMore} />
      ) : (
        <Card className="border-dashed bg-card/35">
          <CardContent className="grid min-h-60 place-items-center p-8 text-center">
            <div>
              <Building2 className="mx-auto mb-3 size-9 text-muted-foreground" />
              <h3 className="font-medium">Your strongest job leads will appear here</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Generate résumé-based searches or enter your own keywords, then let Trackline search every available
                source.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function Results({
  result,
  loadingMore,
  onLoadMore,
}: {
  result: JobDiscoveryResult;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h3 className="text-lg font-semibold">Ranked opportunities</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Showing {result.jobs.length} unique matches from {result.queries.length} search
            {result.queries.length === 1 ? "" : "es"}. Providers reported approximately{" "}
            {result.totalResults.toLocaleString("en-CA")} total results.
          </p>
        </div>
        <Badge variant="outline" className="w-fit">
          {result.rankingSource === "ai" ? "OpenAI preliminary ranking" : "Local fallback ranking"}
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {result.providers.map((provider) => (
          <div key={provider.source} className="rounded-xl border bg-card/55 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{provider.label}</p>
              {provider.ok ? (
                <Badge variant="secondary">{provider.resultCount} fetched</Badge>
              ) : (
                <Badge variant="outline">{provider.enabled ? "Unavailable" : "Needs API key"}</Badge>
              )}
            </div>
            <p className="mt-2 flex gap-2 text-xs leading-relaxed text-muted-foreground">
              {provider.ok ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-300" />
              ) : (
                <CircleOff className="mt-0.5 size-3.5 shrink-0" />
              )}
              {provider.message}
            </p>
            {provider.ok && (provider.cachedCount > 0 || provider.budgetRemaining !== null) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {provider.cachedCount > 0 && (
                  <Badge variant="outline">
                    {provider.cachedCount} cached search{provider.cachedCount === 1 ? "" : "es"}
                  </Badge>
                )}
                {provider.budgetRemaining !== null && provider.budgetPeriod && (
                  <Badge variant="outline">
                    {provider.budgetRemaining} {provider.budgetPeriod} requests remaining
                  </Badge>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {result.jobs.length ? (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {result.jobs.map((job) => (
              <JobResultCard key={job.id} job={job} />
            ))}
          </div>
          {result.hasMore && (
            <div className="flex justify-center pt-2">
              <Button type="button" variant="outline" size="lg" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="size-4 animate-spin" />}
                {loadingMore ? "Loading more…" : "Load more jobs"}
              </Button>
            </div>
          )}
        </>
      ) : (
        <Card className="border-dashed bg-card/35">
          <CardContent className="grid min-h-52 place-items-center p-8 text-center">
            <div>
              <BriefcaseBusiness className="mx-auto mb-3 size-8 text-muted-foreground" />
              <h3 className="font-medium">No matching jobs found</h3>
              <p className="mt-1 text-sm text-muted-foreground">Try broader role titles or a nearby location.</p>
            </div>
          </CardContent>
        </Card>
      )}
      <p className="text-center text-xs text-muted-foreground">
        Trackline combines temporary provider results and links to the original source. Verify availability, complete
        requirements, and application instructions before applying.
      </p>
    </div>
  );
}

function JobResultCard({ job }: { job: RankedJob }) {
  const experience = job.experience ?? {
    requiredYears: null,
    requiredLabel: null,
    resumeYears: null,
    match: "unknown" as const,
    preferredOnly: false,
    summary: "Experience information was not available for this result.",
  };
  const scoreTone =
    job.score >= 80
      ? "text-emerald-300"
      : job.score >= 60
        ? "text-primary"
        : job.score >= 40
          ? "text-amber-300"
          : "text-rose-300";
  const experienceLabel = {
    meets: "Experience meets",
    close: "Experience close",
    below: "Experience gap",
    unknown: "Experience unclear",
  }[experience.match];
  const experienceTone =
    experience.match === "meets"
      ? "border-emerald-400/35 text-emerald-300"
      : experience.match === "close"
        ? "border-amber-400/35 text-amber-300"
        : experience.match === "below"
          ? "border-rose-400/35 text-rose-300"
          : "";

  return (
    <Card className="flex h-full flex-col border-border/80 bg-card/85">
      <CardHeader className="gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {job.sources.map((source) => (
                <Badge key={source} variant="outline">
                  {JOB_SOURCE_LABELS[source]}
                </Badge>
              ))}
            </div>
            <CardTitle className="leading-snug">{job.title}</CardTitle>
            <CardDescription className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5">
                <Building2 className="size-3.5" />
                {job.company}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {job.location}
              </span>
            </CardDescription>
          </div>
          <div className="shrink-0 text-right">
            <p className={`font-mono text-3xl font-semibold ${scoreTone}`}>{job.score}%</p>
            <p className="mt-1 text-[0.7rem] uppercase tracking-wide text-muted-foreground">Preliminary fit</p>
          </div>
        </div>
        <Progress value={job.score} aria-label={`Preliminary fit score ${job.score} percent`} />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{job.recommendation}</Badge>
            <Badge variant="outline" className={experienceTone} title={experience.summary}>
              {experienceLabel}
              {experience.requiredLabel ? ` · ${experience.requiredLabel}` : ""}
            </Badge>
            {job.salary && <Badge variant="outline">{job.salary}</Badge>}
            {job.employmentType && <Badge variant="outline">{job.employmentType}</Badge>}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{job.rationale}</p>
        </div>
        {job.matchingSignals.length > 0 && (
          <SignalList title="Why it may fit" items={job.matchingSignals} tone="bg-emerald-300" />
        )}
        {job.concerns.length > 0 && (
          <SignalList title="Check before applying" items={job.concerns} tone="bg-amber-300" />
        )}
        <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">{job.description}</p>
        <div className="mt-auto flex flex-col justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="size-3.5" />
            Posted {formatDate(job.publishedAt)}
          </span>
          <Button asChild>
            <a href={job.url} target="_blank" rel="noreferrer">
              Open on {JOB_SOURCE_LABELS[job.source]}
              <ArrowUpRight className="size-4" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SignalList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className={`mt-2 size-1.5 shrink-0 rounded-full ${tone}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function deduplicateRankedJobs(jobs: RankedJob[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = `${job.company}|${job.title}|${job.location}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date(value));
}
