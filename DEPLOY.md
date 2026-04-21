# CreditX — Manual Deployment Guide

This document describes how to deploy CreditX to production. Deployment is
done manually — run each step in order. Do not skip steps unless you
understand what they do and why.

Server path: `/www/wwwroot/creditx`
PHP-FPM service: typically `php-fpm` or `php8.2-fpm` (check with
`systemctl list-units --state=active | grep fpm`)

---

## Before you begin

**Check for local modifications on the server.** Runtime files in
`backend/storage/` and `backend/public/.well-known/` are normal and
expected. Anything else under `git status` means someone edited code
on the server — commit, stash, or reset before deploying.

```bash
cd /www/wwwroot/creditx
git status
```

Tolerated runtime paths (safe to ignore in the output):
- `backend/storage/uploads/` — uploaded documents
- `backend/storage/exports/` — generated reports
- `backend/storage/avatars/` — user avatars
- `backend/public/.well-known/` — Let's Encrypt ACME challenges
- `backend/public/storage` — symlink / runtime directory

---

## Step 1 — Pull the latest code

```bash
cd /www/wwwroot/creditx
git fetch --prune
git log --oneline HEAD..origin/main   # preview what's about to land
git pull --ff-only origin main
```

If `git pull` fails due to uncommitted changes on tolerated runtime
paths, stash them first:

```bash
git stash push -u -m "runtime" -- backend/storage backend/public/.well-known backend/public/storage
git pull --ff-only origin main
git stash pop
```

---

## Step 2 — Install PHP dependencies

Only needed when `composer.lock` changed:

```bash
cd /www/wwwroot/creditx/backend
composer install --no-dev --optimize-autoloader --no-interaction
```

Check `git log HEAD@{1}..HEAD -- composer.lock` — if empty, skip this step.

---

## Step 3 — Apply database schema changes

```bash
cd /www/wwwroot/creditx/backend

# Preview — shows SQL without executing. Verify the changes look sane.
php bin/doctrine orm:schema-tool:update --dump-sql

# Apply — only run if the preview looked correct
php bin/doctrine orm:schema-tool:update --force --complete
```

