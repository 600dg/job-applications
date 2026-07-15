"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ResumeImprovementReport } from "@/lib/resume-improvements";

export function ResumeImprovementDialog({
  resumeId,
  jobPosting,
  label = "Generate improvements",
}: {
  resumeId: string;
  jobPosting?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ResumeImprovementReport | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  async function generate() {
    if (loading) return;
    setOpen(true);
    setLoading(true);
    setError("");
    setReport(null);

    try {
      const response = await fetch("/api/resume-improvements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId, ...(jobPosting ? { jobPosting } : {}) }),
      });
      const data = (await response.json()) as { report?: ResumeImprovementReport; error?: string };
      if (!response.ok || !data.report) throw new Error(data.error ?? "Could not generate improvements.");
      setReport(data.report);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate improvements.");
    } finally {
      setLoading(false);
    }
  }

  async function copyEdit(index: number, revised: string) {
    await navigator.clipboard.writeText(revised);
    setCopiedIndex(index);
    window.setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" onClick={generate} disabled={!resumeId || loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {loading ? "Generating…" : label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{jobPosting ? "Job-tailored résumé edits" : "Résumé improvements"}</DialogTitle>
          <DialogDescription>
            Review each suggestion before copying it. Your uploaded PDF is never changed automatically.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="grid min-h-52 place-items-center text-center" aria-live="polite">
            <div>
              <Loader2 className="mx-auto size-8 animate-spin text-primary" />
              <p className="mt-3 font-medium">Drafting grounded edits…</p>
              <p className="mt-1 text-sm text-muted-foreground">This can take several seconds.</p>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p>{error}</p>
              <Button type="button" size="sm" variant="outline" className="mt-3" onClick={generate}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {report && (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-muted-foreground">{report.overview}</p>
            <div className="space-y-4">
              {report.edits.map((edit, index) => (
                <article key={`${edit.original}-${index}`} className="rounded-xl border border-border/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="secondary">{edit.category}</Badge>
                    <Button type="button" size="sm" variant="ghost" onClick={() => copyEdit(index, edit.revised)}>
                      {copiedIndex === index ? <Check className="size-4" /> : <Copy className="size-4" />}
                      {copiedIndex === index ? "Copied" : "Copy rewrite"}
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg bg-muted/30 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Original</p>
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
            </div>
            {report.questions.length > 0 && (
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
                <p className="font-medium text-amber-200">Details that could strengthen the next draft</p>
                <ul className="mt-2 space-y-2 text-sm text-amber-100/80">
                  {report.questions.map((question) => (
                    <li key={question}>• {question}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
