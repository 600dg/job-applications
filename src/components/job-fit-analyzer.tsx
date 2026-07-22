"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  FileSearch,
  Link2,
  Lightbulb,
  Loader2,
  ShieldCheck,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ResumeManager } from "@/components/resume-manager";
import type { FitAnalysis } from "@/lib/fit-analysis";
import type { ResumeImprovementReport } from "@/lib/resume-improvements";
import type { SavedResume } from "@/lib/resumes";

export function JobFitAnalyzer({ initialResumes }: { initialResumes: SavedResume[] }) {
  const initialResume =
    initialResumes.find((resume) => resume.isPrimary && resume.parseStatus === "ready") ??
    initialResumes.find((resume) => resume.parseStatus === "ready");
  const [activeResumeId, setActiveResumeId] = useState(initialResume?.id ?? "");
  const [activeResumeName, setActiveResumeName] = useState(initialResume?.fileName ?? "");
  const [posting, setPosting] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [result, setResult] = useState<FitAnalysis | null>(null);
  const [improvements, setImprovements] = useState<ResumeImprovementReport | null>(null);
  const [resultSource, setResultSource] = useState<"ai" | "local" | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [error, setError] = useState("");
  const canAnalyze = Boolean(activeResumeId) && posting.trim().length >= 80;

  async function analyze() {
    if (!canAnalyze || isAnalyzing) return;

    setError("");
    setResult(null);
    setImprovements(null);
    setResultSource("local");
    setIsAnalyzing(true);

    try {
      const response = await fetch("/api/fit-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId: activeResumeId, jobPosting: posting }),
      });
      const data = await readApiResponse<{
        analysis?: FitAnalysis;
        improvements?: ResumeImprovementReport | null;
        source?: "ai" | "local";
        error?: string;
      }>(response, "The analysis could not be completed.");
      if (!response.ok || !data.analysis) throw new Error(data.error ?? "AI analysis failed.");
      setResult(data.analysis);
      setImprovements(data.improvements ?? null);
      setResultSource(data.source ?? "ai");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI analysis failed. The local report is shown instead.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function clearPosting() {
    setPosting("");
    setJobUrl("");
    setResult(null);
    setImprovements(null);
    setResultSource(null);
    setError("");
  }

  async function importJobUrl() {
    if (!jobUrl.trim() || isImportingUrl) return;
    setIsImportingUrl(true);
    setError("");
    try {
      const response = await fetch("/api/job-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: jobUrl }),
      });
      const data = await readApiResponse<{ jobDescription?: string; sourceUrl?: string; error?: string }>(
        response,
        "The job page could not be imported.",
      );
      if (!response.ok || !data.jobDescription) throw new Error(data.error ?? "The job page could not be imported.");
      setPosting(data.jobDescription);
      setJobUrl(data.sourceUrl ?? jobUrl);
      setResult(null);
      setImprovements(null);
      setResultSource(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The job page could not be imported.");
    } finally {
      setIsImportingUrl(false);
    }
  }

  return (
    <section className="space-y-6" aria-labelledby="fit-analysis-title">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <Target className="size-4" />
            Job-specific résumé review
          </div>
          <h2 id="fit-analysis-title" className="text-2xl font-semibold tracking-tight">
            Tailor your résumé to one job.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Upload a résumé, add the job description, and get a practical match score with grounded changes ready to
            use.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={clearPosting}>
            Start over
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <ResumeManager
          initialResumes={initialResumes}
          onUseResume={(resume) => {
            setActiveResumeId(resume.id);
            setActiveResumeName(resume.fileName);
            setResult(null);
            setImprovements(null);
            setResultSource(null);
            setError("");
          }}
        />
        <Card className="border-border/80 bg-card/75 xl:sticky xl:top-6">
          <CardHeader className="gap-3">
            <div>
              <CardTitle>Job description</CardTitle>
              <CardDescription className="mt-1">
                Paste the responsibilities and qualifications. Your selected résumé stays behind the scenes.
              </CardDescription>
            </div>
            <Badge variant={activeResumeName ? "secondary" : "outline"} className="w-fit max-w-full">
              <FileSearch className="size-3.5" />
              {activeResumeName ? `Using ${activeResumeName}` : "Select a readable résumé"}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-xl border bg-muted/20 p-3">
              <Label htmlFor="job-url" className="text-xs font-medium">
                Import from a public job URL
              </Label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="job-url"
                    value={jobUrl}
                    onChange={(event) => setJobUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void importJobUrl();
                      }
                    }}
                    placeholder="https://company.com/jobs/role"
                    className="pl-9"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void importJobUrl()}
                  disabled={!jobUrl.trim() || isImportingUrl}
                >
                  {isImportingUrl && <Loader2 className="size-4 animate-spin" />}
                  {isImportingUrl ? "Importing…" : "Import"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Some LinkedIn and Indeed pages block automated reading. If import fails, paste the description below.
              </p>
            </div>
            <Label htmlFor="job-posting" className="sr-only">
              Job description
            </Label>
            <Textarea
              id="job-posting"
              value={posting}
              onChange={(event) => {
                setPosting(event.target.value);
                setResult(null);
                setImprovements(null);
              }}
              className="min-h-[24rem] resize-y leading-relaxed"
              placeholder="Paste the full job description here…"
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 rounded-xl border bg-card/50 p-4 sm:flex-row">
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Your résumé and job description are sent securely from the server to OpenAI only when you choose Analyze.
            The score also incorporates an offline job-specific comparison.
          </span>
        </div>
        <Button onClick={analyze} disabled={!canAnalyze || isAnalyzing} className="w-full sm:w-auto">
          {isAnalyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {isAnalyzing ? "Analyzing and drafting…" : "Analyze and tailor"}
          {!isAnalyzing && <ArrowRight className="size-4" />}
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
          {result && resultSource === "local" ? " The local report is shown below." : ""}
        </div>
      )}
      {result ? (
        <AnalysisResult result={result} source={resultSource ?? "local"} improvements={improvements} />
      ) : (
        <EmptyResult />
      )}
    </section>
  );
}

