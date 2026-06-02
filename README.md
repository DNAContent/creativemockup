# Ad Mockups — Agency tool (Next.js 16)

Multi-client ad-mockup review tool. Next.js 16 (App Router, Turbopack) + Supabase
(DB / auth / RLS / RPCs) + Tailwind v4. Hosted on Netlify.

Agencies build sets of creatives (ads + organic posts + emails) and share a
review link with their clients. Clients sign in with a magic link and — based on
their permission tier — view, comment on, approve, or edit the creatives.

## Stack & layout

```
web/
  db/                       SQL — run in the Supabase SQL editor, in order
    schema.sql
    functions.sql
    rls.sql
    04_team_client_access.sql
    05_drop_legacy_token_model.sql
    06_notifications.sql
  src/
    proxy.ts                Next 16 proxy (was middleware): session refresh + route gating
    lib/
      supabase/server.ts    server client (Server Components / Actions, cookie auth)
      supabase/client.ts    browser client
      supabase/proxy.ts     updateSession() helper used by proxy.ts
      drive.ts              Google Drive share URL -> direct image URL
      types.ts              row + payload types
    app/
      login/                staff email/password auth (server actions)
      onboarding/           create agency (create_agency RPC)
      page.tsx              agency dashboard: clients + sets (server actions)
      settings/team/        manage teammates, client contacts, access requests
      editor/[setId]/       creative editor: add/reorder/edit, resolve feedback
      c/[clientSlug]/[setSlug]/   public client review portal (magic-link gated)
      auth/callback/        magic-link / OTP landing -> session
      auth/auth-error/      failed/expired link page
      actions.ts            dashboard server actions (clients, sets, agency)
    components/CopyLink.tsx client component for the review link
```

## Setup

### 1. Database

In the Supabase dashboard → SQL Editor, run in order (all idempotent):

1. `db/schema.sql`
2. `db/functions.sql`
3. `db/rls.sql`
4. `db/04_team_client_access.sql`
5. `db/05_drop_legacy_token_model.sql`
6. `db/06_notifications.sql`

### 2. Environment

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase → Project Settings → API → Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same page → anon public key
- `NEXT_PUBLIC_SITE_URL` — public origin of the deployed app (used to build
  magic-link redirects). Falls back to the request host if unset.
- `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, secret. Used by the notify
  webhook to resolve recipients. Never expose to the browser.
- `NOTIFY_HOOK_SECRET` — shared secret guarding `/api/hooks/notify`; must match
  `notify_config.secret` in the DB.

(The `NEXT_PUBLIC_*` Supabase values are public by design; RLS + role-tier
policies protect the data. The service-role key is the only secret.)

### 3. Run

```bash
npm run dev      # http://localhost:3000
```

First run: sign up → create your agency → add a client → add a set → **Open
editor** to build creatives, then **Copy review link** (`/c/<client>/<set>`) to
share with the client. Add the client's email under **Team & access** so the
magic-link gate lets them in.

> If Supabase email confirmation is on, confirm the staff address before first
> sign-in, or disable it for dev (Auth → Providers → Email). Magic links for
> clients use the same email provider — make sure SMTP is configured for prod.

## Auth & security model

- **Agency staff** use Supabase Auth (email/password). `src/proxy.ts` refreshes
  the session and redirects unauthenticated users to `/login` (except public
  routes `/login`, `/c`, `/auth`). RLS scopes every row to an agency the user
  belongs to via `agency_members`.
- **Clients** sign in with a **magic link**, never a password. Access is an
  *allowlist*, not URL secrecy: an email must be listed in `client_contacts`
  for the client. The `/c/<client>/<set>` gate calls `request_access()` — if the
  email is allowlisted it sends a magic link; otherwise it records an
  `access_requests` row for staff to triage under **Team & access**.
- **Permission tiers** (`client_contacts.role`, ascending): `viewer` <
  `commenter` < `approver` < `editor`. Enforced directly by RLS / RPCs in
  `04_team_client_access.sql` — there is no anon table access and no
  service-role key in the app.
- **Realtime**: `ads`/`comments`/`replies` are published. Logged-in clients and
  staff receive live rows for sets they can see (RLS applies to the subscription).

## Notifications

Client portal writes go straight to Postgres (RLS-authorized), bypassing Next
server code, so notifications fire from **database triggers** (`db/06_notifications.sql`)
via `pg_net`: each relevant write POSTs a JSON event to `/api/hooks/notify`,
which fans out to Slack and email.

- **Slack** (internal, per agency) — one incoming-webhook channel. Configure
  under **Team & access → Notifications**.
- **Email** — per-teammate opt-ins for internal events; client contacts for the
  "needs review" nudge. The provider is **not wired yet**: `src/lib/notify/email.ts`
  is a logging stub — implement its `sendEmail()` (e.g. Resend/SMTP) to switch on.
- Events: client comment, access request, client approval (all → team) and
  set → "needs review" (→ client).

After running `06_notifications.sql`, point the DB at the app:

```sql
update public.notify_config
  set endpoint_url = 'https://YOUR-APP/api/hooks/notify',
      secret       = 'SAME-VALUE-AS-NOTIFY_HOOK_SECRET';
```

## Deploy (Netlify)

`netlify.toml` is included. In the Netlify UI set **Base directory** to
`mockup/web` (the app is in a subfolder), add the `NEXT_PUBLIC_SUPABASE_*` and
`NEXT_PUBLIC_SITE_URL` env vars. The `@netlify/plugin-nextjs` runtime handles
SSR, the proxy, and route handlers.

## Next.js 16 notes (differs from older docs)

- `middleware.ts` is deprecated → this app uses **`src/proxy.ts`** (`proxy`
  function, nodejs runtime).
- `cookies()`, `params`, and `searchParams` are **async** — always awaited.

## Possible next steps

- Wire an email provider into `src/lib/notify/email.ts` to turn email
  notifications on (Slack already works).
- Client-scoped "all sets" dashboard (one link to everything a client can see).
- Richer editor: drag-to-reorder, image upload instead of Drive URLs.
