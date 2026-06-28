# CreditX — New-Client Provisioning Runbook (aaPanel + Cloudflare)

This runbook stands up a **fresh CreditX instance for a new client** from
scratch:

- **Backend** (Slim 4 / PHP / PostgreSQL / Redis) on an **aaPanel** server.
- **Frontends** (admin + customer portal Angular apps) on **Cloudflare
  Pages**.
- **Agent app** (Ionic/Capacitor) built as a mobile APK/IPA, or optionally
  served as a PWA on Cloudflare Pages.

> For **updating an already-deployed** instance, use [`DEPLOY.md`](DEPLOY.md)
> instead. This document is only for the first-time setup of a new tenant.

Throughout, replace these placeholders with the client's real values:

| Placeholder | Example |
|---|---|
| `<CLIENT>` | `acme` (short slug, lowercase) |
| `<API_DOMAIN>` | `api.acme-mfb.com` |
| `<ADMIN_DOMAIN>` | `admin.acme-mfb.com` |
| `<PORTAL_DOMAIN>` | `portal.acme-mfb.com` |
| `<DB_NAME>` / `<DB_USER>` / `<DB_PASS>` | `creditx_acme` / `creditx_acme` / *(generated)* |
| `/www/wwwroot/creditx` | server install path (aaPanel default web root) |

---

## 0. Architecture & DNS overview

```
                         ┌─────────────────── Cloudflare ───────────────────┐
  Admin staff  ─────────▶│  Pages:  <ADMIN_DOMAIN>   (creditx-admin)         │
  Customers    ─────────▶│  Pages:  <PORTAL_DOMAIN>  (creditx-portal)        │
                         └───────────────────────┬───────────────────────────┘
                                                  │  HTTPS (CORS)
                                                  ▼
  Agents (mobile app) ───────────────▶  ┌──── aaPanel server ────┐
                                         │  Nginx → backend/public │
                                         │  PHP-FPM 8.2/8.3        │
                                         │  PostgreSQL  + Redis    │
                                         │  Cron workers           │
                                         └─────────────────────────┘
                                            <API_DOMAIN>
```