function AnalysisResult({
  result,
  source,
  improvements,
}: {
  result: FitAnalysis;
  source: "ai" | "local";
  improvements: ResumeImprovementReport | null;
}) {
  const scoreTone =
    result.score >= 75
      ? "text-emerald-300"
      : result.score >= 55
        ? "text-primary"
        : result.score >= 35
          ? "text-amber-300"
          : "text-rose-300";
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="border-border/80 bg-card/85">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardDescription>
                  {source === "ai" ? "AI-assisted fit score" : "Local directional score"}
                </CardDescription>
                <CardTitle className={`mt-2 font-mono text-5xl ${scoreTone}`}>{result.score}%</CardTitle>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge variant="outline" className="text-sm">
                  {result.band}
                </Badge>
                <Badge variant="secondary">{source === "ai" ? "OpenAI analysis" : "Local fallback"}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <Progress value={result.score} aria-label={`Fit score ${result.score} percent`} />
            {source === "ai" && result.offlineScore !== undefined && result.aiScore !== undefined && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Calibrated from offline evidence ({result.offlineScore}%) and contextual AI review ({result.aiScore}%).
              </p>
            )}
            <div>
              <p className="font-medium">Recommended action</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{result.action}</p>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <Metric label="Keyword coverage" value={`${result.coverage}%`} />
              <Metric label="Signals reviewed" value={result.signalsConsidered} />
            </div>
            {result.signalsConsidered < 3 && (
              <div className="flex gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                Add more responsibilities and qualifications for a meaningful score.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/85">
          <CardHeader>
            <CardTitle>Fit summary</CardTitle>
            <CardDescription className="mt-1 leading-relaxed">{result.summary}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <ResultList
              title="Strong matches"
              icon={<CheckCircle2 className="text-emerald-300" />}
              items={result.matchedQualifications}
              empty="No direct matches detected yet."
            />
            <ResultList
              title="Gaps to validate"
              icon={<XCircle className="text-rose-300" />}
              items={result.gaps}
              empty="No gaps detected in the recognized requirements."
            />
            <div className="md:col-span-2">
              <Separator />
            </div>
            <ResultList
              title="Résumé adjustments"
              icon={<Lightbulb className="text-amber-300" />}
              items={result.suggestions}
              empty="Add more detail to generate suggestions."
            />
            <div>
              <h3 className="mb-3 flex items-center gap-2 font-medium">
                <FileSearch className="size-4 text-primary" />
                Keywords to review
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.keywords.length ? (
                  result.keywords.map((keyword) => (
                    <Badge key={keyword} variant="secondary">
                      {keyword}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No recognized keywords yet.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <TailoredChanges improvements={improvements} source={source} />
    </div>
  );
}

function TailoredChanges({
  improvements,
  source,
}: {
  improvements: ResumeImprovementReport | null;
  source: "ai" | "local";
}) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  async function copyEdit(index: number, revised: string) {
    await navigator.clipboard.writeText(revised);
    setCopiedIndex(index);
    window.setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1500);
  }

  return (
    <Card className="border-border/80 bg-card/85">
      <CardHeader>
        <CardTitle>Changes you can use</CardTitle>
        <CardDescription>
          Grounded rewrites based only on evidence already present in your résumé. Review before copying.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {improvements?.edits.length ? (
          <div className="space-y-4">
            {improvements.edits.map((edit, index) => (
              <article key={`${edit.original}-${index}`} className="rounded-xl border border-border/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="secondary">{edit.category}</Badge>
                  <Button type="button" size="sm" variant="ghost" onClick={() => void copyEdit(index, edit.revised)}>
                    {copiedIndex === index ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copiedIndex === index ? "Copied" : "Copy rewrite"}
                  </Button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current</p>
                    <p className="mt-2 text-sm leading-relaxed">{edit.original}</p>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-primary">Suggested</p>
                    <p className="mt-2 text-sm leading-relaxed">{edit.revised}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{edit.reason}</p>
              </article>
            ))}
            {improvements.questions.length > 0 && (
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
                <p className="font-medium text-amber-200">Details worth adding if they are true</p>
                <ul className="mt-2 space-y-2 text-sm text-amber-100/80">
                  {improvements.questions.map((question) => (
                    <li key={question}>• {question}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {source === "local"
              ? "AI rewrites are unavailable, but the job-specific local comparison is shown above."
              : "The comparison completed, but no safely grounded rewrites were returned."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResultList({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  empty: string;
}) {
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 font-medium">
        {icon}
        {title}
      </h3>
      {items.length ? (
        <ul className="space-y-2 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-current" />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="font-mono text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyResult() {
  return (
    <Card className="border-dashed bg-card/35">
      <CardContent className="grid min-h-60 place-items-center p-8 text-center">
        <div>
          <FileSearch className="mx-auto mb-3 size-9 text-muted-foreground" />
          <h3 className="font-medium">Your fit report will appear here</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Select a readable résumé, paste a job description, then choose Analyze fit.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

async function readApiResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const text = await response.text();
  if (!text) {
    throw new Error(response.status === 504 ? "The request timed out. Try again." : fallbackMessage);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    if (response.status === 504) throw new Error("The request timed out. Try again.");
    throw new Error(response.ok ? fallbackMessage : `${fallbackMessage} Server returned ${response.status}.`);
  }
}
