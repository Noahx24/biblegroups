# Production Supabase setup — ChurchFlow

This runbook stands up a **fresh production** Supabase project by cloning the
schema from your existing (dev/staging) project, then wiring up everything the
app depends on at runtime: storage, auth, realtime, edge functions, the daily
reminder cron, and the client/build environment.

> Why clone rather than re-run migrations: the SQL migration scripts have been
> removed from the repo, and the live schema (e.g. `churches`, `profiles.church_id`,
> `volunteer_programmes`, `device_push_tokens`, `reading_plan`) is ahead of
> anything in git history. **Your existing project is the source of truth** — dump
> it, don't rebuild it by hand.

Throughout, `SOURCE` = your existing working project, `PROD` = the new
production project.

---

## 0. Prerequisites

```bash
# Supabase CLI (macOS/Linux). See https://supabase.com/docs/guides/cli for other OSes.
brew install supabase/tap/supabase     # or: npx supabase --version
supabase --version                     # confirm it runs

# Postgres client tools (psql / pg_dump) — used for data copy and ad-hoc SQL.
psql --version
```

Log in to the CLI (opens a browser):

```bash
supabase login
```

You will need, from each project's **Dashboard → Project Settings**:

| Value | Where | Used for |
|---|---|---|
| Project ref (e.g. `abcd1234…`) | General | `supabase link`, function URLs |
| Database password | Database | `supabase db dump` / `psql` connection |
| Project URL (`https://<ref>.supabase.co`) | Data API | app env `EXPO_PUBLIC_SUPABASE_URL` |
| Publishable / anon key | API Keys | app env `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

---

## 1. Create the production project

1. Dashboard → **New project**. Pick the **org**, a **name** (e.g. `churchflow-prod`),
   a strong **DB password** (store it in a password manager), and the **region
   closest to your users** (e.g. `Africa (Johannesburg)` if available, otherwise
   the nearest EU region for SAST users).
2. Choose a paid tier if you want **PITR backups** and **no auto-pause** — see §10.
3. Wait for provisioning to finish before continuing.

Record `PROD` ref, URL, anon key, and DB password.

---

## 2. Clone the schema (SOURCE → PROD)

This copies the full schema — tables, types, functions, triggers, RLS policies,
and storage bucket definitions — but **not** row data (data is §8, optional).

```bash
# 2a. Dump roles + schema from SOURCE.
supabase link --project-ref <SOURCE_REF>          # enter SOURCE db password when asked
supabase db dump --linked -f schema.sql           # schema only (DDL)
supabase db dump --linked --role-only -f roles.sql

# 2b. Apply to PROD.
supabase link --project-ref <PROD_REF>            # enter PROD db password
psql "$(supabase db url --linked)" -f roles.sql   # may warn that roles exist — safe to ignore
psql "$(supabase db url --linked)" -f schema.sql
```

If `supabase db url` isn't available in your CLI version, build the connection
string from the dashboard (Database → Connection string → URI) and pass it to
`psql` directly.

Verify the tables landed:

```bash
psql "$(supabase db url --linked)" -c "\dt public.*"
```

You should see (non-exhaustive): `profiles`, `churches`, `groups`,
`group_members`, `schedule`, `weekly_verses`, `reading_plan`, `events`,
`event_rsvps`, `announcements`, `family_members`, `youth_programs`,
`program_registrations`, `volunteer_programmes`, `device_push_tokens`.

> **Auth schema note:** `supabase db dump` covers the `public` schema. The
> `auth`/`storage` system schemas are managed by Supabase and recreated with the
> project — you do **not** copy them. Triggers the app installs on `auth.users`
> (e.g. `on_auth_user_created` → `handle_new_user`) live in `public` functions
> referenced from `auth`; confirm they came across:
> ```bash
> psql "$(supabase db url --linked)" -c "select tgname from pg_trigger where tgrelid = 'auth.users'::regclass;"
> ```
> If the auth-user trigger is missing (some dumps skip cross-schema triggers),
> re-create it from your SOURCE: dump it explicitly and apply to PROD.

---

## 3. Storage — `avatars` bucket

The app uploads profile photos to a **public** bucket named `avatars` at path
`{userId}/avatar.{ext}` with `upsert: true`, then reads them via
`getPublicUrl(...)`.

In the Dashboard → **Storage**:

1. **New bucket** → name `avatars`, **Public bucket = ON**.
2. Add RLS policies on `storage.objects` so a user can only write their own
   folder (run in SQL editor):

```sql
-- Public read of avatars (bucket is public, but this makes the SELECT explicit).
create policy "avatars_public_read"
on storage.objects for select
using ( bucket_id = 'avatars' );

-- A user may write/update/delete only files under their own uid/ prefix.
create policy "avatars_owner_write"
on storage.objects for insert to authenticated
with check ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );

create policy "avatars_owner_update"
on storage.objects for update to authenticated
using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );

create policy "avatars_owner_delete"
on storage.objects for delete to authenticated
using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );
```

> If your SOURCE project already had these policies, the schema dump may have
> brought them along — check **Storage → Policies** before re-adding to avoid
> duplicate-name errors.

---

## 4. Auth configuration

Dashboard → **Authentication**.

### 4a. URL configuration (deep links)

The app uses these redirect targets (`Linking.createURL`):

- `churchflow://auth-callback` — Google OAuth return (implicit flow)
- `churchflow://reset` — password-reset deep link

Set:

- **Site URL:** `churchflow://auth-callback`
- **Redirect URLs (allow list):** add **both**
  - `churchflow://auth-callback`
  - `churchflow://reset`
  - For Expo Go testing also add the `exp://…/--/auth-callback` and
    `exp://…/--/reset` URLs that `npx expo start` prints.

### 4b. Email auth

- Email/password sign-up is used. Decide on **Confirm email**: in production you
  generally want it **ON**. (The dev `config.toml` had `enable_confirmations =
  false`; the dashboard setting, not the local file, governs the cloud project.)
- Customize the email templates under **Authentication → Email Templates** using
  the HTML in `supabase/email-templates/` (confirm-signup, reset-password,
  magic-link, invite-user, change-email, reauthentication).

### 4c. Production SMTP (recommended)

Supabase's built-in email is rate-limited and not for production. Under
**Authentication → SMTP Settings**, enable custom SMTP (SendGrid, Postmark, SES,
etc.) so confirmation/reset emails actually deliver at volume.

> This Auth SMTP is **separate** from the edge-function SMTP in §6 — set both.

### 4d. Google sign-in (optional)

Only if you use the "Continue with Google" button:

1. Google Cloud Console → OAuth 2.0 **Web** client → authorized redirect URI
   `https://<PROD_REF>.supabase.co/auth/v1/callback`.
2. Dashboard → **Authentication → Providers → Google** → enable, paste client ID
   + secret.
3. Confirm `churchflow://auth-callback` is in the redirect allow-list (§4a).

---

## 5. Realtime

The app subscribes to live changes (announcements board, assignment banner,
schedule, My Week) via `postgres_changes`. Postgres only streams changes for
tables in the `supabase_realtime` publication, and RLS-filtered UPDATE/DELETE
events need a full row image.

Run in the SQL editor (idempotent):

```sql
do $$
declare
  t text;
  realtime_tables text[] := array[
    'schedule','group_members','groups','events','event_rsvps',
    'announcements','reading_plan','weekly_verses','profiles',
    'youth_programs','program_registrations','volunteer_programmes',
    'device_push_tokens','churches'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array realtime_tables loop
    if not exists (select 1 from information_schema.tables
                   where table_schema = 'public' and table_name = t) then
      raise notice 'skipping %, not found', t; continue;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;
```

> Trim the array to the tables your version actually subscribes to if you prefer
> the minimal surface; the extras are harmless. Realtime still honours RLS — a
> client only receives events for rows its SELECT policy already allows.

---

## 6. Edge functions

Two functions live in `supabase/functions/`. `SUPABASE_URL` and the
service-role key are injected automatically; you only set SMTP secrets.

```bash
supabase link --project-ref <PROD_REF>

# App-invoked when a slot is assigned. Keep JWT verification ON (app sends the
# user's bearer token). Sends Expo push + SMTP email.
supabase functions deploy notify-assignment

# Cron-only daily reminder. --no-verify-jwt lets the pg_cron call invoke it with
# no auth header (see §7).
supabase functions deploy send-schedule-reminders --no-verify-jwt

# SMTP secrets (used by notify-assignment; email is skipped gracefully if unset).
supabase secrets set \
  SMTP_HOST=smtp.example.com \
  SMTP_PORT=587 \
  SMTP_USER=apikey \
  SMTP_PASS='your-smtp-password' \
  SMTP_FROM='ChurchFlow <no-reply@yourchurch.org>'
```

Verify:

```bash
supabase functions list
supabase secrets list
```

---

## 7. Daily reminder cron

`send-schedule-reminders` must be triggered once a day. Enable **pg_cron** and
**pg_net** (Dashboard → Database → Extensions), then run in the SQL editor:

```sql
select cron.schedule(
  'send-schedule-reminders',
  '0 18 * * *',                              -- 18:00 UTC = 20:00 SAST, daily
  $$select net.http_post(
       url     := 'https://<PROD_REF>.supabase.co/functions/v1/send-schedule-reminders',
       headers := jsonb_build_object('Content-Type','application/json'),
       body    := '{}'::jsonb
  )$$
);
```

Adjust the cron expression for your audience's timezone. Confirm with
`select * from cron.job;`. (If you deployed *with* JWT verification instead of
`--no-verify-jwt`, the call must send a secret key in an `apikey` header — see
the comment block at the top of the function file.)

---

## 8. (Optional) Copy row data

Schema-only is the right default for a clean production launch. If you must
seed production with existing rows (reference data like `churches`, or a full
migration), copy **data only** in FK-safe order:

