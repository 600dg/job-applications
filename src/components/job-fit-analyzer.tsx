"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  Lightbulb,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ResumeManager } from "@/components/resume-manager";
import { ResumeImprovementDialog } from "@/components/resume-improvement-dialog";
import { analyzeJobFit, SAMPLE_JOB_POSTING, type FitAnalysis } from "@/lib/fit-analysis";
import type { SavedResume } from "@/lib/resumes";

export function JobFitAnalyzer({ initialResumes }: { initialResumes: SavedResume[] }) {
  const initialResume =
    initialResumes.find((resume) => resume.isPrimary && resume.parseStatus === "ready") ??
    initialResumes.find((resume) => resume.parseStatus === "ready");
  const [profile, setProfile] = useState(initialResume?.extractedText ?? "");
  const [activeResumeId, setActiveResumeId] = useState(initialResume?.id ?? "");
  const [activeResumeName, setActiveResumeName] = useState(initialResume?.fileName ?? "");
  const [posting, setPosting] = useState(SAMPLE_JOB_POSTING);
  const [result, setResult] = useState<FitAnalysis | null>(null);
  const [resultSource, setResultSource] = useState<"ai" | "local" | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const canAnalyze = profile.trim().length >= 40 && posting.trim().length >= 80;

  async function analyze() {
    if (!canAnalyze || isAnalyzing) return;

    setError("");
    setResult(analyzeJobFit(profile, posting));
    setResultSource("local");
    setIsAnalyzing(true);

    try {
      const response = await fetch("/api/fit-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId: activeResumeId, jobPosting: posting }),
      });
      const data = (await response.json()) as { analysis?: FitAnalysis; error?: string };
      if (!response.ok || !data.analysis) throw new Error(data.error ?? "AI analysis failed.");
      setResult(data.analysis);
      setResultSource("ai");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI analysis failed. The local report is shown instead.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function loadSample() {
    setPosting(SAMPLE_JOB_POSTING);
    setResult(null);
    setResultSource(null);
    setError("");
  }

  function clearPosting() {
    setPosting("");
    setResult(null);
    setResultSource(null);
    setError("");
  }

  return (
    <section className="space-y-6" aria-labelledby="fit-analysis-title">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <Target className="size-4" />
            Local fit workspace
          </div>
          <h2 id="fit-analysis-title" className="text-2xl font-semibold tracking-tight">
            Compare your profile to a role.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            See where your evidence lines up, what may be missing, and how to tailor your application before you spend
            time applying.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadSample}>
            <RotateCcw className="size-4" />
            Load sample job
          </Button>
          <Button variant="ghost" size="sm" onClick={clearPosting}>
            Clear posting
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <ResumeManager
          initialResumes={initialResumes}
          onUseResume={(resume) => {
            setProfile(resume.extractedText);
            setActiveResumeId(resume.id);
            setActiveResumeName(resume.fileName);
            setResult(null);
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
            <Label htmlFor="job-posting" className="sr-only">
              Job description
            </Label>
            <Textarea
              id="job-posting"
              value={posting}
              onChange={(event) => {
                setPosting(event.target.value);
                setResult(null);
              }}
              className="min-h-[32rem] resize-y leading-relaxed"
              placeholder="Paste the full job description here…"
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 rounded-xl border bg-card/50 p-4 sm:flex-row">
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Your selected résumé and job description are sent securely from the server to OpenAI only when you choose
            Analyze fit.
          </span>
        </div>
        <Button onClick={analyze} disabled={!canAnalyze || isAnalyzing} className="w-full sm:w-auto">
          {isAnalyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {isAnalyzing ? "Analyzing…" : "Analyze fit"}
          {!isAnalyzing && <ArrowRight className="size-4" />}
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error} The local report is shown below.
        </div>
      )}
      {result ? (
        <AnalysisResult
          result={result}
          source={resultSource ?? "local"}
          resumeId={activeResumeId}
          jobPosting={posting}
        />
      ) : (
        <EmptyResult />
      )}
    </section>
  );
}

function AnalysisResult({
  result,
  source,
  resumeId,
  jobPosting,
}: {
  result: FitAnalysis;
  source: "ai" | "local";
  resumeId: string;
  jobPosting: string;
}) {
  const scoreTone =
    result.score >= 80
      ? "text-emerald-300"
      : result.score >= 60
        ? "text-primary"
        : result.score >= 40
          ? "text-amber-300"
          : "text-rose-300";
  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Card className="border-border/80 bg-card/85">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardDescription>{source === "ai" ? "AI-assisted fit score" : "Local directional score"}</CardDescription>
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
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <CardTitle>Fit summary</CardTitle>
              <CardDescription className="mt-1 leading-relaxed">{result.summary}</CardDescription>
            </div>
            <ResumeImprovementDialog resumeId={resumeId} jobPosting={jobPosting} label="Generate tailored edits" />
          </div>
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
