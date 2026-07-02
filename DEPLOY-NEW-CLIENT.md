# CreditX — New-Client Provisioning Runbook (aaPanel + Cloudflare)

This runbook stands up a **fresh CreditX instance for a new client** from
scratch:

- **Backend** (Slim 4 / PHP / PostgreSQL / Redis) on an **aaPanel** server.
- **Frontends** (admin + customer portal Angular apps) on **Cloudflare
  Pages**.
- **Agent app** (Ionic/Capacitor) built as a mobile APK/IPA, or optionally
  served as a PWA on Cloudflare Pages.

It then covers the **operational setup for a new organization** (§12) — the
business configuration (chart of accounts, opening balances, products, fees,
penalties, approval workflows, settings, month-end routine, go-live test) an
administrator performs after the software is technically live.

> For **updating an already-deployed** instance, use [`DEPLOY.md`](DEPLOY.md)
> instead. This document is only for the first-time setup of a new tenant.

The platform root domain is **`creditx.cloud`**. Each client (`<CLIENT>` slug)
runs on its own subdomains under it. Throughout, replace these placeholders
with the client's real values:

| Placeholder | Example (`<CLIENT>` = `acme`) |
|---|---|
| `<CLIENT>` | `acme` (short slug, lowercase) |
| `<PORTAL_DOMAIN>` | `acme.creditx.cloud` |
| `<ADMIN_DOMAIN>` | `acme-admin.creditx.cloud` |
| `<API_DOMAIN>` | `acme-api.creditx.cloud` |
| `<DB_NAME>` / `<DB_USER>` / `<DB_PASS>` | `creditx_acme` / `creditx_acme` / *(generated)* |
| `/www/wwwroot/creditx` | the per-client site directory aaPanel creates when you Add Site — i.e. `/www/wwwroot/<API_DOMAIN>` (e.g. `/www/wwwroot/acme-api.creditx.cloud`). Substitute it everywhere. |

> A client that wants full brand ownership can instead **bring their own
> domain** (e.g. `portal.firstmfb.com`) via Cloudflare for SaaS custom
> hostnames — the exception, not the default. Everything below assumes the
> shared `creditx.cloud` scheme.

The platform-wide `creditx.cloud` setup (domain, wildcard certs) is done
**once for the whole platform** — see §0.1 — not per client.

---

## 0. Architecture & DNS overview

```
                         ┌─────────────────── Cloudflare ───────────────────┐
  Admin staff  ─────────▶│  Pages:  <ADMIN_DOMAIN>   (creditx-admin)         │
  Customers    ─────────▶│  Pages:  <PORTAL_DOMAIN>  (creditx-portal)        │
                         │  <API_DOMAIN>  ── proxied ─────────┐              │
                         └────────────────────────────────────┼──────────────┘
                                                  │  HTTPS (Origin cert, Full strict)
                                                  ▼
  Agents (mobile app) ───────────────▶  ┌──── 159.195.82.117 (aaPanel) ────┐
                                         │  Nginx site per client → its dir  │
                                         │  PHP-FPM 8.2/8.3                   │
                                         │  Shared PostgreSQL + Redis        │
                                         │   (per-client DB + REDIS_PREFIX)  │
                                         │  Cron workers                     │
                                         └───────────────────────────────────┘
```

**Flat single-label scheme** (all under the free `*.creditx.cloud` cert — no
paid ACM). **Per-client DNS records** (in the `creditx.cloud` Cloudflare zone):

| Type | Name | Target | Proxy |
|---|---|---|---|
| `A` | `<CLIENT>-api` (→ `<API_DOMAIN>`) | `159.195.82.117` | Proxied (orange) |
| `CNAME` | `<CLIENT>-admin` (→ `<ADMIN_DOMAIN>`) | Cloudflare Pages project | Proxied (orange) |
| `CNAME` | `<CLIENT>` (→ `<PORTAL_DOMAIN>`) | Cloudflare Pages project | Proxied (orange) |

> The two Pages CNAMEs are created **automatically** when you attach the custom
> domain in each Pages project (§9) — so per client you really only add the one
> **`<CLIENT>-api` A record** by hand.

