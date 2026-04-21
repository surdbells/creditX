#!/usr/bin/env bash
#
# CreditX Production Deployment Script
# Run from project root on the production server (/www/wwwroot/creditx)
#
# Usage:
#   ./deploy.sh          # full deploy
#   ./deploy.sh --skip-schema   # skip the schema update step
#   ./deploy.sh --backend-only  # only backend (skip frontend builds)
#

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────
ROOT="${ROOT:-/www/wwwroot/creditx}"
PHP="${PHP:-php}"
NPM="${NPM:-npm}"

# ─── Flags ───────────────────────────────────────────────────────────────
SKIP_SCHEMA=0
BACKEND_ONLY=0
FRONTEND_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --skip-schema)   SKIP_SCHEMA=1 ;;
    --backend-only)  BACKEND_ONLY=1 ;;
    --frontend-only) FRONTEND_ONLY=1 ;;
    --help|-h)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

# ─── Helpers ─────────────────────────────────────────────────────────────
blue()   { printf '\033[1;34m%s\033[0m\n' "$*"; }
green()  { printf '\033[1;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m\n' "$*"; }
red()    { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

step() { blue ""; blue "━━━ $* ━━━"; }
ok()   { green "✓ $*"; }
warn() { yellow "⚠ $*"; }
die()  { red "✘ $*"; exit 1; }

# ─── Pre-flight ──────────────────────────────────────────────────────────
cd "$ROOT" || die "Cannot cd to $ROOT"
[[ -d .git ]] || die "Not a git repository: $ROOT"

step "CreditX deployment"
echo "  Root:         $ROOT"
echo "  Skip schema:  $SKIP_SCHEMA"
echo "  Backend only: $BACKEND_ONLY"
echo "  Frontend only:$FRONTEND_ONLY"
echo "  Current HEAD: $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"

# ─── Pre-flight: check for uncommitted changes ───────────────────────────
# Filter what we care about: changes to tracked source code (backend/src,
# config, frontend src, routes, deploy script itself). We tolerate:
#   - mode/timestamp-only changes on .gitkeep files (runtime writes)
#   - untracked runtime files in backend/public/.well-known, backend/public/storage
#     (these should be gitignored but might not be on older checkouts)
#   - composer.lock (picked up automatically by composer install)
# Anything else blocks the deploy.
SUSPICIOUS=$(git status --porcelain | awk '
  {
    status = substr($0, 1, 2); path = substr($0, 4);
    # Strip trailing renamed path marker
    sub(/ -> .*/, "", path);
    # Skip runtime noise
    if (path ~ /^backend\/storage\/(uploads|exports)\/\.gitkeep$/) next;
    if (path ~ /^backend\/public\/\.well-known\//) next;
    if (path ~ /^backend\/public\/storage\//) next;
    if (path ~ /^backend\/public\/storage$/) next;
    # Everything else is suspicious
    print $0;
  }
')

if [[ -n "$SUSPICIOUS" ]]; then
  red "✘ Uncommitted source changes detected in $ROOT:"
  echo "$SUSPICIOUS" | sed 's/^/    /' >&2
  red "  Commit, stash, or reset these before deploying."
  red "  (Runtime files in storage/ and public/.well-known are tolerated.)"
  exit 1
fi

# Note any tolerated runtime changes so the operator knows they were skipped
IGNORED=$(git status --porcelain | awk '
  {
    path = substr($0, 4); sub(/ -> .*/, "", path);
    if (path ~ /^backend\/storage\/(uploads|exports)\/\.gitkeep$/ ||
        path ~ /^backend\/public\/\.well-known\// ||
        path ~ /^backend\/public\/storage\//  ||
        path ~ /^backend\/public\/storage$/) print $0;
  }
')
if [[ -n "$IGNORED" ]]; then
  yellow "⚠ Tolerated runtime changes (not blocking):"
  echo "$IGNORED" | sed 's/^/    /'
fi

# ─── 1. Git pull ─────────────────────────────────────────────────────────
step "1/5 Pulling latest from git"
# Stash any runtime changes first so git pull --ff-only doesn't choke on them
STASHED=0
if [[ -n "$(git status --porcelain)" ]]; then
  git stash push -u -m "deploy.sh runtime stash $(date +%s)" -- \
    backend/storage backend/public/.well-known backend/public/storage >/dev/null 2>&1 && STASHED=1 || true
fi

git fetch --prune
BEFORE=$(git rev-parse HEAD)
git pull --ff-only origin main
AFTER=$(git rev-parse HEAD)

# Restore stashed runtime changes if any
if [[ $STASHED -eq 1 ]]; then
  git stash pop >/dev/null 2>&1 || warn "Could not pop runtime stash — inspect 'git stash list'"
fi

if [[ "$BEFORE" == "$AFTER" ]]; then
  warn "Already up to date — no changes"
else
  ok "Updated from $BEFORE to $AFTER"
  echo "  Changes since last deploy:"
  git log --oneline "$BEFORE".."$AFTER" | sed 's/^/    /'
fi

# ─── 2. Backend (unless --frontend-only) ────────────────────────────────
if [[ $FRONTEND_ONLY -eq 0 ]]; then
  step "2/5 Backend — composer + cache"
  cd "$ROOT/backend"

  if [[ -f composer.lock ]]; then
    composer install --no-dev --optimize-autoloader --no-interaction
    ok "composer install complete"
  fi

  # ─── Schema update ───────────────────────────────────────────────────
  if [[ $SKIP_SCHEMA -eq 0 ]]; then
    step "3/5 Doctrine schema update"
    # Use bin/doctrine (custom loader), NOT vendor/bin/doctrine (doesn't exist)
    if [[ -x bin/doctrine ]] || [[ -f bin/doctrine ]]; then
      # Preview first (dumps SQL without executing)
      yellow "  Preview (dry-run):"
      $PHP bin/doctrine orm:schema-tool:update --dump-sql 2>&1 | tail -20 | sed 's/^/    /' || true

      echo ""
      $PHP bin/doctrine orm:schema-tool:update --force --complete
      ok "Schema updated"
    else
      die "bin/doctrine not found or not executable"
    fi
  else
    warn "3/5 Schema update SKIPPED (--skip-schema)"
  fi

  # ─── Cache + opcache lifecycle ────────────────────────────────────────
  # Order matters here. The previous ordering (clear → warmup → opcache)
  # could leave stale Doctrine metadata on disk:
  #
  #   1. We wipe var/cache (fine).
  #   2. Warmup runs as a CLI process. If opcache.enable_cli=1 (surprisingly
  #      common on managed hosts like aaPanel / cPanel), the CLI process
  #      reuses opcache from the previous CLI invocation — which may have
  #      loaded the OLD Entity/User.php bytecode before the deploy pulled
  #      the new version.
  #   3. Warmup writes serialized metadata based on that stale bytecode.
  #   4. We reload php-fpm; now HTTP serves from fresh bytecode but reads
  #      the stale metadata file warmup just wrote. Semantical errors
  #      like 'Class ... has no field named isAgent' appear despite the
  #      entity code on disk having the field.
  #
  # New ordering: clear → reload php-fpm (resets BOTH web + CLI opcache
  # for systems that share the pool) → warmup. This guarantees warmup
  # loads fresh source and writes correct metadata.
  step "4/5 Cache clear + opcache reset + warmup"

  # Hardened clear: -rf with hidden files, and re-create the directories
  # with correct perms so the warmup doesn't fail on missing parents.
  rm -rf var/cache var/proxies 2>/dev/null || true
  mkdir -p var/cache/doctrine var/proxies 2>/dev/null || true
  # If running as root, make sure the webserver user can write
  if [[ $EUID -eq 0 ]]; then
    chown -R www:www var/cache var/proxies 2>/dev/null || \
    chown -R www-data:www-data var/cache var/proxies 2>/dev/null || \
    chown -R nginx:nginx var/cache var/proxies 2>/dev/null || true
  fi
  ok "Cache dirs reset"

  # Opcache reset — see detailed rationale below. Done BEFORE warmup now
  # so the warmup script executes against fresh PHP source. Also done
  # AGAIN after warmup (further down) to make sure HTTP workers pick up
  # the freshly written metadata cache files rather than serving older
  # bytecode of cache files that existed before the deploy.
  reload_opcache() {
    if ! command -v systemctl >/dev/null 2>&1; then
      return 1
    fi
    local unit
    unit=$(systemctl list-units --no-legend --state=active --type=service 2>/dev/null \
      | awk '/^php[0-9.]*-?fpm\.service/ { print $1; exit }')
    if [[ -n "$unit" ]]; then
      if systemctl reload "$unit" 2>/dev/null; then
        echo "$unit"; return 0
      fi
    fi
    return 1
  }

  if RELOADED=$(reload_opcache); then
    ok "Opcache reset (pre-warmup) via $RELOADED"
  else
    warn "Could not reset PHP opcache automatically (pre-warmup)."
  fi

  if [[ -f bin/cache-warmup.php ]]; then
    $PHP -d memory_limit=512M bin/cache-warmup.php
    ok "Cache warmed"
  else
    warn "bin/cache-warmup.php not found — skipping warmup"
  fi

  # Second opcache reset — ensures HTTP workers load the freshly written
  # metadata cache files (which are PHP files that themselves get cached
  # in opcache on first read). Without this, Doctrine Semantical errors
  # can appear after adding new entity fields.
  if RELOADED=$(reload_opcache); then
    ok "Opcache reset (post-warmup) via $RELOADED"
  else
    warn "Could not reset PHP opcache automatically."
    warn "  If new routes/actions return 404 or Doctrine Semantical errors"
    warn "  appear after deploy, run one of:"
    warn "    sudo systemctl reload php-fpm"
    warn "    sudo systemctl reload php8.2-fpm      # or your PHP version"
    warn "    sudo service php-fpm reload"
  fi
fi

# ─── 5. Frontend builds (unless --backend-only) ─────────────────────────
if [[ $BACKEND_ONLY -eq 0 ]]; then
  step "5/5 Frontend production builds"

  # Admin app
  if [[ -d "$ROOT/creditx-admin" ]]; then
    cd "$ROOT/creditx-admin"
    blue "  Building admin app..."
    $NPM run build:prod || die "Admin build failed"
    ok "creditx-admin built"
  else
    warn "creditx-admin directory not found — skipping"
  fi

  # Agent app
  if [[ -d "$ROOT/creditx-agent" ]]; then
    cd "$ROOT/creditx-agent"
    blue "  Building agent app..."
    $NPM run build:prod || die "Agent build failed"
    ok "creditx-agent built"
  else
    warn "creditx-agent directory not found — skipping"
  fi
fi

# ─── Done ────────────────────────────────────────────────────────────────
step "Deployment complete"
green "✓ All steps succeeded."
echo ""
echo "  Deployed: $(git rev-parse --short HEAD)"
echo "  Message:  $(git log -1 --pretty=%s)"
echo ""
