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
- High-confidence application confirmations create owner-scoped records when no matching company-and-role record exists. Later assessment, interview, rejection, and offer messages update the same record; `email_suggestions` is the audit trail.
- Gmail-created applications store an owner-scoped origin message ID so repeated syncs cannot create duplicates. Low-confidence and non-job messages are not imported.
- Application lists sort by `applications.updated_at`. Editor creates/edits derive it from the submitted `applied_date`, and quick status changes preserve it. For Gmail-created or Gmail-matched records, advance it to the newest matched email's `received_at`.
- Gmail retrieval searches up to one year of broad application, applicant-tracking-system, screening, assessment, decision, and offer language, paginating through at most 500 candidate messages before the local classifier filters them. Keep real-estate exclusions and high-confidence company-and-role matching intact when widening the query.
- One Gmail message may contain multiple applications for the same company. The parser supports repeated labelled roles, requisition IDs, and repeated application lines. `applications` deduplicates by owner/message/company/role, while `email_suggestions` audits each owner/message/application association. Do not restore one-message-to-one-application assumptions. Ambiguous follow-ups in a multi-application thread must not update every application unless roles are identifiable.
- Regex and sender rules only select candidate Gmail messages; they must never directly create or update applications. OpenAI structured verification is fail-closed and must return explicit company, role, status, confidence, and exact evidence. Accept only confidence >= 90 with evidence grounded in the message or one unambiguous existing thread application. Job alerts, recommendations, newsletters, keyword matches, and uncertain messages must produce an empty review.
- `gmail_message_reviews` caches owner-scoped structured decisions by Gmail message and analysis version without storing raw bodies. Review at most 30 uncached messages per sync. Increment `GMAIL_AI_ANALYSIS_VERSION` when verification semantics materially change so messages are safely re-reviewed.
- The dashboard provides connect/reconnect, health, manual sync, and local disconnect controls. Provider permission revocation remains available through Clerk/Google account settings so turning off sync does not accidentally remove the user's sign-in method.

The Clerk Google connection is configured with custom Google OAuth credentials and the personal account has approved `gmail.readonly`. For private development, the Google consent screen can remain in Testing with the personal Gmail account listed as a test user. Public production use requires Google OAuth consent/verification work because Gmail read-only is a restricted scope.

### Current OpenAI state

`OPENAI_API_KEY` is configured as a sensitive Vercel Production variable. Vercel cannot reveal that existing sensitive value through `vercel env pull`, and the current Development environment does not supply it, so a fresh machine must restore the original key manually in `.env.local` to exercise AI paths locally. `OPENAI_MODEL` is optional and defaults to `gpt-5-mini`. Keep both server-only.

- Readable résumé uploads run a structured AI ATS analysis and persist it in the existing `ats_analysis` JSONB field. The local analyzer is the upload fallback.
- `/api/fit-analysis` loads the selected owner-scoped résumé server-side and returns structured fit analysis for a pasted job description.
- `/api/resume-improvements` returns grounded general or job-tailored original-to-rewrite suggestions. It verifies that displayed original excerpts occur in the stored résumé and filters contact details.
- Generated improvement suggestions are intentionally ephemeral. Uploaded PDFs and extracted source text are never overwritten.
- Prompts must not invent credentials, metrics, tools, employers, responsibilities, or achievements. Missing evidence should become a follow-up question.
- Gmail sync also uses `OPENAI_API_KEY` to verify candidate application messages before database writes. If OpenAI is unavailable, sync fails closed rather than falling back to regex-created applications.

### Current job discovery state

- The **Find jobs** tab generates résumé-derived role searches, then searches configured Jooble and Adzuna APIs plus Eluta's documented OpenSearch interface. Do not replace these adapters with HTML scraping.
- Ranking compares explicit years-of-experience requirements with dated or explicitly stated résumé evidence. Hard minimums receive a stronger score penalty than preferred experience, while incomplete provider excerpts remain unknown.
- `/api/job-discovery` supports owner-scoped `profile` and `search` actions. Every selected résumé is validated with both `resume_id` and the current Clerk `owner_id`.
- Search fans out across at most four distinct role queries, normalizes provider records, deduplicates by company/title/location, and caps candidates before ranking.
- Jooble requires `JOOBLE_API_KEY`; Adzuna requires `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`. Keep all three server-only. Missing credentials disable only that provider.
- Provider cache misses are limited through `job_provider_usage`; `job_search_cooldowns` enforces an 8-second owner-scoped search cooldown. Identical provider requests use Vercel Runtime Cache for 15 minutes, with a local in-process fallback.
- Default Jooble and Adzuna budgets are 120/day, 750/week, and 2,000/month. Optional `JOOBLE_*_REQUEST_LIMIT` and `ADZUNA_*_REQUEST_LIMIT` variables may lower or deliberately adjust them. Keep Adzuna below the allowance granted to the account.
- Results are ranked against readable résumé text with structured OpenAI output when the server key is available and an explainable local fallback otherwise. Résumé search suggestions have the same fallback behavior.
- Provider excerpts and rankings are temporary. The route does not persist listing content, and every result links back to its source for full review.
- Scores are preliminary because the feed may contain only an excerpt. Keep that limitation visible if the ranking UI changes.
- Review each provider's current terms before extending the integration. Do not scrape result pages or add scheduled copying without authorization.

### Important next work

1. Run the importer against the real inbox and review any genuine application formats that remain unmatched.
2. Replace Clerk development keys with a production Clerk instance if the private app becomes public.
3. If true two-hour background Gmail polling is required, upgrade from Vercel Hobby or use an external scheduler; the current Vercel cron is daily.
4. Configure Jooble and Adzuna keys in Development and Production, then validate provider coverage and ranking quality with real searches. For saved jobs or alerts, confirm each provider's storage and redistribution terms before persisting listing content.
5. If editable AI résumé drafts are added, version them separately from uploaded source PDFs and require user review before export.

Run `npm run lint`, `npm run build`, and proportionate browser verification before deploying. Database changes require `npm run db:generate`, inspection of the generated SQL, and `npm run db:migrate`.

Run `npm run check` for the combined ESLint and TypeScript gate. Husky runs `lint-staged` on pre-commit; keep it scoped to staged files rather than formatting unrelated legacy or skill files.