> Because the origin sits behind Cloudflare with a **Cloudflare Origin CA cert**
> covering `*.creditx.cloud` (§0.1 / §6), the API host stays **proxied (orange)
> from day one** — no grey-cloud/ACME dance. Zone SSL mode = **Full (strict)**.

---

## 0.1 Platform domain setup — `creditx.cloud` (ONE-TIME, whole platform)

Do this **once** when standing up the platform — not per client. It makes
every future client a DNS-only add.

### Subdomain scheme (flat, single-label)

Each client gets three **single-label** subdomains under `creditx.cloud`, so the
**one free `*.creditx.cloud` Universal cert covers all of them** — no paid
Advanced Certificate Manager:

| Surface | Pattern | Example (`acme`) | Cert |
|---|---|---|---|
| Customer portal | `{client}.creditx.cloud` | `acme.creditx.cloud` | `*.creditx.cloud` (free Universal) |
| Admin console | `{client}-admin.creditx.cloud` | `acme-admin.creditx.cloud` | `*.creditx.cloud` (free Universal) |
| Backend API | `{client}-api.creditx.cloud` | `acme-api.creditx.cloud` | `*.creditx.cloud` (free Universal) |

> **Why flat, not nested** (`acme.api.creditx.cloud`): Cloudflare's free wildcard
> only covers **one** label level, so nested hosts would need the paid ACM add-on
> and otherwise fail with `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`. Single-label
> hosts all sit directly under `*.creditx.cloud` → free.

The **agent mobile app** builds `{client}-api.creditx.cloud` automatically from
the org code the agent enters (see §10) — no per-client DNS beyond the API `A`
record.

### This platform's topology (confirmed)

- **One shared aaPanel server** hosts **every client's backend and database**.
  Public IP: **`159.195.82.117`**.
- **Shared PostgreSQL + Redis daemons** on that box; tenants are isolated by a
  **separate database per client** and a **unique `REDIS_PREFIX`** (see §3.1).
- **One Nginx site per client** (`{client}-api.creditx.cloud`), each pointing at
  that client's own code directory + `.env`. Portals/admins are static and live
  on **Cloudflare Pages** (not this server).

```
   Cloudflare (edge TLS, proxied)             ┌──────────── 159.195.82.117 (aaPanel) ─────────────┐
  *.creditx.cloud (free cert) ─┬─ Pages: portals  │ site acme-api.creditx.cloud → /www/wwwroot/acme-api…│
                               ├─ Pages: admins    │ site bmfb-api.creditx.cloud → /www/wwwroot/bmfb-api…│
                               └─ A {slug}-api → 159.195.82.117 ▶│ … shared PostgreSQL + Redis (per-DB/prefix)│
                                                  └────────────────────────────────────────────────────┘
```

### One-time steps

1. **Register `creditx.cloud`** and add it as a zone in Cloudflare (done). Point
   the registrar's nameservers at Cloudflare's.
2. **Reserve system labels** so no client slug can shadow them — never issue a
   client the slug: `www`, `app`, `api`, `admin`, `portal`, `id`, `auth`,
   `status`, `docs`, `help`, `billing`, `console`, `dashboard`, `cdn`, `static`,
   `mail`, `support`. (Enforce with a slug validator at onboarding:
   lowercase, `[a-z0-9-]`, length 2–40, not in the reserved set.)
3. **Edge cert — nothing to buy.** The **free Universal `*.creditx.cloud`**
   certificate already covers every single-label host (`acme.creditx.cloud`,
   `acme-admin.creditx.cloud`, `acme-api.creditx.cloud`). Just confirm Universal
   SSL is **On** (SSL/TLS → Edge Certificates). No Advanced Certificate Manager
   needed.
4. **Origin cert on the shared server (once).** Cloudflare → **SSL/TLS → Origin
   Server → Create Certificate** for **`*.creditx.cloud`** (and `creditx.cloud`),
   15-year. Install it once in aaPanel; **every** client API site reuses this one
   cert (§6). Then set the zone SSL/TLS mode to **Full (strict)**.
5. **Two Cloudflare Pages projects** — one for the admin app, one for the portal
   (each is one build serving all clients, §8/§9). Attach each client's custom
   domain to them as clients come online (`{client}-admin.creditx.cloud` →
   admin project; `{client}.creditx.cloud` → portal project) — Pages auto-creates
   the CNAME + issues the edge cert.
