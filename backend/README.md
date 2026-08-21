# Centenary Networks B-BBEE Tool — Backend (Xneelo)

Plain PHP + MySQL, no framework, no Composer — same shape as the Inzalo
Yamaqhawe Technologies dashboard (`mysqli`, prepared statements, one `.php`
file per resource) so it deploys to Xneelo shared hosting the same way that
project does. This is entirely separate from that project's own database —
it needs its **own** Xneelo MySQL database, not a new set of tables bolted
onto `7k7dv_ewrq9`.

**Nothing here is live yet, and nothing needs to be.** The frontend
(`index.html` + `js/*.js`) keeps working exactly as it does today, fully
offline via `localStorage` — this backend is additive, switched on only
when you flip `USE_REMOTE_API = true` in `js/api.js`. Deploy this whenever
the frontend work is finished, not before.

## What's in here

```
backend/
  sql/init.sql       — every table, ready to import via phpMyAdmin
  api/db.php         — connection config + shared helpers (fill in credentials here)
  api/bootstrap.php  — ONE-TIME setup: creates your first account + login (then delete it)
  api/auth.php       — login / logout / me
  api/accounts.php   — list accounts, switch active account
  api/scorecards.php — the big one: full nested scorecard read/write (13 tables)
  api/portfolio.php  — Portfolio of Evidence PDF uploads
  api/tasks.php      — Implementation Plan tasks
  api/scenarios.php  — Scenario Planner saved snapshots
  api/health.php     — quick "is the DB reachable" check
  api/.htaccess      — routes the clean REST paths (e.g. /api/scorecards/:id) to the .php files above
```

Every endpoint's exact request/response shape is documented in `BACKEND.md`
at the project root — that file is the contract; this folder is the
implementation of it. If the two ever disagree, `BACKEND.md` plus the doc
comment on the matching `Api.*` function in `js/api.js` is authoritative —
fix the PHP to match, not the other way round, since that's what the
frontend was actually built against.

## Deploy steps (Xneelo)

1. **Create the database.** Xneelo cPanel → MySQL Databases → create a new
   database and a database user with full privileges on it (same as you did
   for the Inzalo dashboard's `7k7dv_ewrq9`). Note the host, the
   Xneelo-prefixed database name and username, and the password.

2. **Import the schema.** phpMyAdmin → your new database → Import →
   `sql/init.sql`. Edit the `USE` line at the top of that file first to
   match your actual database name.

3. **Fill in credentials.** Open `api/db.php` and replace the four
   `REPLACE_WITH_...` placeholders with the real values from step 1. Also
   set `SETUP_SECRET` to your own random string (used once, by step 5).

4. **Upload.** Upload the whole `backend/api/` folder's contents (the
   `.php` files and `.htaccess`) to wherever you want `/api/` to live on
   your Xneelo hosting — typically `public_html/api/`.

5. **Create your first account + login.** Visit
   `https://your-domain/api/bootstrap.php?secret=YOUR_SETUP_SECRET` in a
   browser, fill in the short form (account name, your name, email,
   password). **Then delete `bootstrap.php` from the server** — it refuses
   to run a second time, but there's no reason to leave a setup endpoint
   sitting there indefinitely.

6. **Smoke-test.** Visit `https://your-domain/api/health` — you should see
   `{"ok":true}`. If you get a PHP error instead, the credentials in
   `db.php` are the first thing to check.

7. **Point the frontend at it.** In `js/api.js`, set `API_BASE_URL` to your
   API's base URL and flip `USE_REMOTE_API` to `true`. Everything else in
   the frontend already has a working `fetch()` implementation behind that
   flag — nothing else changes.

8. **Wire up login.** There's no login screen in the frontend yet (see
   BACKEND.md's "Auth" section) — build one that calls
   `POST /api/auth/login` and stores the returned token via
   `Api.setAuthToken(token)`. Every other `Api.*` call already attaches it
   automatically once that's done.

## Local file storage note

Portfolio PDFs are saved to `backend/uploads/portfolios/` on the server's
own disk (created automatically on first upload) — a reasonable default
since Xneelo shared hosting doesn't give you S3-style object storage by
default. If that ever needs to change, only the two lines marked in
`api/portfolio.php` need to change.

## If you add more tables/columns later

Update, in this order, so nothing drifts out of sync:
1. `sql/init.sql` (the real schema)
2. `BACKEND.md` at the project root (the documented contract)
3. `api/scorecards.php`'s `assemble_scorecard()`/`save_scorecard()` (or the
   relevant endpoint file) — these were written by reading `js/data.js`'s
   `blankScorecard()` field-by-field, not from memory, and every
   `bind_param()` type string was mechanically verified against its column
   list rather than hand-counted — do the same when you extend it. A
   mismatched type-string length is the single easiest mistake to make here
   and the hardest to notice, since PHP won't error, it'll just silently
   write the wrong value into the wrong column.
