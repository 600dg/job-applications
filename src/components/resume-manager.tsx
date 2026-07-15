"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Loader2, ScanText, Star, Trash2, Upload, XCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ResumeImprovementDialog } from "@/components/resume-improvement-dialog";
import type { AtsCheck, SavedResume } from "@/lib/resumes";

const UPLOAD_STAGES = ["Uploading PDF...", "Extracting text...", "Running AI ATS analysis..."] as const;
const UPLOAD_PROGRESS = [20, 50, 80] as const;

export function ResumeManager({
  initialResumes,
  onUseResume,
}: {
  initialResumes: SavedResume[];
  onUseResume: (resume: SavedResume) => void;
}) {
  const [resumes, setResumes] = useState(initialResumes);
  const [selectedId, setSelectedId] = useState(
    initialResumes.find((resume) => resume.isPrimary)?.id ?? initialResumes[0]?.id ?? "",
  );
  const [uploadStage, setUploadStage] = useState(-1);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<SavedResume | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploading = uploadStage >= 0;
  const selected = resumes.find((resume) => resume.id === selectedId) ?? resumes[0];

  async function refreshResumes() {
    const response = await fetch("/api/resumes");
    if (!response.ok) throw new Error("Could not refresh your résumé library.");
    const data = (await response.json()) as { resumes: SavedResume[] };
    setResumes(data.resumes);
    setSelectedId((current) =>
      data.resumes.some((resume) => resume.id === current) ? current : (data.resumes[0]?.id ?? ""),
    );
  }

  async function uploadResume(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadStage(0);
    const stageTimers = [
      window.setTimeout(() => setUploadStage(1), 700),
      window.setTimeout(() => setUploadStage(2), 2200),
    ];
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/resumes", { method: "POST", body: formData });
      const data = (await response.json()) as { resume?: SavedResume; error?: string };
      if (!response.ok || !data.resume) throw new Error(data.error ?? "Upload failed.");
      setResumes((current) => [data.resume as SavedResume, ...current]);
      setSelectedId(data.resume.id);
      if (data.resume.parseStatus === "ready") onUseResume(data.resume);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      stageTimers.forEach((timer) => window.clearTimeout(timer));
      setUploadStage(-1);
      event.target.value = "";
    }
  }

  async function makePrimary(resume: SavedResume) {
    const previous = resumes;
    setError("");
    setResumes((current) => current.map((item) => ({ ...item, isPrimary: item.id === resume.id })));
    try {
      const response = await fetch("/api/resumes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resume.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update the primary résumé.");
    } catch (updateError) {
      setResumes(previous);
      setError(updateError instanceof Error ? updateError.message : "Could not update the primary résumé.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const deleted = deleting;
    const previous = resumes;
    const previousSelectedId = selectedId;
    const remaining = resumes.filter((resume) => resume.id !== deleted.id);
    setError("");
    setResumes(remaining);
    setSelectedId((current) => (current === deleted.id ? (remaining[0]?.id ?? "") : current));
    setDeleting(null);
    try {
      const response = await fetch("/api/resumes?id=" + encodeURIComponent(deleted.id), { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not delete the résumé.");
      await refreshResumes();
    } catch (deleteError) {
      setResumes(previous);
      setSelectedId(previousSelectedId);
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the résumé.");
    }
  }

  return (
    <Card className="border-border/80 bg-card/75">
      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Résumé library</CardTitle>
          <CardDescription className="mt-1">
            Private PDFs with an AI-assisted ATS review on upload. Maximum 10 MB.
          </CardDescription>
        </div>
        <div>
          <Input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={uploadResume}
            aria-label="Upload résumé PDF"
          />
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {uploading ? UPLOAD_STAGES[uploadStage] : "Upload PDF"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {uploading && (
          <div aria-live="polite" className="space-y-2 rounded-lg border bg-muted/25 p-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span>{UPLOAD_STAGES[uploadStage]}</span>
              <span className="font-mono text-muted-foreground">{UPLOAD_PROGRESS[uploadStage]}%</span>
            </div>
            <Progress value={UPLOAD_PROGRESS[uploadStage]} aria-label={UPLOAD_STAGES[uploadStage]} />
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}
        {resumes.length ? (
          <div className="space-y-4">
            <div className="space-y-2" aria-label="Saved résumé versions">
              {resumes.map((resume) => (
                <button
                  key={resume.id}
                  type="button"
                  onClick={() => setSelectedId(resume.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${selected?.id === resume.id ? "border-primary/50 bg-primary/5" : "border-border/80 hover:bg-muted/40"}`}
                >
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{resume.fileName}</p>
                        {resume.isPrimary && (
                          <Badge variant="secondary">
                            <Star className="size-3 fill-current" />
                            Primary
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {resume.pageCount} {resume.pageCount === 1 ? "page" : "pages"} · {formatBytes(resume.size)} ·{" "}
                        {formatDate(resume.createdAt)}
                      </p>
                    </div>
                    <span className="font-mono text-lg font-semibold">{resume.atsScore}</span>
                  </div>
                </button>
              ))}
            </div>
            {selected && (
              <ResumeReport
                resume={selected}
                onUse={() => onUseResume(selected)}
                onPrimary={() => makePrimary(selected)}
                onDelete={() => setDeleting(selected)}
              />
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="grid min-h-44 w-full place-items-center rounded-xl border border-dashed p-6 text-center hover:bg-muted/30"
          >
            <div>
              <ScanText className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">Upload your first résumé</p>
              <p className="mt-1 text-sm text-muted-foreground">
                We will extract its text and show exactly how the readiness score is calculated.
              </p>
            </div>
          </button>
        )}
      </CardContent>
      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this résumé?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {deleting?.fileName} from private storage. If it is primary, the newest remaining
              version becomes primary.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete résumé
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ResumeReport({
  resume,
  onUse,
  onPrimary,
  onDelete,
}: {
  resume: SavedResume;
  onUse: () => void;
  onPrimary: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/80 p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">ATS readiness</p>
            <Badge variant={resume.atsAnalysis.source === "ai" ? "secondary" : "outline"}>
              {resume.atsAnalysis.source === "ai" ? "AI analysis" : "Local analysis"}
            </Badge>
          </div>
          <div className="mt-1 flex items-end gap-2">
            <span className="font-mono text-4xl font-semibold">{resume.atsScore}</span>
            <span className="pb-1 text-sm text-muted-foreground">/ 100 · {resume.atsAnalysis.band}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onUse} disabled={resume.parseStatus !== "ready"}>
            Use in matcher
          </Button>
          {!resume.isPrimary && (
            <Button size="sm" variant="outline" onClick={onPrimary}>
              <Star className="size-4" />
              Make primary
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" onClick={onDelete} aria-label={`Delete ${resume.fileName}`}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <Progress value={resume.atsScore} className="mt-4" aria-label={`ATS readiness ${resume.atsScore} out of 100`} />
      {resume.parseStatus === "needs_ocr" && (
        <div className="mt-4 flex gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Very little text could be extracted. This PDF may be scanned and needs OCR before reliable matching.
        </div>
      )}
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {resume.atsAnalysis.checks.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </div>
      {resume.atsAnalysis.suggestions.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-medium">Highest-impact improvements</p>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {resume.atsAnalysis.suggestions.map((suggestion) => (
              <li key={suggestion} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-current" />
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-5 flex flex-col items-start justify-between gap-3 rounded-xl border bg-card/50 p-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium">Ready to revise it?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Generate grounded before-and-after edits without changing the uploaded PDF.
          </p>
        </div>
        <ResumeImprovementDialog resumeId={resume.id} />
      </div>
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        This is an explainable readiness check, not a guaranteed score from any employer&apos;s ATS. The AI reviews
        extracted text only; formatting that requires visual inspection is outside this version.
      </p>
    </div>
  );
}

function CheckRow({ check }: { check: AtsCheck }) {
  const Icon = check.status === "pass" ? CheckCircle2 : check.status === "warning" ? AlertTriangle : XCircle;
  const tone =
    check.status === "pass" ? "text-emerald-300" : check.status === "warning" ? "text-amber-300" : "text-rose-300";
  return (
    <div className="rounded-lg bg-muted/35 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className={`size-4 ${tone}`} />
        {check.label}
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {check.points}/{check.maxPoints}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{check.detail}</p>
    </div>
  );
}

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(1) + " MB"
    : Math.max(1, Math.round(bytes / 1024)) + " KB";
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