6. **(Optional) white-label** — enable **Cloudflare for SaaS** if some clients
   bring their own domain (`portal.firstmfb.com` → CNAME to the platform);
   custom hostnames get certs issued automatically.

After §0.1, provisioning a new client is: create its database, **Add Site
`<API_DOMAIN>` in aaPanel** (creates the directory) + deploy code, fill its
`.env`, add the one **`<CLIENT>-api` A record**, and attach its two custom
domains to the Pages projects — **no new certificate**, and the frontends need
**no rebuild** (they auto-derive the API from their hostname, §8).

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

## 3. Create the aaPanel website, then deploy the code

**Create the site first — aaPanel creates the per-client directory.** Don't
`git clone` a directory by hand; let aaPanel make it, then deploy into it.

1. aaPanel → **Website → Add site**:
   - **Domain:** `<API_DOMAIN>` (e.g. `acme-api.creditx.cloud`)
   - **PHP version:** 8.2 or 8.3 (from §1)
   - This creates the site directory **`/www/wwwroot/<API_DOMAIN>`** — that is
     this client's directory.

   > **Path convention:** in the rest of this doc, `/www/wwwroot/creditx` means
   > this per-client site directory `/www/wwwroot/<API_DOMAIN>` (e.g.
   > `/www/wwwroot/acme-api.creditx.cloud`). Substitute accordingly in every
   > command and cron path below.

2. Deploy the CreditX code **into that directory** (replacing aaPanel's default
   placeholder files):

```bash
cd /www/wwwroot/<API_DOMAIN>
rm -f index.html 404.html .htaccess 2>/dev/null || true   # aaPanel placeholders
git clone <REPO_URL> .            # clone INTO the site directory
cd backend
composer install --no-dev --optimize-autoloader --no-interaction
```

> **Shared server:** every client is its own aaPanel **site** → its own
> `/www/wwwroot/<API_DOMAIN>` directory, `.env`, and database. The PostgreSQL
> and Redis daemons are shared; isolation comes from a per-client `DB_NAME` and
> `REDIS_PREFIX` (§3.1). Finalize the site's run directory + rewrite in §5.

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

### 4.5 Legacy data migration (clients coming from FTI Pay)

If this client is migrating from the legacy **FTI Pay** system (MySQL
`u931799113_ftipay`), import its master data now — after §4's schema + seed,
before the operational config in §12. The repo ships idempotent, dry-runnable
importers.

**Migrated:** government records (IPPIS / TESCOM / LASG / SUBEB), staff users,
loan products (+ standard fees), customers (+ next of kin).

**NOT migrated:** historical **loans, repayment schedules, and GL/ledger
balances**. Bring the financial position over as **opening balances** (§12.4);
if you need in-flight loans, load their repayment schedules separately. The
importers cover *who/what*, not the historical loan book.

**Prerequisites**

1. **`pdo_mysql` PHP extension** on the server (aaPanel → PHP → Install
   extensions) — the importers read the legacy MySQL directly (this is in
   addition to `pdo_pgsql` from §1).
2. The legacy MySQL reachable from the server (host + credentials).
3. Schema created and **seeded** (§4) — `seed.php` provides the record types +
   roles the importers map onto.
4. Add the legacy source to `backend/.env` (it's **not** in `.env.example` —
   add it by hand):

   ```ini
   LEGACY_DB_HOST=127.0.0.1
   LEGACY_DB_PORT=3306
   LEGACY_DB_NAME=u931799113_ftipay
   LEGACY_DB_USER=<legacy_user>
   LEGACY_DB_PASSWORD=<legacy_pass>
   ```

**Run order — always `--dry-run` first, reconcile counts, then apply**

```bash
cd /www/wwwroot/<API_DOMAIN>/backend

# 1. Government records + users
php bin/migrate-legacy.php --dry-run
php bin/migrate-legacy.php
#    flags: --skip-records / --skip-users to run one side only

# 1b. Branch locations + user→location mapping (needs step 1's users).
#     The legacy branch column is auto-detected — the --dry-run prints which
#     column it picked and the branch list; CONFIRM that before applying.
php bin/migrate-legacy-locations.php --dry-run
php bin/migrate-legacy-locations.php
#    if auto-detect picks the wrong column: --list-columns to see them, then
#    --branch-col=NAME  (or --branch-table=NAME --branch-label-col=NAME for a
#    lookup table). Also sets is_agent on role=agent users (--no-agent-flag to skip).

# 2. Loan products + standard fees (idempotent; skips existing by code)
php bin/migrate-products.php

# 3. Customers + next of kin — needs step 1 (joins customers to government
#    records by service_id → staff_id)
php bin/migrate-customers.php --dry-run
php bin/migrate-customers.php
#    flag: --limit=N to import a first batch and eyeball it
```

