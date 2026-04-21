# Deploy — Loan Math Correction (Fee Effect Rework)

Target state: production calculates loan numbers matching the legacy
CreditX reference screenshot for any given product/amount/tenure.

Commits this deploy picks up:

```
b76f858  feat(migrate,phase-4): add effect backfill migration + restructure runner
6428d85  feat(fees,phase-3): admin UI — effect dropdown + applies_to selector per fee
227a0dd  feat(fees,phase-2): rewrite LoanCalculationService to match legacy math
4094fb4  feat(fees,phase-1): add FeeEffect enum — adds_to_gross vs deducted_from_disbursement
5f16599  feat(migrate): one-shot data migration — percentage fees to fraction form
e010355  fix(admin): teach the fraction convention for rates and % fees
f2766e1  fix: decimal-string type casts + avatar_url in User::toArray
46b9584  chore(deploy): remove deploy.sh, document manual deploy in DEPLOY.md
7083c15  fix(storage): avatar serving — add /api/storage alias + graceful fallback
cb0c5c9  feat(users): email new password to user on admin-initiated reset
```

Plus earlier pending commits that may not yet be on the server (schema
update for is_agent column, type-cast fixes, etc.).

---

## Pre-flight on the server

```bash
# What HEAD is currently deployed?
cd /www/wwwroot/creditx
git log --oneline -1

# What's in origin?
git fetch --prune
git log --oneline origin/main -1

# Difference
git log --oneline HEAD..origin/main
```

Expect to see ~10 commits in the diff if you haven't deployed since
`5c989b0` (fix font-scale).

Also verify env:

```bash
grep APP_URL /www/wwwroot/creditx/backend/.env
# Must be: APP_URL=https://api.dostsuite.com
# If it says localhost, fix it before deploying — avatar_url will
# be built with whatever is here.
```

---

## The deploy sequence

Run each block in order. Stop and report back if any block errors.

### 1. Pull

```bash
cd /www/wwwroot/creditx
git stash push -u -m "runtime" -- backend/storage backend/public/.well-known backend/public/storage 2>/dev/null || true
git pull --ff-only origin main
git stash pop 2>/dev/null || true
git log --oneline -1   # confirm HEAD is b76f858 (or newer)
```

### 2. Composer

```bash
cd /www/wwwroot/creditx/backend
composer install --no-dev --optimize-autoloader --no-interaction
```

### 3. Schema update — adds is_agent, monthly_target, effect columns

```bash
# Preview first
php bin/doctrine orm:schema-tool:update --dump-sql

# Expected: at minimum, adds 'is_agent', 'monthly_target' to users,
# and 'effect' to product_fees.

# Apply
php bin/doctrine orm:schema-tool:update --force --complete
```

### 4. Clear caches

```bash
rm -rf var/cache var/proxies
mkdir -p var/cache/doctrine var/proxies
chown -R www:www var/cache var/proxies 2>/dev/null || \
chown -R www-data:www-data var/cache var/proxies 2>/dev/null || \
chown -R nginx:nginx var/cache var/proxies
```

### 5. Opcache reload BEFORE warmup

```bash
# Find service unit name
systemctl list-units --state=active --type=service | grep fpm
# Then reload (substitute the actual name)
sudo systemctl reload php-fpm
```

### 6. Doctrine cache warmup

```bash
cd /www/wwwroot/creditx/backend
php -d memory_limit=512M bin/cache-warmup.php
```

### 7. Opcache reload AFTER warmup

```bash
sudo systemctl reload php-fpm
```

### 8. Data migration — dry-run

```bash
cd /www/wwwroot/creditx/backend
php bin/migrate.php
```

Expected output (something like):

```
Migration 1: percentage values → fractional (divide by 100)
  2 row(s) will be changed:
    table          id                                     value (before) -> value (after)
    product_fees   <uuid>                                 2.000000       -> 0.020000
    product_fees   <uuid>                                 2.000000       -> 0.020000

Migration 2: product_fees.effect → adds_to_gross (by fee code)
  2 row(s) will be changed:
    product_fee.id                              code  fee name             effect (before)               -> effect (after)
    <uuid>                                      AF    Admin Fee            deducted_from_disbursement    -> adds_to_gross
    <uuid>                                      IF    Insurance Fee        deducted_from_disbursement    -> adds_to_gross

Summary: 4 row(s) across 2 migration(s) would change.
Dry-run only. To apply:
  php bin/migrate.php --apply
```

Review the plan. If anything looks wrong, STOP and report the output.

### 9. Data migration — apply

```bash
php bin/migrate.php --apply --yes
```

Expected last lines:

```
✓ All migrations committed successfully.

Post-migration verification:
  ✓ Percentage rows with value >= 1: 0
  ✓ Admin/Insurance fees not adds_to_gross: 0
```

### 10. Frontend builds

```bash
cd /www/wwwroot/creditx/creditx-admin
npm run build:prod

cd /www/wwwroot/creditx/creditx-agent
npm run build:prod
```

---

## Verify

### 10.1 Login works (no is_agent column error)

```bash
curl -sX POST https://api.dostsuite.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<admin-email>","password":"<password>"}' | python3 -m json.tool | head -20
```

### 10.2 Loan calculation matches legacy screenshot

```bash
TOKEN="<paste-from-login>"
curl -sX POST https://api.dostsuite.com/api/loan-products/calculate \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"product_id":"c89938fa-3227-46a1-bd0e-90c80ba67b1f","amount":500000,"tenure":12,"bank_statement_mode":"generated_by_company"}' \
  | python3 -m json.tool
```

Expected values:

```
app_amount:           500000
gross_loan:           512000.00    <-- principal + admin(2000) + insurance(10000)
net_disbursed:        489500.00    <-- principal - mgmt(10000) - bs(500)
mr_principal:         42667
mr_interest:          25600        <-- 0.05 × 512000
tr_principal:         512004
tr_interest:          307200       <-- 25600 × 12
mr_principal_interest: 68267
tr_principal_interest: 819204       <-- 68267 × 12
```

If any of these differ — stop and report the full response.

### 10.3 Admin UI — products form

- Navigate to Loan Products → edit the Personal Loan product
- Fees section now shows **Effect** column per row
  - Admin Fee: should read "Adds to Gross Loan" ✓
  - Insurance Fee: should read "Adds to Gross Loan" ✓
  - Management Fee: should read "Deducted from Disbursement" ✓
- For percentage fees, also shows **Base** column (Principal / Gross Loan)

### 10.4 Avatar renders

- Users list page should show profile photos
- If any avatar is missing on disk, it falls back to the initials tile
  (no broken-image icon)

---

## If something goes wrong

### The migration output shows unexpected rows

Stop and paste the dry-run output. I'll look at what's there before
proceeding.

### Calculate still returns wrong numbers after migration

```bash
# Verify the fee data is actually corrected
php -r 'require "vendor/autoload.php";
$dotenv=Dotenv\Dotenv::createImmutable(".");$dotenv->load();
$em=App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$rows=$em->getConnection()->fetchAllAssociative("
  SELECT ft.code,pf.calculation_type,pf.value,pf.effect,pf.applies_to
    FROM product_fees pf JOIN fee_types ft ON ft.id=pf.fee_type_id
    JOIN loan_products lp ON lp.id=pf.product_id
   WHERE lp.id=?", ["c89938fa-3227-46a1-bd0e-90c80ba67b1f"]);
foreach($rows as $r){print_r($r);}'
```

Expect:
```
AF  flat        2000.000000    adds_to_gross               principal
IF  percentage  0.020000       adds_to_gross               principal
MF  percentage  0.020000       deducted_from_disbursement  principal
```

### Login still fails with column error

Opcache didn't clear. Re-run step 7 (`sudo systemctl reload php-fpm`).
If that still doesn't work, verify the schema update actually ran by
connecting to postgres directly:

```bash
psql -U $(grep DB_USER .env | cut -d= -f2) \
     -d $(grep DB_NAME .env | cut -d= -f2) \
     -c "\d users" | grep is_agent
```

Should show the column. If missing, re-run step 3.

---

## Rollback

If the deploy fails catastrophically:

```bash
cd /www/wwwroot/creditx
git log --oneline -5     # find pre-deploy HEAD
git reset --hard <commit-before-b76f858>

# Data rollback: migrate.php's changes are NOT automatically reversible.
# The percentage fix (Migration 1) can be reversed by multiplying fixed
# rows by 100 — only do this if you're sure. Migration 2 (effect backfill)
# is reversed by setting affected rows back to 'deducted_from_disbursement',
# which is the DB default, or by DROP COLUMN + re-ADD if you're willing
# to lose any effect values set through the new admin UI.

# Cache + opcache must also be cleared after a code rollback:
cd backend
rm -rf var/cache var/proxies && mkdir -p var/cache/doctrine var/proxies
chown -R www:www var/cache var/proxies 2>/dev/null || \
chown -R www-data:www-data var/cache var/proxies 2>/dev/null || \
chown -R nginx:nginx var/cache var/proxies
sudo systemctl reload php-fpm
php -d memory_limit=512M bin/cache-warmup.php
sudo systemctl reload php-fpm
```