**Important:** use `bin/doctrine` (project's custom loader), NOT
`vendor/bin/doctrine` (doesn't exist in this project).

---

## Step 4 — Clear caches thoroughly

**This step is where most deploys go wrong if done sloppily.** Doctrine
ORM metadata is cached to disk, and PHP opcache keeps the bytecode of
those cache files in memory. Both need to be cleared in the correct
order.

```bash
cd /www/wwwroot/creditx/backend

# Hardened clear: remove the directories themselves, then recreate.
# Catches hidden files that 'rm -rf var/cache/*' would miss.
rm -rf var/cache var/proxies
mkdir -p var/cache/doctrine var/proxies

# Fix ownership — the web server user needs to read these later.
# Try each common owner; one of them matches your setup.
chown -R www:www var/cache var/proxies 2>/dev/null || \
chown -R www-data:www-data var/cache var/proxies 2>/dev/null || \
chown -R nginx:nginx var/cache var/proxies
```

---

## Step 5 — First opcache reload (before warmup)

Resets PHP opcache BEFORE the warmup script runs. This ensures the
warmup CLI process reads fresh entity source code from disk rather
than stale bytecode that might have been loaded by a previous CLI
invocation (which is common on managed hosts with `opcache.enable_cli=1`).

```bash
# Find the actual service name
systemctl list-units --state=active --type=service | grep fpm

# Reload it (substitute the actual name)
sudo systemctl reload php-fpm
```

Common service names:
- `php-fpm.service`
- `php8.2-fpm.service`
- `php8.3-fpm.service`

---

## Step 6 — Warm the Doctrine cache

```bash
cd /www/wwwroot/creditx/backend
php -d memory_limit=512M bin/cache-warmup.php
```

This pre-generates Doctrine ORM metadata and proxy classes so the first
HTTP request doesn't consume excessive memory. Output should say:
`Loaded N entity metadata` and `Proxy classes generated in var/proxies/`.

---

## Step 7 — Second opcache reload (after warmup)

Ensures HTTP workers pick up the freshly written Doctrine metadata cache
files. Without this second reload, Semantical errors like "Class User
has no field named isAgent" can appear after adding new entity fields —
because the HTTP workers still hold the OLD metadata cache file bytecode
in opcache memory.

```bash
sudo systemctl reload php-fpm   # or whichever service name
```

---

## Step 8 — Build frontend apps

### Admin app

```bash
cd /www/wwwroot/creditx/creditx-admin
npm ci --omit=dev 2>/dev/null || npm install   # if package-lock changed
npm run build:prod
```

Output goes to `creditx-admin/dist/creditx-admin/`. Ensure your nginx
vhost serves this directory.

### Agent app

```bash
cd /www/wwwroot/creditx/creditx-agent
npm ci --omit=dev 2>/dev/null || npm install   # if package-lock changed
npm run build:prod
```

Output goes to `creditx-agent/dist/creditx-agent/`.

Skip these if the deploy only touched backend code.

---

## Step 9 — Smoke test

```bash
# Verify HEAD is what you expect
git log --oneline HEAD -1

# Verify backend responds
curl -sI https://api.dostsuite.com/api/banks | head -1
# Expect: HTTP/2 200

# Verify a public storage URL (substitute a real avatar path)
curl -sI https://api.dostsuite.com/api/storage/avatars/SOME-UUID.jpg
# Expect: HTTP/2 200 with Content-Type: image/jpeg
```

Browse the admin panel (https://admin.dostsuite.com) and confirm:
- Login works
- Dashboard loads
- Any feature touched by the deploy functions correctly

---

## Rolling back

If a deploy breaks something, roll back:

```bash
cd /www/wwwroot/creditx
git log --oneline -5        # find the last good commit
git reset --hard <commit>

# Then re-run steps 4–7 (cache clear + opcache reload) so PHP uses
# the rolled-back code
```

If a schema update is in the bad commit, you may need to manually
reverse it with SQL — Doctrine doesn't roll back automatically.
Check `bin/doctrine orm:schema-tool:update --dump-sql` to preview what
a re-apply would do, and reverse-engineer the rollback SQL from there.

---

## One-off operational SQL

Any SQL that needs to be run once per deploy (not part of the schema
update) is called out in the commit message of the relevant commit.

Recent examples:
```sql
-- Commit 57bcf95 — repurpose agent.monthly_target from loan count to naira
UPDATE system_settings
   SET setting_value = '1000000',
       description = 'Default monthly disbursement target (naira) for agents without an individual target'
 WHERE setting_key = 'agent.monthly_target'
   AND CAST(setting_value AS INTEGER) < 1000;
```

Check recent commits before deploying to see if any are required.

---

## Data migrations (bin/migrate.php)

For data corrections that need inspection-before-commit semantics or
that touch many rows across multiple tables, the project includes a
PHP migration runner at `backend/bin/migrate.php`. This replaces
hand-written SQL for complex one-off migrations.

### Usage

```bash
cd /www/wwwroot/creditx/backend

# Dry-run — shows what would change, does NOT modify anything
php bin/migrate.php

# Apply with confirmation prompt
php bin/migrate.php --apply

# Apply non-interactively (for scripts / unattended runs)
php bin/migrate.php --apply --yes
```

### Current migration scope

`bin/migrate.php` currently ships two migrations, applied in one
transaction (atomic — either both land or both roll back):

  **Migration 1 — Percentage fee / penalty-rule value correction**

  Historic bad data: admins entered `2` into percentage-fee value fields
  meaning "2%", but the backend stores fees as fractions (0.02 = 2%).
  Result: loan calculator computed 200% fees.

  Divides `product_fees.value` and `penalty_rules.value` by 100 where:
    - `calculation_type = 'percentage'`
    - `value >= 1`

  The `>= 1` threshold skips rows already in correct fractional form.

  **Migration 2 — product_fees.effect backfill**

  After the FeeEffect column was introduced, existing rows defaulted to
  `deducted_from_disbursement`. But in legacy CreditX, Admin Fee and
  Insurance Fee add to the gross loan (customer repays them through
  the schedule), while Management Fee and BS Fee are deducted from the
  disbursement (customer just receives less).

  This migration sets `effect = 'adds_to_gross'` on any `product_fees`
  row whose `fee_type.code` is `AF` (Admin Fee) or `IF` (Insurance Fee)
  and which currently has the default `deducted_from_disbursement`.
  Other fee codes remain at the default (correct for Management / BS /
  Processing in legacy semantics).

### Idempotency

After a successful first run, all percentage rows are < 1. A second
run reports "Nothing to migrate" and exits cleanly. Safe to re-run
at any point.

### Adding future migrations

Extend `bin/migrate.php` with additional migration functions as the
need arises. Each migration should:
  - Have a clear precondition (what data shape does it expect?)
  - Be idempotent (running twice should be harmless)
  - Print a dry-run plan
  - Apply inside a transaction
  - Print post-apply verification

---

## Environment variables

All configuration lives in `backend/.env`. See `backend/.env.example`
for the full list. Critical ones:

| Key | Purpose |
|-----|---------|
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection |
| `JWT_SECRET` | HS256 signing key (keep secret, rotate yearly) |
| `ZEPTOMAIL_API_KEY` | Email delivery (password resets, OTPs, notifications) |
| `ZEPTOMAIL_FROM_EMAIL` | Envelope sender address |
| `TERMII_API_KEY` | SMS delivery (OTPs) |
| `PAYSTACK_SECRET_KEY` | Payment webhook verification |
| `STORAGE_PATH` | Absolute path to storage root (default: `backend/storage`) |
| `FRONTEND_URL` | Used in password-reset email links |
| `FCM_SERVICE_ACCOUNT_PATH` | Absolute path to the Firebase service account JSON. Required for push notifications. See [Push notifications](#push-notifications) below. |

---

## Push notifications

The agent mobile app receives push notifications via Firebase Cloud
Messaging (FCM). Delivery uses the FCM HTTP v1 API, authenticated with
an OAuth2 service account. The legacy server-key HTTP API is NOT used
(it was deprecated in 2024 and stops working on new Firebase projects).

### One-time setup

1. **Create or open the Firebase project** at
   <https://console.firebase.google.com>.

2. **Enable Cloud Messaging** if it isn't already.

3. **Generate a service account key:**
   Project Settings → Service accounts → "Generate new private key".
   This downloads a JSON file. Treat it like a password — it grants
   full send access on your Firebase project.

4. **Place the JSON on the server** outside the repo:

   ```bash
   mkdir -p /www/wwwroot/creditx/backend/storage/firebase
   # upload the JSON via SFTP, name it service-account.json
   chmod 600 /www/wwwroot/creditx/backend/storage/firebase/service-account.json
   chown www:www /www/wwwroot/creditx/backend/storage/firebase/service-account.json
   ```

5. **Set the env var** in `backend/.env`:

   ```
   FCM_SERVICE_ACCOUNT_PATH=/www/wwwroot/creditx/backend/storage/firebase/service-account.json
   ```

6. **Seed push templates** (first deploy after Commit 5.2):

   ```bash
   cd /www/wwwroot/creditx/backend
   php bin/seed-push-templates.php               # dry-run preview
   php bin/seed-push-templates.php --apply --yes # apply
   ```

   This is idempotent — re-running after success is a no-op.

7. **Reload php-fpm** so workers pick up the env change:

   ```bash
   sudo systemctl reload php-fpm
   ```

### What the 8 seeded templates cover

| Event trigger | Fires when | Template code |
|---|---|---|
| `loan_captured` | Agent creates a loan application | `LOAN_CAPTURED_PUSH` |
| `loan_submitted` | Agent submits a loan for approval | `LOAN_SUBMITTED_PUSH` |
| `loan_approval_step` | Intermediate approval step completes | `LOAN_APPROVAL_STEP_PUSH` |
| `loan_approved` | Loan is fully approved | `LOAN_APPROVED_PUSH` |
| `loan_rejected` | Loan is rejected | `LOAN_REJECTED_PUSH` |
| `loan_disbursed` | Loan is disbursed | `LOAN_DISBURSED_PUSH` |
| `payment_received` | Customer repayment is posted | `PAYMENT_RECEIVED_PUSH` |
| `overdue_reminder` | Overdue sweep finds a past-due loan | `OVERDUE_REMINDER_PUSH` |

Agents receive push notifications on their registered devices. Each
notification carries the `notification_id` in its data payload; the
agent app's push handler deep-links to the notifications list on tap.

### When push fails

If `FCM_SERVICE_ACCOUNT_PATH` is unset or the file isn't readable,
push sends return an error and the notification is marked `failed`
in the `notifications` table. Email, SMS, WhatsApp, and in-app
channels are unaffected — they run on separate templates and
separate transports.

The global kill-switch is the `notification.push_enabled` setting
(default `true`). Flip it to `false` via the admin settings UI to
silence all push delivery without deleting templates. EMAIL, SMS,
WHATSAPP, and IN_APP settings work the same way.

### Debugging a missing push

1. Is the template seeded? `SELECT code, channel, event_trigger, is_active FROM notification_templates WHERE channel='push';`
2. Is the user's device registered? `SELECT * FROM device_tokens WHERE user_id='...' AND is_active=true;`
3. Did the event dispatch attempt to send? `SELECT * FROM notifications WHERE user_id='...' AND channel='push' ORDER BY created_at DESC LIMIT 5;` — look at the `status` and `error_message` columns.
4. If notifications show `failed` with no error message: check `var/log/app.log` for FCM errors around that timestamp.