All of these are **idempotent** — re-running skips rows that already exist
(records by key, products by code, customers by `staff_id`, locations by
code, user→location links by pair).

**After migration**

- Spot-check in the admin app: Customers, Government Records, Loan Products,
  Users (confirm role + branch assignments — legacy role mapping may need a
  review).
- Post **opening balances** (§12.4) so the GL and reports tie out, then
  continue with operational config (§12).

---

## 5. Finalize the aaPanel website (run directory + rewrite)

The site itself was created in §3 (that's what made the directory). Now point
it at the Slim front controller:

1. **Site → Site directory → Running directory**: set to `/backend/public`
   (the Slim front controller is `backend/public/index.php`).
2. **Site → Config / Pseudo-static (URL rewrite)** — route all requests to the
   front controller:

   ```nginx
   location / {
       try_files $uri $uri/ /index.php?$query_string;
   }
   ```

3. **Site → PHP version**: confirm 8.2 or 8.3 (set at creation in §3).
4. Confirm directory permissions: `chown -R www:www /www/wwwroot/<API_DOMAIN>`.

---

## 6. SSL for the API

**Recommended for this platform — one Cloudflare Origin CA cert for all
clients (do the install once):**

Because every client API site sits behind Cloudflare on the shared server, a
single **Cloudflare Origin CA** wildcard cert covers them all — no Let's
Encrypt, no ACME, no per-client cert.

1. Cloudflare → **SSL/TLS → Origin Server → Create Certificate**. Hostnames:
   **`*.creditx.cloud`** (and `creditx.cloud`) — this covers every client's
   `{slug}-api.creditx.cloud`. Copy the **certificate** and **private key**
   (RSA, 15-year validity).
2. On the server, save them once, e.g.
   `/www/server/panel/vhost/cert/creditx-origin/fullchain.pem` and `privkey.pem`.
3. For each client's aaPanel site → **SSL → Custom** → paste the **same** cert +
   key (or point the vhost at the shared files). Enable **Force HTTPS**.
4. Cloudflare → **SSL/TLS → Overview** → set mode to **Full (strict)**.

The API host stays **proxied (orange)** the whole time. Adding a client later
reuses this cert — nothing to issue.

Verify:

```bash
curl -sI https://<API_DOMAIN>/api/banks | head -1     # expect: HTTP/2 200
```

> **Alternative (origin not behind Cloudflare):** issue a per-vhost **Let's
> Encrypt** cert in aaPanel instead — but then the `A` record must be
> **grey-clouded (DNS-only)** during ACME issuance, then re-proxied. The Origin
> CA path above avoids this entirely and is preferred here.

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

## 8. Frontend → API wiring (automatic, one build for all clients)

The admin and portal apps **derive their API base from their own hostname at
runtime** (`src/environments/resolve-api-url.ts`), so **one build serves every
client** — no per-client branch, no per-client edit, no rebuild when adding a
tenant. On any `*.creditx.cloud` host the app takes the tenant slug from the
first DNS label and builds the API URL:

| App host | Derived API |
|---|---|
| `acme.creditx.cloud` (portal) | `https://acme-api.creditx.cloud/api` |
| `acme-admin.creditx.cloud` (admin) | `https://acme-api.creditx.cloud/api` |

Off-platform hosts (localhost, `*.pages.dev`, `*.github.io`, the bare apex)
fall back to the `resolveApiUrl(...)` fallback — used only for local dev /
previews.

**Scheme (already set to flat):** the API URL template lives at the top of
`resolve-api-url.ts` in **both** apps and is set to the **flat**, free-cert
scheme (`https://{slug}-api.creditx.cloud/api`). If you ever move to the nested
scheme (needs the paid ACM `*.api.creditx.cloud` cert), switch it to
`https://{slug}.api.creditx.cloud/api` in both files.

> The trailing `/api` is required — backend routes are mounted under `/api`.

A SPA fallback file is already committed at `public/_redirects` in both apps
(`/* /index.html 200`) for Cloudflare Pages. (For **GitHub Pages**, copy
`index.html` → `404.html` in the build output instead — Pages ignores
`_redirects`.)

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

## 10. Agent mobile app (multi-tenant, single binary)

`creditx-agent` is an Ionic + Capacitor app. It ships as **one native binary
that serves every client** — it does **not** bake a per-client API URL. On
first launch the agent enters their **organization code** (the client slug);
the app builds `https://{slug}-api.creditx.cloud/api`, validates it against the
tenant's public settings, stores it, and points all requests there. "Switch
Organization" (Profile) clears it.

### 10.1 What each new client needs (usually nothing app-side)

- The client's backend must be reachable at `https://<CLIENT_SLUG>-api.creditx.cloud`
  (the flat single-label API host — see §0.1).
- Give the client's agents their **org code** (`<CLIENT_SLUG>`). That's it —
  no rebuild, no new store listing.
- Optionally set the tenant's **minimum supported app version** so old installs
  are forced to update: Settings key `mobile.min_agent_version` (semver, e.g.
  `1.2.0`). The app compares its build's `appVersion` and blocks if older.

### 10.2 Build & release (done once per app version, not per client)

```bash
cd creditx-agent
# Confirm the tenant template + this build's version in
# src/environments/environment.prod.ts:
#   apiUrlTemplate: 'https://{slug}-api.creditx.cloud/api'
#   requireTenantSelection: true
#   appVersion: '1.0.0'   # bump on each release
npm ci
npm run build:prod
npx cap sync
# then build the signed APK/IPA in Android Studio / Xcode and submit to stores
```

> **CORS / native HTTP:** the app enables **`CapacitorHttp`** in
> `capacitor.config.ts`, so on device all HTTP goes through the native stack
> and **CORS does not apply** — no tenant needs to whitelist the Capacitor
> origin for the mobile app. (A browser-based/PWA build of the agent app is
> the exception: it still needs its origin in each tenant's
> `CORS_ALLOWED_ORIGINS`.) Caveat: native HTTP doesn't emit upload progress
> events, so document-upload progress bars are indeterminate on device.

### 10.3 White-label per client (optional premium)

If a client wants their **own** branded app in their **own** store account,
build a dedicated binary with `requireTenantSelection: false` and
`apiUrl: 'https://<CLIENT_SLUG>-api.creditx.cloud/api'` baked into
`environment.prod.ts`, then submit under the client's developer account. This
is the exception, not the default.

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

## 12. Operational setup for a new organization

Everything above makes the software *run*. This section makes the org *operational* —
the business configuration an administrator performs in the admin app before
go-live. Do these **in order**: later steps depend on earlier ones (you can't
create a loan product's approval workflow before the product exists, can't
disburse before a bank GL and an open period exist, etc.).

All steps are in the **admin app** (`https://<ADMIN_DOMAIN>`) unless noted.
Each references the left-nav screen by name.

### 12.1 People & access (System group)

1. **Replace the seed admin** — see §4.1 if not already done.
2. **Locations** → create the org's **branches** (head office + each branch).
   Branches scope loans, agents, and reporting.
3. **Departments** and **Teams** → create as needed for staff org structure
   and approval routing.
4. **Roles** → review the seeded roles (`super_admin`, and the operational
   roles). Create/adjust roles and tick the exact **permissions** each needs.
   Key permission families: `customers.*`, `loans.*`, `payments.*`,
   `accounting.*` (`view`, `journal`, `provision`, `close`, `budget`),
   `reports.*`, `products.*`, `users.*`, `roles.*`, `locations.*`.
   - For **segregation of duties**, give *makers* (e.g. loan officers) create
     permissions and *checkers* (e.g. managers) the approval permissions —
     this is what the maker-checker toggles (§12.7) and the 2-level
     registration approval rely on.
5. **Users** → create each staff member, set their role(s), branch, and
   department. They receive credentials per your onboarding process.

### 12.2 Branding & general settings (Settings)

**Settings → General** (these drive both apps via the public settings endpoint):

| Setting key | Purpose | Typical value |
|---|---|---|
| `general.company_name` | Brand name on login, portal, exports | `<Client> MFB` |
| `general.currency` | ISO currency code | `NGN` |
| `general.currency_symbol` | Symbol shown in money fields | `₦` |
| `general.support_email` | Shown to customers | `support@<client>` |
| `general.date_format` | Display format | `Y-m-d` |

### 12.3 Chart of accounts (Accounting)

`seed.php` ships a full MFB chart. Review and tailor it under **Accounting**
(Chart of Accounts tab):

1. **Rename** any account to the org's wording — click the pencil; the account
   **name**, type, description and active flag are editable. The account
   **code** is intentionally locked (services post by code — changing it would
   break postings).
2. **Add org-specific accounts** the org actually uses — e.g. a GL per real
   bank account (`BANK2`, `BANK3`…), additional expense lines, etc. Pick the
   correct **account type** (asset/liability/equity/income/expense) and a
   unique code + number.
3. **Do NOT delete these control accounts** — the engine resolves them by code:

   | Code | Used by |
   |---|---|
   | `LR`, `CUBGL` | Loan receivable + per-customer wash account (disbursement/repayment) |
   | `BANK`, `SETTLE`, `VAULT` | Disbursement settlement, payoff, cash |
   | `II`, `INTRECV`, `INTSUSP` | Loan interest income, accrued receivable, NPL suspense |
   | `PI` | Penalty income |
   | `ALLOW`, `LLP` | Loan-loss allowance + provision expense |
   | `RETEARN`, `OBE` | Retained earnings, opening-balance equity |
   | `CUSTDEP`, `INTPAY`, `INTEXP` | Deposits liability, deposit interest payable/expense |
   | `ACCRPAY`, `TAXPAY` | Accounts payable, tax payable |
   | `FIXASSET`, `ACCDEP`, `DEPEXP` | Fixed assets, accumulated depreciation, depreciation expense |

### 12.4 Opening balances (only if migrating from another system)

If the org has an existing book, post its trial balance as **opening balances**
so reports tie out from day one:

1. Make sure the target **accounting period is open** (§12.5).
2. **Accounting → Post Opening Balances** — enter each GL's opening debit/credit.
   The contra account **`OBE` (Opening Balance Equity)** absorbs the difference
   and should net to **zero** once the full trial balance is entered.
3. Verify **Reports → Trial Balance** shows `is_balanced = true` and `OBE` = 0.
4. For **in-flight loans** being migrated, also load their repayment schedules
   so outstanding balances, top-up carry-forward, payoff quotes and provisioning
   compute correctly. (Loan interest already recognised in the old system stays
   recognised; accrual is forward-looking — see the accrual note in §12.10.)

### 12.5 Accounting periods (Period Close)

1. **Period Close** → ensure the **current month's period is OPEN** before any
   posting. Postings into a non-open period are rejected by the period guard.
2. Establish the **month-end close routine** (see §12.10). Periods are closed
   after all month-end runs and reconciliations; they can be reopened if a
   correction is needed.

### 12.6 Loan products, fees & penalties

1. **Loan products** → create each product:
   - **Interest method**: `flat_rate`, `reducing_balance`, or `amortized`.
   - **Interest rate** — entered as the **monthly** rate (e.g. `0.05` = 5%/month).
   - Tenure bounds, min/max principal, bank-statement mode if used.
2. **Fees** (Fee Types + Product Fees) per product:
   - For each fee set **calculation type** (flat / percentage), **value**,
     **applies to** (`principal` or `gross_loan`), and **effect**:
     `adds_to_gross` (customer repays it over the schedule) vs
     `deducted_from_disbursement` (taken upfront from net disbursed).
   - Map each fee to its **income GL** (e.g. admin fee → `AA`, management → `MFA`).
3. **Penalty Rules** (Penalty Rules screen) per product:
   - Grace-period days, **flat or percentage** value, optional max cap.
   - **"Only penalise after the loan's maturity date"** — tick this if the org
     only charges penalties once the *whole loan* matures (interim late
     installments are flagged overdue but not penalised). This is also
     available globally via `penalty.apply_after_maturity_only` (§12.7).

### 12.7 Operational settings (Settings)

Tune these to the org's policy. Defaults shown; all are live without redeploy.

| Setting key | Default | Meaning |
|---|---|---|
| `approval.default_mode` | `sequential` | Default approval mode for new workflows |
| `approval.conditional_routing_enabled` | `true` | Honour routing conditions (DSR etc.) |
| `affordability.max_dsr` | `0.40` | DSR soft-limit flagged to reviewers / routable |
| `penalty.default_grace_period_days` | `5` | Default grace when creating penalty rules |
| `penalty.overdue_check_enabled` | `true` | Daily overdue detection on/off |
| `penalty.apply_after_maturity_only` | `false` | Global "penalty only after maturity" |
| `penalty.payment_allocation_order` | `["penalty","interest","principal"]` | Repayment allocation priority |
| `topup.calc_method` | `principal_minus_current` | Top-up carry-forward rule (or `full_outstanding`) |
| `loan.liquidation_charge_mode` | `subtotal_pct` | Payoff liquidation basis (`subtotal_pct`/`principal_pct`/`flat`) |
| `loan.liquidation_charge_value` | `0.012` | Liquidation charge (1.2% of subtotal by default) |
| `registration.require_approval` | `true` | Hold portal sign-ups for **2-level** staff approval |
| `security.maker_checker_disbursement` | `true` | Require checker for disbursements |
| `security.maker_checker_write_off` | `true` | Require checker for write-offs |
| `security.maker_checker_reversal` | `true` | Require checker for reversals |
| `security.maker_checker_gl_entry` | `false` | Require checker for manual journals |
| `notification.email_enabled` / `sms_enabled` / `push_enabled` | `true` | Channel kill-switches |

### 12.8 Approval workflows (Approval Workflows)

For **each loan product**, build its approval pipeline:

1. **Approval Workflows** → New → pick the product, set **mode** (sequential /
   parallel), then add ordered **steps** (each tied to an approver **role**,
   with optional SLA hours / auto-approve).
2. Mark a step **Conditional** to keep it out of the always-on path, then add a
   **Routing Condition** that injects it — e.g. `DSR > 0.4`, `amount >
   5,000,000`, `loan_type = top_up`. Conditions evaluate on submission.
3. Test: submit a sample loan that should and shouldn't trip the condition.

### 12.9 Deposits, tax, vendors, assets

- **Deposit Products** → create savings/current/term products: interest method
  (`min_balance_monthly` / `daily_balance_monthly` / `none`), rate, minimum
  balance, withdrawal policy, dormancy days. Then customers' **Deposit Accounts**
  can be opened and **Interest Run** posts monthly deposit interest.
- **Tax (VAT/WHT)** → review the seeded rates (VAT 7.5%, WHT 5% / 10%); add any
  org-specific rates. These feed WHT-on-payment (Accounts Payable) and the tax
  remittance flow.
- **Accounts Payable** → add **Vendors** the org pays; capture/approve/pay
  **Bills** (WHT withheld at payment when a rate is chosen).
- **Fixed Assets** → register existing assets. For assets already on the books,
  leave the funding GL blank (no acquisition posting); for new purchases set a
  funding GL (e.g. `BANK`) so `DR Fixed Assets / CR <funding>` posts.
- **Government Records** (if the org uses **agent** onboarding with government
  verification) → import the government staff records agents must match against.
  The **self-service portal** never checks government records — it serves any
  individual, including the self-employed.

### 12.10 Month-end operations routine

Run this each accounting month (most are admin-triggered; the cron jobs in §7
cover interest accrual and depreciation automatically — preview them first):

1. **Provisions** → run loan-loss provisioning (CBN classification) as of month-end.
2. **Interest Accrual** → preview, then post the month's loan-interest accrual
   (also scheduled via cron; the screen lets you review/reverse).
3. **Fixed Assets / Depreciation** → post the month's depreciation (also cron).
4. **Interest Run** (deposits) → post deposit interest for the period.
5. **Tax (VAT/WHT)** → review tax payable; **remit** to the authority.
6. **Bank Reconciliation** → import each bank statement, auto/manual match,
   confirm the difference is reconciled.
7. **GL Reconciliation** / **Reconciliation** → confirm control accounts tie to
   sub-ledgers (no orphan postings).
8. **Reports** → review Trial Balance, Income Statement, Balance Sheet, Cash
   Flow, Aged Receivables, PAR/NPL, and **CBN Returns**.
9. **Period Close** → close the month once everything reconciles.

### 12.11 Go-live verification (end-to-end)

Before handing over, walk one full cycle on real config:

1. **Customer** → register on the portal → verify email (OTP) → approve the
   registration **twice** (two different staff) → confirm the **Verified badge**.
2. **Loan** → apply (with employment + income) → confirm it routes through the
   product's **approval workflow** (and trips any DSR condition) → **disburse**
   (pick a real bank GL; if maker-checker is on, a checker approves) → confirm
   the GL journal and repayment schedule.
3. **Repayment** → post a repayment; confirm interest income is recognised.
4. **Payoff** → open a loan's **Payoff**, verify the quote (remaining principal
   + current interest + 1.2% liquidation + arrears), tick "I have made the
   payment", choose **Full**, pick the payoff bank GL, confirm the loan closes.
