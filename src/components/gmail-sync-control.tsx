"use client";

import { useCallback, useEffect, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { CheckCircle2, Loader2, Mail, RefreshCw, Settings2, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Application } from "@/lib/applications";
import type { GmailConnectionStatus } from "@/lib/gmail-connection";

const TWO_HOURS = 2 * 60 * 60 * 1000;
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function GmailSyncControl({
  initialConnection,
  onApplicationsSynced,
}: {
  initialConnection: GmailConnectionStatus;
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

  const sync = useCallback(
    async (showFeedback: boolean) => {
      setSyncing(true);
      setSyncStage("Searching Gmail...");
      const stageTimers = [
        window.setTimeout(() => setSyncStage("Reading job emails..."), 900),
        window.setTimeout(() => setSyncStage("Verifying application emails with AI..."), 2500),
        window.setTimeout(() => setSyncStage("Updating dashboard..."), 5000),
      ];
      if (showFeedback) setMessage("");
      try {
        const response = await fetch("/api/gmail/sync", { method: "POST" });
        const data = (await response.json()) as {
          applications?: Application[];
          created?: number;
          updated?: number;
          reviewed?: number;
          pendingAiReview?: number;
          email?: string;
          error?: string;
        };
        if (!response.ok || !data.applications) throw new Error(data.error ?? "Gmail sync failed.");
        onApplicationsSynced(data.applications);
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
          if (data.created)
            results.push(`${data.created} ${data.created === 1 ? "application" : "applications"} imported`);
          if (data.updated) results.push(`${data.updated} status ${data.updated === 1 ? "update" : "updates"} applied`);
          if (data.reviewed) results.push(`${data.reviewed} candidate emails AI-verified`);
          if (data.pendingAiReview) results.push(`${data.pendingAiReview} queued for the next sync`);
          setMessage(results.length ? `${results.join("; ")}.` : "No verified applications or status updates found.");
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
    },
    [onApplicationsSynced],
  );

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
