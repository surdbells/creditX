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

# Refuse to deploy if there are uncommitted changes on the server
# (they'd block git pull --ff-only and signal something was edited in place)
if [[ -n "$(git status --porcelain)" ]]; then
  red "✘ Uncommitted changes detected in $ROOT:"
  git status --short | sed 's/^/    /' >&2
  red "  Commit, stash, or reset before deploying."
  exit 1
fi

# ─── 1. Git pull ─────────────────────────────────────────────────────────
step "1/5 Pulling latest from git"
git fetch --prune
BEFORE=$(git rev-parse HEAD)
git pull --ff-only origin main
AFTER=$(git rev-parse HEAD)
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

  # ─── Cache clear + warmup ────────────────────────────────────────────
  step "4/5 Cache clear + warmup"
  rm -rf var/cache/* var/proxies/* 2>/dev/null || true
  ok "Cache cleared"

  if [[ -f bin/cache-warmup.php ]]; then
    $PHP -d memory_limit=512M bin/cache-warmup.php
    ok "Cache warmed"
  else
    warn "bin/cache-warmup.php not found — skipping warmup"
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