5. **Deposit** → open a deposit account, post a deposit and a withdrawal.
6. **Accounting** → confirm Trial Balance is balanced after all of the above.

---

## 13. Per-client checklist (copy this into the client's ticket)

**Platform (one-time, §0.1) — do once, not per client:**
- [ ] `creditx.cloud` Cloudflare zone active; **Universal SSL on** (free `*.creditx.cloud` — no ACM)
- [ ] Cloudflare **Origin CA** cert (`*.creditx.cloud`) installed on the server; zone SSL = **Full (strict)**
- [ ] Two Pages projects (admin, portal) created; reserved system labels enforced by the slug validator

**Per client:**
- [ ] `A <CLIENT>-api → 159.195.82.117` (proxied) added; two custom domains attached to the Pages projects (auto-CNAMEs)
- [ ] aaPanel **Add Site** `<API_DOMAIN>` (creates `/www/wwwroot/<API_DOMAIN>`); code deployed into it; own database on shared PostgreSQL
- [ ] aaPanel: PHP 8.2/8.3 + extensions, PostgreSQL, Redis installed
- [ ] Database + dedicated user created
- [ ] `.env` filled (unique `JWT_SECRET`, unique `REDIS_PREFIX`, CORS origins)
- [ ] Schema created (`doctrine schema-tool` + `init-*` scripts)
- [ ] `seed.php` run; **default admin replaced/deleted**
- [ ] Notification templates seeded
- [ ] (Legacy clients only, §4.5) `pdo_mysql` + `LEGACY_DB_*` set; migrate-legacy → products → customers run (dry-run first); opening balances posted
- [ ] aaPanel site running-directory = `/backend/public`, rewrite rule set
- [ ] API SSL issued + Force HTTPS; `curl` returns 200
- [ ] Cron jobs added (SLA, overdue, reconciliation)
- [ ] Frontend API URL auto-derives (no per-client edit); scheme template in `resolve-api-url.ts` matches DNS/cert choice
- [ ] Cloudflare Pages projects built with output `dist/<app>/browser`
- [ ] Custom domains attached; SPA `_redirects` working (deep-link refresh)
- [ ] Provider keys live (mail, SMS, Paystack, FCM) and test-sent
- [ ] Smoke test passed (login, loan application, approval routing)
- [ ] Firebase service-account JSON uploaded (if push needed)

**Operational (§12) — business go-live:**
- [ ] Branches, departments, teams, roles created; staff users assigned
- [ ] General settings: company name, currency, support email
- [ ] Chart of accounts reviewed/renamed; org bank GLs added; control accounts intact
- [ ] Opening balances posted + OBE nets to zero (if migrating)
- [ ] Current accounting period OPEN
- [ ] Loan products + fees + penalty rules configured
- [ ] Operational settings tuned (penalty, top-up, liquidation, maker-checker, registration approval)
- [ ] Approval workflow per product (with any DSR/amount routing conditions)
- [ ] Deposit products, tax rates, vendors, fixed assets set up as applicable
- [ ] Government records imported (if agent onboarding is used)
- [ ] Month-end routine documented with the operations team
- [ ] End-to-end go-live test passed (register→approve→apply→disburse→repay→payoff; deposit; period close)

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
