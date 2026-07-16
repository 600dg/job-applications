# Trackline

A private job-application dashboard and job-fit workspace built with Next.js, TypeScript, Tailwind CSS, and shadcn/ui.

## Current foundation

- Clerk authentication protects the dashboard and server mutations.
- Neon Postgres stores owner-scoped applications through Drizzle ORM.
- Private Vercel Blob storage holds résumé PDFs; server-side extraction makes their text available to the matcher.
- Saved résumé versions receive an AI-assisted 100-point ATS-readiness report on upload, with a local fallback and primary-version selection.
- Clerk-managed, read-only Gmail access imports high-confidence application confirmations and applies later status updates to the same tracker records.
- Applications are ordered by their latest update. Manual editor saves use the **Applied on** date as their initial update date; the newest later matched Gmail email supplies the timestamp after that.
- New accounts receive sample applications once; later changes persist.
- The fit analyzer compares an owner-scoped saved résumé with a pasted job description through OpenAI structured output, with an immediate local fallback.
- General and job-tailored résumé improvement dialogs provide grounded original-to-rewrite suggestions without modifying the uploaded PDF.
- The **Find jobs** workspace generates résumé-based role searches, combines configured Jooble and Adzuna results with Eluta, deduplicates them, and ranks temporary results against an owner-scoped saved résumé.

Gmail access uses the Google connection attached to the user's Clerk account with the `gmail.readonly` scope. Clerk owns the provider tokens; Trackline stores only an owner-scoped sync preference, connection health, imported application records, and audit history. The integration never sends, labels, or deletes email. It searches up to one year of application-related mail across multiple Gmail result pages, while explicitly excluding known real-estate offer noise. A high-confidence confirmation creates an application when no matching record exists, and later assessment, interview, rejection, or offer messages update that record. Lower-confidence messages are ignored rather than added to the dashboard. The dashboard checks every two hours while it is open, offers a manual sync, and runs a daily Vercel Cron check on the Hobby plan. A true two-hour background schedule requires Vercel Pro or an external scheduler.

AI analysis uses the server-only `OPENAI_API_KEY` and defaults to `gpt-5-mini` unless `OPENAI_MODEL` is set. Résumé text, pasted job descriptions, and requested Eluta result excerpts are sent to OpenAI only for the relevant user-requested analysis; keys and stored résumé text are never exposed to client components. The reports and discovery scores remain directional and are not guarantees of how an employer's ATS will evaluate a document. External ATS vendors, OCR, and automatic document rewriting/export are not connected.

## AI setup and behavior

Add `OPENAI_API_KEY` to `.env.local` for local development and as a sensitive Production environment variable in Vercel. `OPENAI_MODEL` is optional.

- Readable PDF uploads automatically run the AI ATS review. If OpenAI is unavailable, the upload succeeds with the local explainable fallback.
- **Generate improvements** shows verified original excerpts beside suggested rewrites and copy controls. It never changes the source PDF.
- **Analyze fit** produces a structured fit score, matches, gaps, keywords, and recommendations for the selected résumé and pasted job description.
- **Generate tailored edits** uses the same selected résumé and posting to propose truthful job-specific revisions.
- Improvement prompts forbid invented credentials, responsibilities, achievements, and metrics. Suggestions requiring missing evidence are returned as follow-up questions.

## Multi-source job discovery

The **Find jobs** tab can create 6–8 broad job-title suggestions from a readable résumé, with a local evidence-based fallback when OpenAI is unavailable. Up to four selected titles are searched in parallel so a single restrictive keyword string does not hide adjacent roles.

Jooble and Adzuna are optional credentialed providers; Eluta's documented OpenSearch interface remains the credential-free Canadian source. Results are normalized, deduplicated by company/title/location, capped before ranking, and returned with provider health details. Jooble and Adzuna support additional pages through **Load more**.

Discovery results are intentionally ephemeral: Trackline does not write provider listing content to the database. Scores based on provider excerpts are preliminary, so the full posting should be reviewed before applying. Ranking treats explicitly required years of experience as a material constraint, treats preferred experience more softly, and labels unclear excerpts instead of assuming a mismatch. If OpenAI is unavailable, the route returns an explainable local ranking instead of failing the search.

Add any optional providers to `.env.local` and Vercel:

```bash
JOOBLE_API_KEY=
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
```

### Provider safeguards

Trackline protects provider quotas at the server:

