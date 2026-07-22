"use client";

import { useCallback, useEffect, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { Ban, CheckCircle2, Inbox, Loader2, Mail, RefreshCw, RotateCcw, Settings2, Unplug } from "lucide-react";
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
import type { Application } from "@/lib/applications";
import type { GmailImportReview } from "@/lib/email-suggestions";
import type { GmailConnectionStatus } from "@/lib/gmail-connection";

const TWO_HOURS = 2 * 60 * 60 * 1000;
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function GmailSyncControl({
  initialConnection,
  initialImportReviews,
  onApplicationsSynced,
}: {
  initialConnection: GmailConnectionStatus;
  initialImportReviews: GmailImportReview[];
  onApplicationsSynced: (applications: Application[]) => void;
}) {
  const clerk = useClerk();
  const [connection, setConnection] = useState(initialConnection);
  const [syncing, setSyncing] = useState(false);
  const [syncStage, setSyncStage] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(initialConnection.lastSyncedAt);
  const [relativeNow, setRelativeNow] = useState<number | null>(null);
  const [message, setMessage] = useState(initialConnection.lastError);
  const [importReviews, setImportReviews] = useState(initialImportReviews);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [savingReview, setSavingReview] = useState(false);

  const sync = useCallback(async (showFeedback: boolean) => {
    setSyncing(true);
    setSyncStage("Searching Gmail...");
    const stageTimers = [
      window.setTimeout(() => setSyncStage("Reading job emails..."), 900),
      window.setTimeout(() => setSyncStage("Verifying application emails with AI..."), 2500),
      window.setTimeout(() => setSyncStage("Preparing your review..."), 5000),
    ];
    if (showFeedback) setMessage("");
    try {
      const response = await fetch("/api/gmail/sync", { method: "POST" });
      const data = (await response.json()) as {
        importReviews?: GmailImportReview[];
        reviewed?: number;
        pendingAiReview?: number;
        email?: string;
        error?: string;
      };
      if (!response.ok || !data.importReviews) throw new Error(data.error ?? "Gmail sync failed.");
      setImportReviews(data.importReviews);
      setExcludedIds(new Set());
      const syncedAt = new Date().toISOString();
      setLastSyncedAt(syncedAt);
      setConnection((current) => ({
        ...current,
        connected: true,
        enabled: true,
        googleLinked: true,
        gmailScopeGranted: true,
        needsReconnect: false,
        email: data.email || current.email,
        lastError: "",
      }));
      if (showFeedback) {
        const results = [];
        if (data.reviewed) results.push(`${data.reviewed} candidate emails AI-verified`);
        if (data.importReviews.length)
          results.push(
            `${data.importReviews.length} ${data.importReviews.length === 1 ? "email" : "emails"} awaiting your review`,
          );
        if (data.pendingAiReview) results.push(`${data.pendingAiReview} queued for the next sync`);
        setMessage(results.length ? `${results.join("; ")}.` : "No new application emails found.");
        if (data.importReviews.length) setReviewOpen(true);
      }
    } catch (syncError) {
      const errorMessage = syncError instanceof Error ? syncError.message : "Gmail sync failed.";
      setMessage(errorMessage);
      if (errorMessage.toLowerCase().includes("reconnect") || errorMessage.toLowerCase().includes("connect google")) {
        setConnection((current) => ({
          ...current,
          connected: false,
          gmailScopeGranted: false,
          needsReconnect: current.googleLinked,
        }));
      }
    } finally {
      stageTimers.forEach((timer) => window.clearTimeout(timer));
      setSyncStage("");
      setSyncing(false);
    }
  }, []);

  function toggleExcluded(id: string) {
    setExcludedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyReview() {
    if (!importReviews.length || savingReview) return;
    setSavingReview(true);
    setMessage("");
    try {
      const response = await fetch("/api/gmail/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateIds: importReviews.map((review) => review.id),
          excludedIds: Array.from(excludedIds),
        }),
      });
      const data = (await response.json()) as {
        applications?: Application[];
        importReviews?: GmailImportReview[];
        created?: number;
        updated?: number;
        excluded?: number;
        error?: string;
      };
      if (!response.ok || !data.applications || !data.importReviews) {
        throw new Error(data.error ?? "Could not apply the Gmail review.");
      }
      onApplicationsSynced(data.applications);
      setImportReviews(data.importReviews);
      setExcludedIds(new Set());
      setReviewOpen(data.importReviews.length > 0);
      const results = [
        data.created ? `${data.created} imported` : "",
        data.updated ? `${data.updated} updated` : "",
        data.excluded ? `${data.excluded} excluded` : "",
      ].filter(Boolean);
      setMessage(results.length ? `${results.join("; ")}.` : "Review completed; no dashboard changes were needed.");
    } catch (reviewError) {
      setMessage(reviewError instanceof Error ? reviewError.message : "Could not apply the Gmail review.");
    } finally {
      setSavingReview(false);
    }
  }

  useEffect(() => {
    if (!connection.connected) return;
    const timer = window.setInterval(() => {
      void sync(false);
    }, TWO_HOURS);
    return () => window.clearInterval(timer);
  }, [connection.connected, sync]);

  useEffect(() => {
    if (!lastSyncedAt) return;
    const update = () => setRelativeNow(Date.now());
    const initialTimer = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [lastSyncedAt]);

  function openAccountSettings() {
    setMessage(
      "In Connected accounts, connect or reconnect Google and approve read-only Gmail access. Then click Check & sync.",
    );
    clerk.openUserProfile({
      additionalOAuthScopes: { google: [GMAIL_READONLY_SCOPE] },
    });
  }

  async function disconnect() {
    const previousConnection = connection;
    const previousLastSyncedAt = lastSyncedAt;
    setDisconnecting(true);
    setConnection((current) => ({ ...current, connected: false, enabled: false, lastSyncedAt: null, lastError: "" }));
    setLastSyncedAt(null);
    setMessage("Gmail syncing is off. Google remains available for sign-in.");
    try {
      const response = await fetch("/api/gmail/connection", { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not turn off Gmail sync.");
    } catch (disconnectError) {
      setConnection(previousConnection);
      setLastSyncedAt(previousLastSyncedAt);
      setMessage(disconnectError instanceof Error ? disconnectError.message : "Could not turn off Gmail sync.");
    } finally {
      setDisconnecting(false);
    }
  }

  if (!connection.configured) {
    return (
      <div className="text-left sm:text-right">
        <Button size="sm" disabled>
          <Mail className="size-4" />
          Clerk setup required
        </Button>
        <p className="mt-1.5 text-xs text-muted-foreground">Add the Clerk server key to enable Gmail</p>
      </div>
    );
  }

  if (!connection.connected) {
    const readyToEnable = connection.gmailScopeGranted;
    return (
      <div className="max-w-sm space-y-1.5 text-left sm:text-right">
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {readyToEnable ? (
            <Button size="sm" onClick={() => void sync(true)} disabled={syncing}>
              {syncing ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              {syncing ? syncStage : "Enable & sync"}
            </Button>
          ) : (
            <Button size="sm" onClick={openAccountSettings}>
              <Settings2 className="size-4" />
              {connection.googleLinked ? "Reconnect Gmail" : "Connect Gmail"}
            </Button>
          )}
          {!readyToEnable && (
            <Button size="sm" variant="outline" onClick={() => void sync(true)} disabled={syncing}>
              {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {syncing ? syncStage : "Check & sync"}
            </Button>
          )}
        </div>
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {syncStage ||
            message ||
            (readyToEnable
              ? "Read-only access is ready; enable automatic checks"
              : "Read-only application updates through your Clerk account")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 text-left sm:text-right">
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Badge variant="outline" className="text-emerald-300">
          <CheckCircle2 className="size-3.5" />
          {connection.email}
        </Badge>
        <Button size="sm" variant="outline" onClick={() => void sync(true)} disabled={syncing}>
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {syncing ? syncStage : "Sync now"}
        </Button>
        {importReviews.length > 0 && (
          <Button size="sm" onClick={() => setReviewOpen(true)}>
            <Inbox className="size-4" />
            Review {importReviews.length}
          </Button>
        )}
        <Button size="icon-sm" variant="ghost" aria-label="Gmail connection settings" onClick={openAccountSettings}>
          <Settings2 className="size-4" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Turn off Gmail sync"
          onClick={() => void disconnect()}
          disabled={disconnecting}
        >
          {disconnecting ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}
        </Button>
      </div>
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {syncStage ||
          message ||
          (lastSyncedAt
            ? relativeNow !== null
              ? "Last checked " + formatRelative(lastSyncedAt, relativeNow)
              : "Last checked recently"
            : "Connected - waiting for first sync")}
      </p>
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto text-left sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Review Gmail updates</DialogTitle>
            <DialogDescription>
              Every email is included by default. Exclude only the emails Trackline misunderstood, then import the rest.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {importReviews.map((review) => {
              const isExcluded = excludedIds.has(review.id);
              return (
                <article
                  key={review.id}
                  className={`rounded-xl border p-4 transition-colors ${isExcluded ? "border-destructive/30 bg-destructive/5 opacity-65" : "border-border/80 bg-card/60"}`}
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <p className="font-medium">{review.subject}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {review.sender} · {formatDate(review.receivedAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={isExcluded ? "outline" : "ghost"}
                      onClick={() => toggleExcluded(review.id)}
                    >
                      {isExcluded ? <RotateCcw className="size-4" /> : <Ban className="size-4" />}
                      {isExcluded ? "Include email" : "Exclude email"}
                    </Button>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{review.excerpt}</p>
                  <div className="mt-3 space-y-2">
                    {review.applications.map((application, index) => (
                      <div
                        key={`${application.company}-${application.role}-${index}`}
                        className="flex flex-col gap-2 rounded-lg bg-muted/30 p-3 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{application.role}</p>
                          <p className="text-xs text-muted-foreground">{application.company}</p>
                        </div>
                        <Badge variant="secondary">{application.detectedStatus}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">{application.confidence}%</span>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
          <DialogFooter className="gap-2 sm:items-center sm:justify-between">
            <p className="mr-auto text-xs text-muted-foreground">
              {excludedIds.size} excluded · {importReviews.length - excludedIds.size} ready to import
            </p>
            <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={savingReview}>
              Review later
            </Button>
            <Button onClick={() => void applyReview()} disabled={savingReview}>
              {savingReview ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {savingReview ? "Applying…" : "Confirm review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatRelative(value: string, now: number) {
  const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.round(minutes / 60);
  return hours < 24 ? hours + "h ago" : Math.round(hours / 24) + "d ago";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
