# SLCR Progress Tracker (Next.js)

Daily progress tracking for the project **Decision Support System for Water Resource Management**,
Smart Laboratory on Clean Rivers (SLCR), IIT (BHU) Varanasi.

**To put it online, follow [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md).**

## Features

- **Staff** log daily progress (date, hours, location, category, status, title, work done, outputs,
  next-day plan, issues), see only their own records and the PI's remarks, edit entries until they are
  reviewed, upload a profile photo, and download their own report.
- **Administrator (PI)** sees everyone: team overview with today's reporting status, hours, streaks
  and a 14-day attendance strip; progress log with filters and charts; review entries (mark reviewed or
  request revision with a remark); PDF, print view and CSV reports for any person and period; staff
  account management; JSON backup.

## Privacy and security

- Every page, action and download checks on the server who is signed in. Staff asking for another
  person's entry, photo or report get "not found"; a tampered form cannot change another person's data.
- Passwords are bcrypt hashes. New accounts get a temporary password that must be changed at first
  sign-in. Password resets sign the person out everywhere. Five wrong passwords lock a username for 15 minutes.
- Sign-in uses a signed, HTTP-only cookie. Forms are protected by Next.js's built-in origin checks.
- The first administrator can only be created with the secret `SETUP_KEY`, and only once.
- An audit log records sign-ins, entry changes, reviews, reports and account changes.

## Technology

| Part | Technology |
|---|---|
| Framework | Next.js 16 (App Router, React Server Components, Server Actions), TypeScript |
| Database | Supabase (Postgres) via `@supabase/supabase-js`, server-side only |
| Sign-in | `bcryptjs` password hashing, `jose` signed session cookies |
| PDF reports | `jspdf` + `jspdf-autotable` |
| Hosting | Vercel (functions run in the Singapore region, set in `vercel.json`) |

All dates are worked out in Indian Standard Time (`TIMEZONE` in `lib/config.ts`), so "today" is
correct even though the servers run on UTC.

## Project layout

```
app/(auth)/        sign-in and first-time setup pages
app/(app)/         staff pages (entry, my-progress, profile) and admin pages (admin/...)
app/(print)/       printable report page
app/reports/       PDF and CSV downloads
app/photo/         staff photos (owner and admins only)
app/admin/backup/  JSON backup (admins only)
app/actions.ts     every form submission, each re-checking permissions
lib/               settings (config.ts), database, sign-in, dates and summaries, reports
components/        shared UI pieces and forms
tests/e2e.cjs      browser tests of the whole app
```

## Running on your own computer (optional, for developers)

Needs Node.js 20+ and a Supabase project (the free tier works).

1. In Supabase, open **SQL Editor → New query**, paste `supabase/schema.sql` and run it.
2. Set up and seed:

```bash
npm install
cp .env.example .env.local      # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET, SETUP_KEY
npm run seed                    # creates admin + roster, prints one-time passwords
npm run dev                     # http://localhost:3000
```

Each seeded account gets a one-time temporary password. At first sign-in the person is sent to
**Set a new password** and cannot use the app until they choose their own. If someone loses theirs,
the administrator uses **Reset password**, which issues a new one-time password the same way.
(Skip `npm run seed` if you would rather create the first admin yourself on `/setup`.)

**Emailing account details.** When an admin adds a staff member or another administrator, the email
address is required and the username and one-time password are emailed to that person. A password
reset is emailed the same way. Set `MAIL_USERNAME` (a Gmail address), `MAIL_PASSWORD` (a Google
*App Password*) and `APP_URL` (the public address used in the sign-in link) in `.env.local` and on Vercel.

For local testing over plain http with `npm run build && npm start`, also set `INSECURE_COOKIES=1`.

## Tests

With the app running against an **empty** database:

```bash
npm i -D playwright && npx playwright install chromium
BASE_URL=http://127.0.0.1:3000 SETUP_KEY=... node tests/e2e.cjs
```

37 checks cover setup, sign-in, forced password change, entries, photos, staff-to-staff privacy
(pages, downloads, photos, admin pages and a tampered form), reviews and locking, reports, backup,
password reset, deactivation and lockout.
