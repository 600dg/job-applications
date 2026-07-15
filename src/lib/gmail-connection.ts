import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { gmailConnections } from "@/db/schema";
import { requireUserId } from "@/lib/auth";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export type GmailConnectionStatus = {
  configured: boolean;
  connected: boolean;
  enabled: boolean;
  googleLinked: boolean;
  gmailScopeGranted: boolean;
  needsReconnect: boolean;
  email: string;
  lastSyncedAt: string | null;
  lastError: string;
};

export class GmailAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAuthorizationError";
  }
}

function includesGmailScope(scopes: Iterable<string>) {
  return Array.from(scopes).some((scope) => scope === GMAIL_READONLY_SCOPE);
}

export async function getClerkGoogleAuthorization(ownerId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(ownerId);
  const googleAccounts = user.externalAccounts.filter(
    (account) => account.provider === "google" || account.provider === "oauth_google",
  );

  let tokens: Awaited<ReturnType<typeof client.users.getUserOauthAccessToken>>["data"] = [];
  try {
    const response = await client.users.getUserOauthAccessToken(ownerId, "google");
    tokens = response.data;
  } catch {
    // A missing or stale provider connection should render as reconnectable UI,
    // rather than failing the entire dashboard request.
  }

  const approvedScopes = new Set(
    googleAccounts.flatMap((account) => account.approvedScopes.split(/[\s,]+/).filter(Boolean)),
  );
  const token =
    tokens.find((candidate) => includesGmailScope(candidate.scopes ?? [])) ??
    (includesGmailScope(approvedScopes) ? tokens[0] : undefined);
  const matchingAccount = token
    ? googleAccounts.find(
        (account) => account.id === token.externalAccountId || account.externalAccountId === token.externalAccountId,
      )
    : undefined;
  const account = matchingAccount ?? googleAccounts[0];

  return {
    accessToken: token?.token ?? null,
    email: account?.emailAddress ?? "",
    googleLinked: googleAccounts.length > 0,
    gmailScopeGranted: Boolean(token),
  };
}

export async function requireClerkGmailAccess(ownerId: string) {
  const authorization = await getClerkGoogleAuthorization(ownerId);
  if (!authorization.googleLinked) {
    throw new GmailAuthorizationError("Connect Google in Account settings, then try again.");
  }
  if (!authorization.accessToken) {
    throw new GmailAuthorizationError("Reconnect Google in Account settings and approve read-only Gmail access.");
  }
  return { accessToken: authorization.accessToken, email: authorization.email };
}

export async function getGmailConnection(): Promise<GmailConnectionStatus> {
  const ownerId = await requireUserId();
  const [connection, authorization] = await Promise.all([
    getDb()
      .select()
      .from(gmailConnections)
      .where(eq(gmailConnections.ownerId, ownerId))
      .limit(1)
      .then(([row]) => row),
    getClerkGoogleAuthorization(ownerId),
  ]);
  const enabled = connection?.status === "active";
  const connected = enabled && authorization.gmailScopeGranted;

  return {
    configured: Boolean(process.env.CLERK_SECRET_KEY),
    connected,
    enabled,
    googleLinked: authorization.googleLinked,
    gmailScopeGranted: authorization.gmailScopeGranted,
    needsReconnect: authorization.googleLinked && !authorization.gmailScopeGranted,
    email: connection?.email || authorization.email,
    lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null,
    lastError: connection?.lastError ?? "",
  };
}