**DNS records to create** (in Cloudflare DNS for the client's zone):

| Type | Name | Target | Proxy |
|---|---|---|---|
| `A` | `<API_DOMAIN>` | aaPanel server public IP | **DNS only (grey cloud)** at first, see §6 |
| `CNAME` | `<ADMIN_DOMAIN>` | Cloudflare Pages project | Proxied (orange) |
| `CNAME` | `<PORTAL_DOMAIN>` | Cloudflare Pages project | Proxied (orange) |

> Keep `<API_DOMAIN>` **grey-clouded (DNS-only)** until aaPanel has issued
> its own Let's Encrypt cert (§6). Once verified, you may switch it to
> proxied if you want Cloudflare in front of the API — if you do, set SSL
> mode to **Full (strict)**.

---

## 1. Server prerequisites (aaPanel)

In the aaPanel **App Store**, install:

- **Nginx** (1.22+)
- **PHP 8.2 or 8.3** — then open *PHP → Settings → Install extensions* and
  enable: `pdo_pgsql`, `pgsql`, `redis`, `opcache`, `mbstring`, `fileinfo`,
  `curl`, `openssl`, `bcmath`, `intl`, `gd`.
- **PostgreSQL** (via the *PostgreSQL Manager* plugin), 14+
- **Redis**
- **Composer** (PHP → Composer, or install globally)
- **PM2 / Node** is *not* needed on the server — frontends build on
  Cloudflare, not here.

PHP recommended settings (PHP → Settings → Configuration):

```
memory_limit = 512M
upload_max_filesize = 12M
post_max_size = 12M
opcache.enable = 1
opcache.enable_cli = 1
max_execution_time = 120
```

> `upload_max_filesize` must exceed `STORAGE_MAX_SIZE` (10 MB default).

---

## 2. Provision the database

In aaPanel → **PostgreSQL Manager**:

1. Create database `<DB_NAME>` with a dedicated user `<DB_USER>` and a strong
   generated password `<DB_PASS>`.
2. Confirm the user owns the database (CreditX creates its own schema).

Verify connectivity from the server shell:

```bash
psql "host=127.0.0.1 port=5432 dbname=<DB_NAME> user=<DB_USER> password=<DB_PASS>" -c '\conninfo'
```

---

## 3. Deploy the backend code

```bash
# Clone into the aaPanel web root
cd /www/wwwroot
git clone <REPO_URL> creditx
cd creditx/backend

# PHP dependencies (production)
composer install --no-dev --optimize-autoloader --no-interaction
```

### 3.1 Configure environment

```bash
cp .env.example .env
```

Edit `backend/.env` for this client:

```ini
APP_NAME=<CLIENT> CreditX
APP_ENV=production
APP_DEBUG=false
APP_URL=https://<API_DOMAIN>
APP_TIMEZONE=Africa/Lagos

DB_DRIVER=pdo_pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=<DB_NAME>
DB_USER=<DB_USER>
DB_PASSWORD=<DB_PASS>

# Generate a fresh 256-bit secret — DO NOT reuse another client's:
#   openssl rand -base64 48
JWT_SECRET=<GENERATED>

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=null
REDIS_PREFIX=creditx_<CLIENT>:        # unique per client — avoids cache bleed on shared Redis

# CORS — list every frontend origin that will call the API:
CORS_ALLOWED_ORIGINS=https://<ADMIN_DOMAIN>,https://<PORTAL_DOMAIN>

# Password-reset / email deep links point at the admin app:
FRONTEND_URL=https://<ADMIN_DOMAIN>

# Provider keys (client-specific accounts):
ZEPTOMAIL_API_KEY=...
ZEPTOMAIL_FROM_EMAIL=noreply@<client-domain>
TERMII_API_KEY=...
PAYSTACK_SECRET_KEY=...
PAYSTACK_PUBLIC_KEY=...
PAYSTACK_WEBHOOK_SECRET=...
FCM_SERVICE_ACCOUNT_PATH=/www/wwwroot/creditx/backend/storage/firebase/service-account.json

LOG_LEVEL=warning
```

> **`REDIS_PREFIX` must be unique per client** if any clients share a Redis
> instance — otherwise cached settings/sessions collide across tenants.

### 3.2 Storage permissions

```bash
cd /www/wwwroot/creditx/backend
mkdir -p storage/uploads storage/exports storage/avatars storage/firebase var/cache var/proxies var/log
chown -R www:www storage var          # 'www' is aaPanel's web user
chmod -R 775 storage var
```

---

## 4. Create schema + seed data

```bash
cd /www/wwwroot/creditx/backend

# 1. Create all tables from entity metadata (preview first):
php bin/doctrine orm:schema-tool:update --dump-sql
php bin/doctrine orm:schema-tool:update --force --complete

# 2. Apply additive/idempotent schema scripts (safe to run on a fresh DB):
php bin/init-customer-cbn-fields.php
php bin/init-customer-portal-auth.php
php bin/init-portal-affordability-fields.php
php bin/init-accounting-periods-schema.php
php bin/init-budgets-schema.php
php bin/init-deposits-schema.php
php bin/init-provisions-schema.php
php bin/init-reconciliation-columns.php
php bin/init-topup-underwriter-column.php
php bin/init-audit-columns-repair.php
php bin/init-interest-accrual-gls.php   # Interest Receivable + Interest in Suspense GLs (accrual-basis interest)
php bin/init-tax-rates.php              # Default VAT/WHT rates (VAT 7.5%, WHT 5% / 10%)

# 3. Seed permissions, roles, default settings, chart of accounts, admin user:
php bin/seed.php

# 4. Seed notification templates:
php bin/seed-push-templates.php --apply --yes
php bin/seed-loan-rejected-templates.php

# 5. Warm the Doctrine cache:
php -d memory_limit=512M bin/cache-warmup.php
```

> The `init-*` scripts each check `information_schema` before altering and
> are no-ops if the column/table already exists, so re-running is harmless.

### 4.1 Secure the default admin account — DO THIS IMMEDIATELY

`seed.php` creates a Super Admin with **well-known default credentials**:

```
admin@dostsuite.com  /  Admin@123456
```

Before handing the system over:

1. Log in once, create the **client's real Super Admin** user (their email),
   assign the `super_admin` role.
2. **Delete or disable** the `admin@dostsuite.com` account, or at minimum
   change its email and password to client-owned secret values.

Leaving the default credentials live is a critical security hole.

---

## 5. Configure the aaPanel website (Nginx → backend/public)

1. aaPanel → **Website → Add site**:
   - Domain: `<API_DOMAIN>`
   - Do **not** let it create a separate directory — point it at the repo.
2. After creation, **Site → Site directory**:
   - **Running directory**: set to `/backend/public` (the Slim front
     controller lives in `backend/public/index.php`).
3. **Site → Config / Pseudo-static (URL rewrite)** — Slim needs all requests
   routed to the front controller:

   ```nginx
   location / {
       try_files $uri $uri/ /index.php?$query_string;
   }
   ```

4. **Site → PHP version**: select 8.2 or 8.3 (the one you configured in §1).
5. Confirm document-root permissions: `chown -R www:www /www/wwwroot/creditx`.

---

## 6. SSL for the API

In aaPanel → **Website → `<API_DOMAIN>` → SSL**:

- Issue a **Let's Encrypt** certificate (requires the `A` record to resolve
  to this server — keep it **grey-clouded / DNS-only** in Cloudflare during
  issuance so the ACME HTTP-01 challenge reaches aaPanel directly).
