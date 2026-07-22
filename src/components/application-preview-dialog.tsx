"use client";

import { useState } from "react";
import {
  Banknote,
  CalendarDays,
  ExternalLink,
  FileText,
  Link2,
  MapPin,
  Pencil,
  RefreshCw,
  StickyNote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { Application } from "@/lib/applications";

export function ApplicationPreviewDialog({
  application,
  onOpenChange,
  onEdit,
  onDescriptionImported,
}: {
  application: Application | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (application: Application) => void;
  onDescriptionImported: (application: Application, description: string) => Promise<void>;
}) {
  const [importingDescription, setImportingDescription] = useState(false);
  const [importError, setImportError] = useState("");
  if (!application) return null;
  const selectedApplication = application;

  const hasDescription = Boolean(application.jobDescription.trim());
  const hasSalary = Boolean(application.salary.trim());
  const hasJobUrl = Boolean(application.jobUrl.trim());

  function editDetails() {
    onOpenChange(false);
    onEdit(selectedApplication);
  }

  async function importDescription() {
    if (!hasJobUrl || importingDescription) return;
    setImportingDescription(true);
    setImportError("");
    try {
      const response = await fetch("/api/job-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: selectedApplication.jobUrl }),
      });
      const data = await readApiResponse<{ jobDescription?: string; error?: string }>(response);
      if (!response.ok || !data.jobDescription) {
        throw new Error(data.error ?? "The job description could not be imported.");
      }
      await onDescriptionImported(selectedApplication, data.jobDescription);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The job description could not be imported.");
    } finally {
      setImportingDescription(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{application.status}</Badge>
            <span className="text-xs text-muted-foreground">Updated {formatDate(application.updatedAt)}</span>
          </div>
          <DialogTitle className="mt-2 text-2xl">{application.role}</DialogTitle>
          <DialogDescription className="text-base">{application.company}</DialogDescription>
        </DialogHeader>

        <section aria-label="Job overview" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Detail icon={<MapPin />} label="Location" value={application.location} />
          <Detail
            icon={<Banknote />}
            label="Salary"
            value={hasSalary ? application.salary : "Not added yet"}
            muted={!hasSalary}
          />
          <Detail icon={<CalendarDays />} label="Applied" value={formatDate(application.appliedDate)} />
          <Detail icon={<Link2 />} label="Source" value={application.source} />
        </section>

        <Separator />

        <section aria-labelledby="job-description-heading">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 id="job-description-heading" className="flex items-center gap-2 font-medium">
                <FileText className="size-4 text-primary" />
                Job description
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Keep the posting here even if the original listing expires.
              </p>
            </div>
            {hasJobUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={application.jobUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  Open posting
                </a>
              </Button>
            )}
          </div>
          {hasDescription ? (
            <div className="mt-4 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-muted/20 p-4 text-sm leading-relaxed text-muted-foreground">
              {application.jobDescription}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed bg-muted/10 p-6 text-center">
              <FileText className="mx-auto size-7 text-muted-foreground" />
              <p className="mt-3 font-medium">No job description saved</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {hasJobUrl
                  ? "Trackline can try the saved posting URL, or you can add the text yourself."
                  : "Add the posting text so the role remains useful after the source page disappears."}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {hasJobUrl && (
                  <Button size="sm" onClick={() => void importDescription()} disabled={importingDescription}>
                    <RefreshCw className={`size-4 ${importingDescription ? "animate-spin" : ""}`} />
                    {importingDescription ? "Importing…" : "Try saved URL"}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={editDetails}>
                  Add manually
                </Button>
              </div>
              {importError && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {importError}
                </p>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="notes-heading">
          <h3 id="notes-heading" className="flex items-center gap-2 font-medium">
            <StickyNote className="size-4 text-primary" />
            Notes
          </h3>
          <p
            className={`mt-3 whitespace-pre-wrap text-sm leading-relaxed ${application.notes ? "" : "text-muted-foreground"}`}
          >
            {application.notes || "No notes added yet."}
          </p>
        </section>

        <DialogFooter className="sm:justify-between">
          <p className="mr-auto text-xs text-muted-foreground">Application ID · {application.id.slice(0, 8)}</p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={editDetails}>
            <Pencil className="size-4" />
            Edit job details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({
  icon,
  label,
  value,
  muted = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl bg-muted/25 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      <p className={`mt-2 text-sm font-medium ${muted ? "text-muted-foreground" : ""}`}>{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) throw new Error("The job description service returned an empty response.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`The job description service returned ${response.status}.`);
  }
}