```bash
# From SOURCE:
supabase link --project-ref <SOURCE_REF>
supabase db dump --linked --data-only -f data.sql

# Into PROD:
supabase link --project-ref <PROD_REF>
psql "$(supabase db url --linked)" -f data.sql
```

> Caveats: rows in `public.profiles` are FK-bound to `auth.users`. You can't
> copy profiles without the matching auth users, and auth users are not part of
> a `public` data dump. For a true user migration use Supabase's
> [auth migration guidance](https://supabase.com/docs/guides/platform/migrating-and-upgrading-projects).
> For a fresh launch, prefer copying only reference tables (e.g. `churches`,
> `youth_programs`) and letting real users sign up cleanly.

---

## 9. App & build environment

### Local `.env`

```
EXPO_PUBLIC_SUPABASE_URL=https://<PROD_REF>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PROD anon/publishable key>
EXPO_PUBLIC_BIBLE_API_KEY=<YouVersion app key>
EXPO_PUBLIC_SENTRY_DSN=<optional>
EXPO_PUBLIC_APP_RELEASE=churchflow@0.2.0
```

> Use the **publishable/anon** key only — never the service-role key in the app
> bundle (it's `EXPO_PUBLIC_*`, i.e. shipped to clients).

### EAS (production builds)

Store the production values as EAS environment variables / secrets so
`eas build --profile production` uses them:

```bash
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://<PROD_REF>.supabase.co
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <PROD anon key>
eas env:create --environment production --name EXPO_PUBLIC_BIBLE_API_KEY --value <YouVersion key>
# Build-time only (NOT EXPO_PUBLIC) — source map upload:
eas env:create --environment production --name SENTRY_AUTH_TOKEN --value <token> --visibility secret
```

(Older EAS CLIs use `eas secret:create`; check `eas env --help`.)

---

## 10. Production hardening

- **Backups / PITR:** enable Point-in-Time Recovery (paid tiers). At minimum
  confirm daily backups are on (Dashboard → Database → Backups).
- **No auto-pause:** ensure the project won't pause on inactivity (free tier
  pauses — use a paid tier for production).
- **Network restrictions:** if only edge functions and the app talk to the DB,
  you can restrict direct DB access (Dashboard → Database → Network
  Restrictions). The app uses the Data API (PostgREST), not direct Postgres, so
  this is usually safe.
- **Auth rate limits:** review **Authentication → Rate Limits** for production
  volumes (email send, sign-in attempts).
- **Leaked-password protection / strong password policy:** enable under
  **Authentication → Policies** if desired.

---

## 11. Bootstrap the first admin

Roles escalate only via existing admins (a `BEFORE UPDATE` trigger on `profiles`
blocks self-escalation). Bootstrap the very first admin directly in SQL after
that user has signed up once:

```sql
-- Run as the postgres/service role in the SQL editor.
update public.profiles
set is_admin = true, is_super_admin = true
where email = 'you@yourchurch.org';
```

From then on, admins manage groups/members and the CSV bulk import; super admins
can grant admin to others in-app.

---

## 12. Smoke test (do before announcing launch)

Point a build (or `.env`) at PROD and verify end to end:

- [ ] Sign up a new account → lands on **Select your church**.
- [ ] Confirmation email arrives (if §4b confirmations on).
- [ ] Password reset email arrives and `churchflow://reset` deep-links back in.
- [ ] (If enabled) Google sign-in returns via `churchflow://auth-callback`.
- [ ] Upload a profile photo → appears (verifies `avatars` bucket + policies).
- [ ] Post an announcement in a group → a second device sees it **without
      refresh** (verifies Realtime, §5).
- [ ] Admin assigns a schedule slot → assignee gets a push + email (verifies
      `notify-assignment` + SMTP, §6).
- [ ] Manually invoke the reminder once to confirm wiring:
      `curl -X POST https://<PROD_REF>.supabase.co/functions/v1/send-schedule-reminders`
      (returns JSON with `slots`/`sent`).
- [ ] Run the CSV bulk import in the Admin panel against a couple of test rows.

---

### Quick reference — what PROD needs

| Area | Item | Section |
|---|---|---|
| Schema | Cloned from SOURCE via `db dump` + `psql` | §2 |
| Storage | Public `avatars` bucket + owner-write policies | §3 |
| Auth | Site/redirect URLs, email confirm, SMTP, Google | §4 |
| Realtime | Tables added to `supabase_realtime` + replica identity | §5 |
| Functions | `notify-assignment`, `send-schedule-reminders` + SMTP secrets | §6 |
| Cron | pg_cron + pg_net daily reminder | §7 |
| Env | `EXPO_PUBLIC_SUPABASE_URL` / `…_PUBLISHABLE_KEY` (+ EAS) | §9 |
| Ops | PITR, no auto-pause, rate limits | §10 |
| Access | Bootstrap first admin | §11 |
