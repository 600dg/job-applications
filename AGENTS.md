<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Trackline project handoff

Trackline is a private Next.js 16 job-application dashboard deployed at `https://job-applications-red.vercel.app`. It uses Clerk, Neon Postgres with Drizzle, Vercel Blob, Tailwind CSS, and shadcn/ui.

Before changing Next.js code, follow the rule above and read the relevant installed Next.js documentation. Preserve owner scoping on every database read and mutation. Never expose OAuth client secrets, refresh tokens, Clerk secrets, cron secrets, database credentials, or Blob tokens to client components.

### Current Google/Gmail state

Right now Google auth is developer-managed/local configuration: a developer must create the Google Cloud OAuth client and add `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` to local/Vercel environment variables. Those two variables are currently missing. `GMAIL_TOKEN_ENCRYPTION_KEY` and `CRON_SECRET` are already configured in Vercel.

The secure app-side foundation already exists:

- `/api/gmail/connect` and `/api/gmail/callback` implement direct Google OAuth.
- Gmail access is limited to `gmail.readonly`.
- Refresh tokens are AES-256-GCM encrypted in `gmail_connections`.
- `/api/gmail/sync` provides manual sync and the dashboard checks every two hours while open.
- `/api/cron/gmail-sync` is protected by `CRON_SECRET` and runs daily on Vercel Hobby.
- High-confidence matches update application status in place; `email_suggestions` is the audit trail.

In the future, Google auth should become app-side as a user experience: Trackline should provide connect, connection-health, reconnect, and disconnect controls without requiring a developer to manage each user manually. Keep the client secret server-side. Production use also requires Google OAuth consent/verification work because Gmail read-only is a restricted scope.

### Important next work

1. Create/configure the Google Cloud OAuth client, add the production and local callback URLs, add the test Gmail user, and set the missing Google environment variables.
2. Validate the full flow with a real inbox and representative application emails.
3. Add app-managed reconnect/disconnect and token-revocation behavior.
4. Replace Clerk development keys with a production Clerk instance.
5. If true two-hour background Gmail polling is required, upgrade from Vercel Hobby or use an external scheduler; the current Vercel cron is daily.

Run `npm run lint`, `npm run build`, and proportionate browser verification before deploying. Database changes require `npm run db:generate`, inspection of the generated SQL, and `npm run db:migrate`.