- Enable **Force HTTPS**.

Verify:

```bash
curl -sI https://<API_DOMAIN>/api/banks | head -1     # expect: HTTP/2 200
```

Only after this succeeds, optionally switch the `A` record to **Proxied**
(orange) in Cloudflare and set the zone SSL mode to **Full (strict)**.

---

## 7. Cron workers

CreditX relies on scheduled jobs. In aaPanel → **Cron**, add shell-script
tasks (adjust PHP path to the version installed):

| Frequency | Command | Purpose |
|---|---|---|
| Every 30 min | `php /www/wwwroot/creditx/backend/bin/sla-check.php` | Auto-approve / escalate on SLA breach |
| Daily 01:00 | `php /www/wwwroot/creditx/backend/bin/overdue-check.php` | Flag overdue loans |
| Daily 02:00 | `php /www/wwwroot/creditx/backend/bin/run-gl-reconciliation.php` | GL reconciliation |
| Monthly, 1st 00:30 | `php /www/wwwroot/creditx/backend/bin/accrue-loan-interest.php` | Accrue prior month's loan interest income (accrual basis) |
| Monthly, 1st 00:45 | `php /www/wwwroot/creditx/backend/bin/run-depreciation.php` | Post prior month's fixed-asset depreciation |
| Per schedule | `php /www/wwwroot/creditx/backend/bin/report-schedule.php` | Scheduled report delivery |

> The interest-accrual job is idempotent per month (one POSTED run per
> period). Run `bin/accrue-loan-interest.php --preview` first to sanity-check
> the figures before the live posting. `bin/doctrine orm:schema-tool:update`
> (Step 1) creates the `interest_accrual_runs` / `interest_accrual_lines`
> tables from the entity metadata.

---

## 8. Point the frontends at this client's API

The Angular apps read `apiUrl` from `src/environments/environment.ts`. There
is **no `environment.prod.ts` file-replacement configured**, so the build
uses `environment.ts` directly — it must contain the client's API URL.

Two options:

**A. Branch/fork per client (recommended for many tenants).** Keep a
per-client branch where `environment.ts` is set to that client's API.

**B. Set it at build time on Cloudflare** by committing a build that reads
the value. Simplest reliable path today: edit the file.

Set in **both** apps:

```ts
// creditx-admin/src/environments/environment.ts
// creditx-portal/src/environments/environment.ts
export const environment = {
  production: true,
  apiUrl: 'https://<API_DOMAIN>/api',
};
```

> The trailing `/api` is required — backend routes are mounted under `/api`.

A SPA fallback file is already committed at `public/_redirects` in both apps
(`/* /index.html 200`) so deep links and refreshes resolve correctly on
Cloudflare Pages.

---

## 9. Deploy frontends to Cloudflare Pages

Do this **twice** — once for the admin app, once for the portal.

### 9.1 Create the Pages project

Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**,
select the CreditX repo, then set **Build configuration**:

