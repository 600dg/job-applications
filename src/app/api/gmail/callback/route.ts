import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { gmailConnections } from "@/db/schema";
import { encryptRefreshToken, googleOAuthConfig, verifyOAuthState } from "@/lib/gmail-connection";

type TokenResponse = { access_token?: string; refresh_token?: string; error?: string };
type ProfileResponse = { emailAddress?: string };

function home(request: Request, result: string) {
  return Response.redirect(new URL("/?gmail=" + encodeURIComponent(result), request.url));
}

export async function GET(request: Request) {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return Response.redirect(new URL("/sign-in", request.url));
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return home(request, "access-denied");
  if (!code || !state || !verifyOAuthState(state, userId)) return home(request, "invalid-state");
  const config = googleOAuthConfig();
  if (!config) return home(request, "configuration-required");

  const redirectUri = new URL("/api/gmail/callback", request.url).toString();
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    cache: "no-store",
  });
  const tokens = await tokenResponse.json() as TokenResponse;
  if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) return home(request, "token-error");

  const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: "Bearer " + tokens.access_token },
    cache: "no-store",
  });
  const profile = await profileResponse.json() as ProfileResponse;
  if (!profileResponse.ok || !profile.emailAddress) return home(request, "profile-error");

  const encrypted = encryptRefreshToken(tokens.refresh_token);
  await getDb().insert(gmailConnections).values({
    ownerId: userId,
    email: profile.emailAddress,
    refreshTokenCiphertext: encrypted.ciphertext,
    refreshTokenIv: encrypted.iv,
    refreshTokenTag: encrypted.tag,
    status: "active",
    lastError: "",
  }).onConflictDoUpdate({
    target: gmailConnections.ownerId,
    set: {
      email: profile.emailAddress,
      refreshTokenCiphertext: encrypted.ciphertext,
      refreshTokenIv: encrypted.iv,
      refreshTokenTag: encrypted.tag,
      status: "active",
      lastError: "",
      updatedAt: new Date(),
    },
  });

  return home(request, "connected");
}
