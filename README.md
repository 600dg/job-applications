# Trackline

A private job-application dashboard and job-fit workspace built with Next.js, TypeScript, Tailwind CSS, and shadcn/ui.

## Current foundation

- Clerk authentication protects the dashboard and server mutations.
- Neon Postgres stores owner-scoped applications through Drizzle ORM.
- Private Vercel Blob storage holds résumé PDFs; server-side extraction makes their text available to the matcher.
- Saved résumé versions include a transparent 100-point ATS-readiness report and primary-version selection.
- Direct, read-only Gmail OAuth checks application messages and applies high-confidence status updates to matching tracker records.
- New accounts receive sample applications once; later changes persist.
- The fit analyzer remains a transparent, local ruleset for now.

Gmail access uses a separate Google OAuth connection with the `gmail.readonly` scope. Refresh tokens are encrypted at rest, every detected change is recorded in an audit table, and the integration never sends, labels, or deletes email. High-confidence messages update the matching application automatically; lower-confidence matches are retained as ignored audit entries. The dashboard checks every two hours while it is open, offers a manual sync, and runs a daily Vercel Cron check on the Hobby plan. A true two-hour background schedule requires Vercel Pro or an external scheduler.

AI analysis, external ATS vendors, OCR, and job discovery are not connected yet. The current ATS-readiness score is an explainable in-app heuristic, not a guarantee of how an employer's ATS will score a document.

## Direct Gmail setup

### Current limitation and intended direction

Right now Google authorization is developer-managed: the Google Cloud OAuth client is created manually, its credentials are supplied through local/Vercel environment variables, and each intended Gmail account must be added as a Google OAuth test user. The application already owns the secure OAuth callback, encrypted token storage, and Gmail sync logic, but the overall setup is not yet an app-managed onboarding experience.

In a future version, Google authorization should be app-side from the user's perspective: users should connect, inspect connection health, reconnect, and disconnect Gmail entirely inside Trackline. The Google client secret must remain server-side; "app-side" does not mean exposing OAuth credentials in browser code. Production readiness also requires a production Google consent screen and any verification Google requires for the restricted Gmail scope.

1. Enable the Gmail API in a Google Cloud project.
2. Configure an OAuth consent screen and add the intended Gmail account as a test user while the app remains in testing.
3. Create a Web application OAuth client with `https://job-applications-red.vercel.app/api/gmail/callback` as an authorized redirect URI. For local testing, also add `http://localhost:3000/api/gmail/callback`.
4. Add `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GMAIL_TOKEN_ENCRYPTION_KEY`, and `CRON_SECRET` to the deployment environment.

The restricted Gmail scope may cause Google to show an unverified-app warning until the OAuth app completes Google's verification process. Keeping the app in testing and listing the account as a test user is sufficient for private development.

## Handoff status

- Production deployment: [job-applications-red.vercel.app](https://job-applications-red.vercel.app)
- Database migrations through `drizzle/0003_ambitious_punisher.sql` are applied.
- `GMAIL_TOKEN_ENCRYPTION_KEY` and `CRON_SECRET` are configured in Vercel.
- `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are not configured yet, so the dashboard intentionally displays **Google setup required**.
- Clerk currently uses development keys in production and emits a warning. Replace them with a Clerk production instance before treating the deployment as production-ready.
- Gmail checks run every two hours while the dashboard is open and daily through Vercel Cron. Vercel Hobby does not support a persistent two-hour cron schedule.
- Gmail auto-updates require a strong company match and at least 90% classifier confidence. All detected decisions are retained in `email_suggestions` as an audit trail.
- ATS and job-fit scoring are transparent local heuristics. No external ATS provider, OpenAI integration, Gmail write access, job discovery service, or OCR is enabled.

The recommended next step is to complete the Google Cloud OAuth setup, connect a real test inbox, and validate confirmation, assessment, interview, rejection, and offer messages against real application records. After that, add app-managed reconnect/disconnect controls and move the Google consent configuration toward production verification.

## Run locally

```bash
npm install
npx vercel link --yes --project job-applications --scope dhruvanshupawar-8629s-projects
npx vercel env pull .env.local --yes
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in. Environment files are ignored by Git; `.env.example` documents the required variable names.

## Useful commands

```bash
npm run lint
npm run build
npm run db:generate
npm run db:migrate
npm run db:studio
```

Production: [job-applications-red.vercel.app](https://job-applications-red.vercel.app)