- Identical provider searches are cached for 15 minutes in Vercel Runtime Cache, with an in-process fallback locally.
- Each user must wait 8 seconds between new provider searches.
- Only cache misses consume provider budgets.
- Atomic Neon counters enforce conservative default limits for both Jooble and Adzuna: 120 requests per day, 750 per week, and 2,000 per month.
- When one provider reaches a budget, cached results and the other providers continue working.
- Provider cards show cached-search usage and the tightest remaining request budget.

These defaults can be lowered through `JOOBLE_*_REQUEST_LIMIT` and `ADZUNA_*_REQUEST_LIMIT` variables documented in `.env.example`. Do not raise Adzuna above its current account allowance without written approval.

## Gmail setup through Clerk

Trackline requests Gmail access through Clerk's Google social connection. The Google client secret belongs in Clerk, never in Trackline environment variables or client code.

1. In Google Cloud, enable the Gmail API for the OAuth project.
2. Configure the Google OAuth consent screen as **External** and **Testing**, add `https://www.googleapis.com/auth/gmail.readonly`, and add the intended Gmail account as a test user.
3. In Clerk Dashboard, open **SSO connections > Google**, enable **Use custom credentials**, and copy Clerk's **Authorized Redirect URI**.
4. In Google Cloud, create a **Web application** OAuth client. Add `https://job-applications-red.vercel.app` and `http://localhost:3000` as authorized JavaScript origins, and use the redirect URI copied from Clerk as the authorized redirect URI.
5. Paste the Google client ID and client secret into the Clerk Google connection. Do not add them to `.env.local` or Vercel.
6. Open Trackline, choose **Connect Gmail** or **Reconnect Gmail**, approve read-only access in Clerk's Connected accounts screen, then choose **Check & sync**.

The Gmail button can turn Trackline's scheduled syncing on or off without removing Google as a sign-in method. Provider permissions can be removed from Clerk's account settings or the Google Account permissions page. `gmail.readonly` is a restricted scope; keeping the Google app in Testing and listing the personal account as a test user is appropriate for private development, while public production use requires Google's verification process.

## Handoff status

- Production deployment: [job-applications-red.vercel.app](https://job-applications-red.vercel.app)
- Database migrations through `drizzle/0006_happy_mandroid.sql` are applied.
- `CRON_SECRET` is configured in Vercel. Google OAuth credentials are configured only in Clerk.
- Clerk currently uses development keys for this private deployment. That is acceptable for personal use; switch to a production Clerk instance before treating the app as public production.
- The Clerk Google connection is configured and the personal inbox can sync with `gmail.readonly`.
- Gmail checks run every two hours while the dashboard is open and daily through Vercel Cron. Vercel Hobby does not support a persistent two-hour cron schedule.
- Gmail imports and updates require extracted company and role data with at least 90% confidence. Imported messages are deduplicated per owner, and detected decisions are retained in `email_suggestions` as an audit trail.
- OpenAI powers automatic ATS analysis, job-fit analysis, grounded résumé improvements, résumé search-profile generation, and preliminary multi-provider result ranking through owner-scoped server routes. Local heuristics remain fallbacks.
- Job discovery supports Jooble and Adzuna when their server-only credentials are configured, plus Eluta's official OpenSearch feed without credentials. It does not persist listing content.
- No external ATS provider, Gmail write access, HTML job-board scraping, OCR, editable résumé draft storage, or document export is enabled.

Recommended next work is to configure Jooble and Adzuna in Development and Production, validate result and ranking quality against real searches, and add user-controlled salary, remote, and distance filters. Evaluate provider terms before adding saved-job content or scheduled alerts, and do not scrape source pages.

## Run locally

```bash
npm install
npx vercel link --yes --project job-applications --scope dhruvanshupawar-8629s-projects
npx vercel env pull .env.local --environment=development --yes
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in. Environment files are ignored by Git; `.env.example` documents the required variable names. Vercel does not reveal an existing sensitive Production value when pulling environments. If `OPENAI_API_KEY` is not separately configured for Development, restore the original key manually in `.env.local`; local analysis and discovery otherwise use their built-in fallbacks.

## Useful commands

```bash
npm run lint
npm run lint:fix
npm run typecheck
npm run format
npm run check
npm run build
npm run db:generate
npm run db:migrate
npm run db:studio
```

Husky runs `lint-staged` before each commit. Staged TypeScript/JavaScript files are fixed with ESLint and formatted with Prettier; staged CSS, JSON, Markdown, and YAML files are formatted with Prettier. The hook leaves unstaged files alone.

Production: [job-applications-red.vercel.app](https://job-applications-red.vercel.app)
