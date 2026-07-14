import { auth } from "@clerk/nextjs/server";
import { googleOAuthConfig, signOAuthState } from "@/lib/gmail-connection";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export async function GET(request: Request) {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return Response.redirect(new URL("/sign-in", request.url));
  const config = googleOAuthConfig();
  if (!config) return Response.redirect(new URL("/?gmail=configuration-required", request.url));

  const redirectUri = new URL("/api/gmail/callback", request.url).toString();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: signOAuthState(userId),
  });
  return Response.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + params);
}
