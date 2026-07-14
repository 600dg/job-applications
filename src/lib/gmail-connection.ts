import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { gmailConnections } from "@/db/schema";
import { requireUserId } from "@/lib/auth";

export type GmailConnectionStatus = {
  configured: boolean;
  connected: boolean;
  email: string;
  lastSyncedAt: string | null;
  lastError: string;
};

function encryptionKey() {
  const encoded = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
  return key;
}

export function encryptRefreshToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function decryptRefreshToken(ciphertext: string, iv: string, tag: string) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function signOAuthState(ownerId: string) {
  const payload = Buffer.from(JSON.stringify({ ownerId, expiresAt: Date.now() + 10 * 60 * 1000, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  const signature = createHmac("sha256", encryptionKey()).update(payload).digest("base64url");
  return payload + "." + signature;
}

export function verifyOAuthState(state: string, ownerId: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", encryptionKey()).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { ownerId?: string; expiresAt?: number };
    return parsed.ownerId === ownerId && typeof parsed.expiresAt === "number" && parsed.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export function googleOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function gmailConfigurationReady() {
  if (!googleOAuthConfig()) return false;
  try {
    return encryptionKey().length === 32;
  } catch {
    return false;
  }
}

export async function getGmailConnection(): Promise<GmailConnectionStatus> {
  const ownerId = await requireUserId();
  const [connection] = await getDb().select().from(gmailConnections).where(eq(gmailConnections.ownerId, ownerId)).limit(1);
  const configured = gmailConfigurationReady();
  return connection
    ? { configured, connected: true, email: connection.email, lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null, lastError: connection.lastError }
    : { configured, connected: false, email: "", lastSyncedAt: null, lastError: "" };
}
