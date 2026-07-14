"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Mail, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Application } from "@/lib/applications";
import type { GmailConnectionStatus } from "@/lib/gmail-connection";

const TWO_HOURS = 2 * 60 * 60 * 1000;

export function GmailSyncControl({ initialConnection, onApplicationsSynced }: { initialConnection: GmailConnectionStatus; onApplicationsSynced: (applications: Application[]) => void }) {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(initialConnection.lastSyncedAt);
  const [message, setMessage] = useState(initialConnection.lastError);

  const sync = useCallback(async (showFeedback: boolean) => {
    if (!initialConnection.connected) return;
    setSyncing(true);
    if (showFeedback) setMessage("");
    try {
      const response = await fetch("/api/gmail/sync", { method: "POST" });
      const data = await response.json() as { applications?: Application[]; updated?: number; error?: string };
      if (!response.ok || !data.applications) throw new Error(data.error ?? "Gmail sync failed.");
      onApplicationsSynced(data.applications);
      setLastSyncedAt(new Date().toISOString());
      if (showFeedback) setMessage(data.updated ? `${data.updated} application ${data.updated === 1 ? "was" : "were"} updated.` : "No new application updates found.");
    } catch (syncError) {
      setMessage(syncError instanceof Error ? syncError.message : "Gmail sync failed.");
    } finally {
      setSyncing(false);
    }
  }, [initialConnection.connected, onApplicationsSynced]);

  useEffect(() => {
    if (!initialConnection.connected) return;
    const timer = window.setInterval(() => { void sync(false); }, TWO_HOURS);
    return () => window.clearInterval(timer);
  }, [initialConnection.connected, sync]);

  if (!initialConnection.connected) {
    if (!initialConnection.configured) {
      return <div className="text-left sm:text-right"><Button size="sm" disabled><Mail className="size-4" />Google setup required</Button><p className="mt-1.5 text-xs text-muted-foreground">Add the Google OAuth credentials to connect</p></div>;
    }
    return <div className="text-left sm:text-right"><Button asChild size="sm"><a href="/api/gmail/connect"><Mail className="size-4" />Connect Gmail directly</a></Button><p className="mt-1.5 text-xs text-muted-foreground">Read-only application updates</p></div>;
  }

  return <div className="space-y-1.5 text-left sm:text-right"><div className="flex flex-wrap items-center gap-2 sm:justify-end"><Badge variant="outline" className="text-emerald-300"><CheckCircle2 className="size-3.5" />{initialConnection.email}</Badge><Button size="sm" variant="outline" onClick={() => void sync(true)} disabled={syncing}>{syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{syncing ? "Syncing…" : "Sync now"}</Button></div><p aria-live="polite" className="text-xs text-muted-foreground">{message || (lastSyncedAt ? "Last checked " + formatRelative(lastSyncedAt) : "Connected · waiting for first sync")}</p></div>;
}

function formatRelative(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.round(minutes / 60);
  return hours < 24 ? hours + "h ago" : Math.round(hours / 24) + "d ago";
}
