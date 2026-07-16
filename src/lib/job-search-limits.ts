import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { jobProviderUsage, jobSearchCooldowns } from "@/db/schema";
import type { JobSource } from "@/lib/job-discovery";

const SEARCH_COOLDOWN_SECONDS = 8;

type PeriodKind = "day" | "week" | "month";
type ProviderLimits = Record<PeriodKind, number>;

const DEFAULT_LIMITS: Record<Exclude<JobSource, "eluta">, ProviderLimits> = {
  adzuna: { day: 120, week: 750, month: 2_000 },
  jooble: { day: 120, week: 750, month: 2_000 },
};

export class JobSearchLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobSearchLimitError";
  }
}

export async function enforceSearchCooldown(ownerId: string) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - SEARCH_COOLDOWN_SECONDS * 1000);
  const [accepted] = await getDb()
    .insert(jobSearchCooldowns)
    .values({ ownerId, lastSearchedAt: now })
    .onConflictDoUpdate({
      target: jobSearchCooldowns.ownerId,
      set: { lastSearchedAt: now },
      setWhere: sql`${jobSearchCooldowns.lastSearchedAt} <= ${cutoff}`,
    })
    .returning({ ownerId: jobSearchCooldowns.ownerId });

  if (!accepted) {
    throw new JobSearchLimitError(`Please wait ${SEARCH_COOLDOWN_SECONDS} seconds between new job searches.`);
  }
}

export async function reserveProviderRequests(source: JobSource, amount: number) {
  if (source === "eluta" || amount <= 0) return null;
  const limits = providerLimits(source);
  const periods = periodStarts(new Date());
  const reservations: Array<{ kind: PeriodKind; start: string; count: number; limit: number }> = [];

  for (const kind of ["day", "week", "month"] as const) {
    const periodStart = periods[kind];
    const limit = limits[kind];
    const [reserved] = await getDb()
      .insert(jobProviderUsage)
      .values({ provider: source, periodKind: kind, periodStart, requestCount: amount })
      .onConflictDoUpdate({
        target: [jobProviderUsage.provider, jobProviderUsage.periodKind, jobProviderUsage.periodStart],
        set: {
          requestCount: sql`${jobProviderUsage.requestCount} + ${amount}`,
          updatedAt: new Date(),
        },
        setWhere: sql`${jobProviderUsage.requestCount} + ${amount} <= ${limit}`,
      })
      .returning({ requestCount: jobProviderUsage.requestCount });

    if (!reserved) {
      const [current] = await getDb()
        .select({ requestCount: jobProviderUsage.requestCount })
        .from(jobProviderUsage)
        .where(
          and(
            eq(jobProviderUsage.provider, source),
            eq(jobProviderUsage.periodKind, kind),
            eq(jobProviderUsage.periodStart, periodStart),
          ),
        )
        .limit(1);
      throw new JobSearchLimitError(
        `${providerName(source)} ${kind} request budget reached (${current?.requestCount ?? 0}/${limit}). Cached results and other providers remain available.`,
      );
    }
    reservations.push({ kind, start: periodStart, count: reserved.requestCount, limit });
  }

  const tightest = reservations
    .map((reservation) => ({
      ...reservation,
      remaining: Math.max(0, reservation.limit - reservation.count),
    }))
    .sort((left, right) => left.remaining - right.remaining)[0];
  return tightest ? { remaining: tightest.remaining, period: tightest.kind } : null;
}

function providerLimits(source: Exclude<JobSource, "eluta">): ProviderLimits {
  const defaults = DEFAULT_LIMITS[source];
  const prefix = source.toUpperCase();
  return {
    day: positiveInteger(process.env[`${prefix}_DAILY_REQUEST_LIMIT`], defaults.day),
    week: positiveInteger(process.env[`${prefix}_WEEKLY_REQUEST_LIMIT`], defaults.week),
    month: positiveInteger(process.env[`${prefix}_MONTHLY_REQUEST_LIMIT`], defaults.month),
  };
}

function periodStarts(now: Date): Record<PeriodKind, string> {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const week = new Date(day);
  const weekday = (day.getUTCDay() + 6) % 7;
  week.setUTCDate(day.getUTCDate() - weekday);
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    day: formatDate(day),
    week: formatDate(week),
    month: formatDate(month),
  };
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function providerName(source: JobSource) {
  return source === "adzuna" ? "Adzuna" : source === "jooble" ? "Jooble" : "Eluta";
}
