<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Trackline project handoff

Trackline is a private Next.js 16 job-application dashboard deployed at `https://job-applications-red.vercel.app`. It uses Clerk, Neon Postgres with Drizzle, Vercel Blob, Tailwind CSS, and shadcn/ui.

Before changing Next.js code, follow the rule above and read the relevant installed Next.js documentation. Preserve owner scoping on every database read and mutation. Never expose OAuth client secrets, refresh tokens, Clerk secrets, cron secrets, database credentials, or Blob tokens to client components.

### Current Google/Gmail state

Google and Gmail authorization now use the Google social connection attached to each Clerk user. The Google OAuth client ID and secret belong only in Clerk's **SSO connections > Google** custom-credentials settings; they are not Trackline environment variables. `CRON_SECRET` remains configured in Vercel.

The secure app-side foundation already exists:

- Clerk's `additionalOAuthScopes` user-profile flow requests `gmail.readonly`.
- The server retrieves refreshed Google access tokens with Clerk's `getUserOauthAccessToken`; Trackline does not store provider refresh tokens.
- Gmail access is limited to `gmail.readonly`.
- `gmail_connections` stores only owner-scoped sync opt-in, health, and timestamps.
- `/api/gmail/sync` provides manual sync and the dashboard checks every two hours while open.
- `/api/cron/gmail-sync` is protected by `CRON_SECRET` and runs daily on Vercel Hobby.
- High-confidence application confirmations and later status messages are staged in `gmail_import_reviews`; scanning never writes applications. The dashboard includes every staged email by default, lets the user exclude mistakes, and only creates or updates applications after confirmation. `email_suggestions` is the post-confirmation audit trail.
- Gmail-created applications store an owner-scoped origin message ID so repeated syncs cannot create duplicates. Low-confidence and non-job messages are not imported.
- Application lists sort by `applications.updated_at`. Editor creates/edits derive it from the submitted `applied_date`, and quick status changes preserve it. For Gmail-created or Gmail-matched records, advance it to the newest matched email's `received_at`.
- Application previews open from the company-and-role cell and show existing tracker metadata plus optional `salary`, `job_url`, and `job_description`. Missing details prompt the user to edit the record; never fabricate them. Keep these fields owner-scoped through the existing application actions.
- Gmail retrieval searches up to one year of broad application, applicant-tracking-system, screening, assessment, decision, and offer language, paginating through at most 500 candidate messages before the local classifier filters them. Keep real-estate exclusions and high-confidence company-and-role matching intact when widening the query.
- One Gmail message may contain multiple applications for the same company. The parser supports repeated labelled roles, requisition IDs, and repeated application lines. `applications` deduplicates by owner/message/company/role, while `email_suggestions` audits each owner/message/application association. Do not restore one-message-to-one-application assumptions. Ambiguous follow-ups in a multi-application thread must not update every application unless roles are identifiable.
- Regex and sender rules only select candidate Gmail messages; they must never directly create or update applications. OpenAI structured verification is fail-closed and must return explicit company, role, status, confidence, and exact evidence. Accept only confidence >= 90 with evidence grounded in the message or one unambiguous existing thread application. Job alerts, recommendations, newsletters, keyword matches, and uncertain messages must produce an empty review.
- `gmail_message_reviews` caches owner-scoped structured decisions by Gmail message and analysis version without storing raw bodies. Review at most 30 uncached messages per sync. Increment `GMAIL_AI_ANALYSIS_VERSION` when verification semantics materially change so messages are safely re-reviewed.
- `gmail_import_reviews` is the owner-scoped approval queue. Preserve message-level grouping so one reviewed email can import multiple distinct applications. Exclusions and confirmations must validate every review ID against the current owner and pending state.
- The dashboard provides connect/reconnect, health, manual sync, and local disconnect controls. Provider permission revocation remains available through Clerk/Google account settings so turning off sync does not accidentally remove the user's sign-in method.

The Clerk Google connection is configured with custom Google OAuth credentials and the personal account has approved `gmail.readonly`. For private development, the Google consent screen can remain in Testing with the personal Gmail account listed as a test user. Public production use requires Google OAuth consent/verification work because Gmail read-only is a restricted scope.

### Current OpenAI state

`OPENAI_API_KEY` is configured as a sensitive Vercel Production variable. Vercel cannot reveal that existing sensitive value through `vercel env pull`, and the current Development environment does not supply it, so a fresh machine must restore the original key manually in `.env.local` to exercise AI paths locally. `OPENAI_MODEL` is optional and defaults to `gpt-5-mini`. Keep both server-only.

- Readable résumé uploads extract and store text but do not run or display a general ATS score. Legacy `ats_analysis` fields remain for schema compatibility.
- `/api/fit-analysis` loads the selected owner-scoped résumé server-side, blends a job-specific offline comparison with structured AI analysis, and returns grounded job-tailored rewrites in the same response.
- `/api/job-description` accepts authenticated public HTTP(S) URLs, blocks private-network destinations, limits redirects, response size, and duration, and extracts readable text. Access-controlled or client-rendered pages fall back to pasted descriptions; do not add scraping bypasses.
- Generated job-tailored improvement suggestions are intentionally ephemeral. Displayed original excerpts must occur in the stored résumé, contact details are filtered, and uploaded PDFs and extracted source text are never overwritten.
- Prompts must not invent credentials, metrics, tools, employers, responsibilities, or achievements. Missing evidence should become a follow-up question.
- Gmail sync also uses `OPENAI_API_KEY` to verify candidate application messages before they can enter the approval queue. If OpenAI is unavailable, sync fails closed rather than falling back to regex-created applications.

### Current job discovery state

The **Find jobs** tab, route, provider adapters, and credentials were removed because result quality was not reliable enough. Trackline now evaluates jobs the user finds elsewhere through pasted descriptions or best-effort public URL import. LinkedIn and Indeed do not provide generally available job-search APIs for this use case. Do not reintroduce scraping or provider integrations without reviewing official access and storage terms.

### Important next work

1. Run the importer against the real inbox and review any genuine application formats that remain unmatched.
2. Replace Clerk development keys with a production Clerk instance if the private app becomes public.
3. If true two-hour background Gmail polling is required, upgrade from Vercel Hobby or use an external scheduler; the current Vercel cron is daily.
4. Validate public job-URL extraction against employer career sites while preserving SSRF protections and pasted-text fallback.
5. If editable AI résumé drafts are added, version them separately from uploaded source PDFs and require user review before export.

Run `npm run lint`, `npm run build`, and proportionate browser verification before deploying. Database changes require `npm run db:generate`, inspection of the generated SQL, and `npm run db:migrate`.

Run `npm run check` for the combined ESLint and TypeScript gate. Husky runs `lint-staged` on pre-commit; keep it scoped to staged files rather than formatting unrelated legacy or skill files.