| Setting | Admin app | Portal app |
|---|---|---|
| Project name | `<CLIENT>-admin` | `<CLIENT>-portal` |
| Production branch | client branch (or `main`) | client branch (or `main`) |
| Framework preset | Angular (or None) | Angular (or None) |
| Build command | `npm run build:prod` | `npm run build:prod` |
| Build output directory | `dist/creditx-admin/browser` | `dist/creditx-portal/browser` |
| Root directory (advanced) | `creditx-admin` | `creditx-portal` |
| Node version (env var `NODE_VERSION`) | `20` (or repo's version) | `20` |

> The Angular `@angular/build:application` builder emits to
> `dist/<project>/browser/` — note the **`browser`** sub-path. Getting this
> wrong yields a blank page or 404s.

### 9.2 Custom domains

In each Pages project → **Custom domains → Set up a custom domain**:

- Admin project → `<ADMIN_DOMAIN>`
- Portal project → `<PORTAL_DOMAIN>`

Cloudflare provisions the cert automatically (these stay proxied/orange).

### 9.3 Trigger the build

Push to the production branch (or hit **Retry deployment**). When the build
finishes, browse to each custom domain.

---

## 10. Agent mobile app (optional / separate track)

`creditx-agent` is an Ionic + Capacitor app. It is **not** a Cloudflare Pages
target by default — it ships as a native mobile binary:

```bash
cd creditx-agent
# set apiUrl in src/environments/environment.prod.ts to https://<API_DOMAIN>/api
npm ci
npm run build:prod
npx cap sync
# then build the APK/IPA in Android Studio / Xcode
```

If the client wants a browser-based agent experience instead, you *can*
publish its web build to a third Cloudflare Pages project the same way as
§9 (output `dist/creditx-agent/browser`, add a `_redirects`), but confirm
the agent app's features don't depend on native plugins first.

---

## 11. Post-deploy smoke test

**Backend**
```bash
curl -sI https://<API_DOMAIN>/api/banks | head -1          # HTTP/2 200
```

**Admin** — open `https://<ADMIN_DOMAIN>`:
- Log in with the new client Super Admin.
- Dashboard loads; no CORS errors in the browser console.
- **Settings → Approval Workflows**: create a workflow, add a step, mark a
  second step **Conditional**, add a **Routing Condition** (e.g. DSR `>` 0.4
  → that conditional step). Save. (Validates the condition-builder end to
  end.)

**Portal** — open `https://<PORTAL_DOMAIN>`:
- Register / log in as a customer.
- Submit a loan application with employment + income; confirm it lands in
  the admin approval queue and that DSR/affordability shows on the review
  modal.

**CORS sanity** — if the browser console shows
`No 'Access-Control-Allow-Origin'`, the frontend origin is missing from
`CORS_ALLOWED_ORIGINS` in `backend/.env`; fix it and reload PHP-FPM.

---

## 12. Per-client checklist (copy this into the client's ticket)

- [ ] DNS records created (`<API_DOMAIN>` A, admin/portal CNAMEs)
- [ ] aaPanel: PHP 8.2/8.3 + extensions, PostgreSQL, Redis installed
- [ ] Database + dedicated user created
- [ ] `.env` filled (unique `JWT_SECRET`, unique `REDIS_PREFIX`, CORS origins)
- [ ] Schema created (`doctrine schema-tool` + `init-*` scripts)
- [ ] `seed.php` run; **default admin replaced/deleted**
- [ ] Notification templates seeded
- [ ] aaPanel site running-directory = `/backend/public`, rewrite rule set
- [ ] API SSL issued + Force HTTPS; `curl` returns 200
- [ ] Cron jobs added (SLA, overdue, reconciliation)
- [ ] `environment.ts` apiUrl set in admin + portal
- [ ] Cloudflare Pages projects built with output `dist/<app>/browser`
- [ ] Custom domains attached; SPA `_redirects` working (deep-link refresh)
- [ ] Provider keys live (mail, SMS, Paystack, FCM) and test-sent
- [ ] Smoke test passed (login, loan application, approval routing)
- [ ] Firebase service-account JSON uploaded (if push needed)

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Blank admin page, assets 404 | Wrong Pages output dir | Must be `dist/<app>/browser` |
| Refresh on a route 404s | Missing SPA fallback | Ensure `public/_redirects` is in the build |
| `No 'Access-Control-Allow-Origin'` | Origin not whitelisted | Add to `CORS_ALLOWED_ORIGINS`, reload PHP-FPM |
| 500 on every API call | DB/Redis creds or perms | Check `var/log/app.log`, `.env`, storage ownership |
| `Class X has no field named Y` | Stale Doctrine cache | `rm -rf var/cache var/proxies && php bin/cache-warmup.php`, reload PHP-FPM |
| Let's Encrypt issuance fails | API domain proxied during ACME | Grey-cloud the `A` record, retry, then re-proxy |
| Login works but emails never arrive | Provider keys unset/invalid | Verify `ZEPTOMAIL_*` / `TERMII_*`, test send |
