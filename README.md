# Trackline

A private job-application dashboard and job-fit workspace built with Next.js, TypeScript, Tailwind CSS, and shadcn/ui.

## Current foundation

- Clerk authentication protects the dashboard and server mutations.
- Neon Postgres stores owner-scoped applications through Drizzle ORM.
- Private Vercel Blob storage holds résumé PDFs; server-side extraction makes their text available to the matcher.
- Saved résumé versions are parsed privately and can be selected as the primary version; uploads are not assigned a general ATS score.
- Clerk-managed, read-only Gmail access stages high-confidence application confirmations and status updates for user review before any tracker changes.
- Applications are ordered by their latest update. Manual editor saves use the **Applied on** date as their initial update date; the newest later matched Gmail email supplies the timestamp after that.
- New accounts receive sample applications once; later changes persist.
- The streamlined fit analyzer accepts pasted job text or attempts to import a public job URL, then combines an offline comparison with OpenAI structured analysis.
- Each job-specific analysis includes grounded original-to-rewrite suggestions without modifying the uploaded PDF.
- The former **Find jobs** workspace and provider integrations have been removed because their result quality was not reliable enough.

Gmail access uses the Google connection attached to the user's Clerk account with the `gmail.readonly` scope. Clerk owns the provider tokens; Trackline stores only an owner-scoped sync preference, connection health, structured review records, imported application records, and audit history. The integration never sends, labels, or deletes email. It searches up to one year of application-related mail across multiple Gmail result pages, including common applicant-tracking senders and broader confirmation, screening, assessment, decision, and offer wording, while explicitly excluding known real-estate offer noise. Candidate messages are verified with OpenAI structured output; job alerts, recommendations, keyword matches, newsletters, and uncertain messages must return no applications. Accepted suggestions require at least 90% model confidence plus exact supporting evidence grounded in the email. A verified message can contain multiple distinct roles or requisitions. The dashboard presents every verified email as included by default, and the user excludes mistakes before confirming the remainder. No application or status is changed during the scan itself. Reviews are cached by owner and Gmail message without storing raw email bodies, and each sync reviews at most 30 new candidate messages to bound cost and runtime. The dashboard checks every two hours while it is open, offers a manual sync, and runs a daily Vercel Cron check on the Hobby plan. A true two-hour background schedule requires Vercel Pro or an external scheduler.

AI analysis uses the server-only `OPENAI_API_KEY` and defaults to `gpt-5-mini` unless `OPENAI_MODEL` is set. Résumé text, job descriptions, and candidate Gmail message excerpts are sent to OpenAI only for the relevant user-requested analysis or enabled Gmail sync; keys and stored résumé text are never exposed to client components. Job-specific scores remain directional and are not guarantees of how an employer's ATS will evaluate a document. External ATS vendors, OCR, web search, and automatic document rewriting/export are not connected.

## AI setup and behavior

Add `OPENAI_API_KEY` to `.env.local` for local development and as a sensitive Production environment variable in Vercel. `OPENAI_MODEL` is optional.

- Readable PDF uploads extract and save text but do not create a general résumé score.
- **Analyze and tailor** produces a job-specific fit score, matches, gaps, keywords, recommendations, and verified before-and-after rewrites in one request.
- The final score blends a deterministic offline job comparison with a more contextual AI assessment so truthful adjacent experience receives credit.
- Public HTTP or HTTPS job URLs can be imported when the page exposes readable server-rendered text. Blocked or sign-in-only pages require pasted text.
- Improvement prompts forbid invented credentials, responsibilities, achievements, and metrics. Suggestions requiring missing evidence are returned as follow-up questions.

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
- Database migrations through `drizzle/0009_amazing_havok.sql` are applied.
- `CRON_SECRET` is configured in Vercel. Google OAuth credentials are configured only in Clerk.
- Clerk currently uses development keys for this private deployment. That is acceptable for personal use; switch to a production Clerk instance before treating the app as public production.
- The Clerk Google connection is configured and the personal inbox can sync with `gmail.readonly`.
- Gmail checks run every two hours while the dashboard is open and daily through Vercel Cron. Vercel Hobby does not support a persistent two-hour cron schedule.
- Gmail suggestions require extracted company and role data with at least 90% confidence, remain pending until reviewed, and are deduplicated per owner. Confirmed decisions are retained in `email_suggestions` as an audit trail.
- OpenAI powers job-specific fit analysis, grounded résumé improvements, and Gmail candidate verification through owner-scoped server routes. Local fit heuristics remain the analysis fallback.
- No external ATS provider, Gmail write access, HTML job-board scraping, OCR, editable résumé draft storage, or document export is enabled.

Recommended next work is to exercise the Gmail review queue against real inbox formats and validate public job-URL extraction across several employer career sites. Do not bypass access controls or scrape job-board search pages.

## Run locally

```bash
npm install
npx vercel link --yes --project job-applications --scope dhruvanshupawar-8629s-projects
npx vercel env pull .env.local --environment=development --yes
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in. Environment files are ignored by Git; `.env.example` documents the required variable names. Vercel does not reveal an existing sensitive Production value when pulling environments. If `OPENAI_API_KEY` is not separately configured for Development, restore the original key manually in `.env.local`; local fit analysis otherwise uses its offline fallback and Gmail verification fails closed.

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
