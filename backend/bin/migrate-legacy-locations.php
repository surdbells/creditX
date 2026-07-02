<?php

declare(strict_types=1);

/**
 * Legacy → CreditX  ·  Locations (branches) + user→location mapping
 * ------------------------------------------------------------------
 * The original migrate-legacy.php migrated the `user` table into `users`
 * but never carried over each user's branch, so migrated agents ended up
 * with no location and are invisible to BranchScopeService. This script
 * backfills that:
 *
 *   1. Discovers the branch of each legacy user.
 *   2. Creates a CreditX Location (type=branch) per distinct branch.
 *   3. Maps every migrated user (matched by email) to their Location via
 *      the user_locations pivot.
 *   4. (optional, on by default) Flags role=agent users as is_agent=true so
 *      the branch scoping actually applies to them.
 *
 * The legacy branch source differs between deployments, so it is
 * auto-detected and printed. ALWAYS run --dry-run first and confirm the
 * detected column + branch list look right before the real run.
 *
 * Usage:
 *   php bin/migrate-legacy-locations.php --dry-run          # inspect only
 *   php bin/migrate-legacy-locations.php                    # apply
 *   php bin/migrate-legacy-locations.php --list-columns     # dump user cols
 *
 * Options:
 *   --dry-run                 Read + report only; write nothing.
 *   --list-columns            Print the legacy `user` columns and exit.
 *   --branch-col=NAME         Force the branch column on `user`
 *                             (skip auto-detect). In lookup mode this is the
 *                             FK column on `user`.
 *   --branch-table=NAME       Resolve branch via a lookup table instead of a
 *                             plain text column on `user`. The user column may
 *                             hold a comma-separated list of ids (multi-branch);
 *                             each id is resolved and linked independently.
 *   --branch-id-col=NAME      PK column on the lookup table (default: id).
 *   --branch-label-col=NAME   Label column on the lookup table (default: name).
 *   --branch-address-col=NAME Optional address/state column on the lookup table.
 *   --no-agent-flag           Do NOT set is_agent on role=agent users.
 *
 * FTI Pay (legacy `locations` table, comma-separated ids in `user`.`location`):
 *   php bin/migrate-legacy-locations.php --dry-run \
 *       --branch-table=locations --branch-id-col=lid \
 *       --branch-label-col=lname --branch-address-col=address
 *
 * Env (backend/.env), same as migrate-legacy.php:
 *   LEGACY_DB_HOST/PORT/NAME/USER/PASSWORD   (source MySQL)
 *   DB_HOST/PORT/NAME/USER/PASSWORD          (target PostgreSQL)
 */

require __DIR__ . '/../vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->safeLoad();

$dryRun       = in_array('--dry-run', $argv, true);
$listColumns  = in_array('--list-columns', $argv, true);
$setAgentFlag = !in_array('--no-agent-flag', $argv, true);

function argVal(array $argv, string $name): ?string {
    foreach ($argv as $a) {
        if (str_starts_with($a, "--{$name}=")) return substr($a, strlen($name) + 3);
    }
    return null;
}

$forceBranchCol   = argVal($argv, 'branch-col');
$branchTable      = argVal($argv, 'branch-table');
$branchIdCol      = argVal($argv, 'branch-id-col') ?? 'id';
$branchLabelCol   = argVal($argv, 'branch-label-col') ?? 'name';
$branchAddressCol = argVal($argv, 'branch-address-col');   // optional

echo "╔══════════════════════════════════════════════════════╗\n";
echo "║  Legacy → CreditX  ·  Locations + user mapping        ║\n";
if ($dryRun) echo "║  MODE: DRY RUN (no data will be written)             ║\n";
echo "╚══════════════════════════════════════════════════════╝\n\n";

// ─── Connect to source MySQL ───
$mysqlHost = $_ENV['LEGACY_DB_HOST'] ?? '127.0.0.1';
$mysqlPort = $_ENV['LEGACY_DB_PORT'] ?? '3306';
$mysqlDb   = $_ENV['LEGACY_DB_NAME'] ?? 'u931799113_ftipay';
$mysqlUser = $_ENV['LEGACY_DB_USER'] ?? 'root';
$mysqlPass = $_ENV['LEGACY_DB_PASSWORD'] ?? '';

echo "[MySQL] Connecting to {$mysqlUser}@{$mysqlHost}:{$mysqlPort}/{$mysqlDb}...\n";
try {
    $mysql = new PDO(
        "mysql:host={$mysqlHost};port={$mysqlPort};dbname={$mysqlDb};charset=utf8mb4",
        $mysqlUser, $mysqlPass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    echo "[MySQL] Connected OK\n";
} catch (PDOException $e) {
    echo "[MySQL] FAILED: " . $e->getMessage() . "\n";
    echo "\nSet LEGACY_DB_* in backend/.env (see migrate-legacy.php).\n";
    exit(1);
}

// ─── Connect to target PostgreSQL ───
$pgHost = $_ENV['DB_HOST'] ?? '127.0.0.1';
$pgPort = $_ENV['DB_PORT'] ?? '5432';
$pgDb   = $_ENV['DB_NAME'] ?? 'creditx';
$pgUser = $_ENV['DB_USER'] ?? 'creditx_user';
$pgPass = $_ENV['DB_PASSWORD'] ?? '';

echo "[PgSQL] Connecting to {$pgUser}@{$pgHost}:{$pgPort}/{$pgDb}...\n";
try {
    $pg = new PDO(
        "pgsql:host={$pgHost};port={$pgPort};dbname={$pgDb}",
        $pgUser, $pgPass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    echo "[PgSQL] Connected OK\n\n";
} catch (PDOException $e) {
    echo "[PgSQL] FAILED: " . $e->getMessage() . "\n";
    exit(1);
}

function uuid(): string { return \Ramsey\Uuid\Uuid::uuid4()->toString(); }
function now(): string { return (new DateTimeImmutable('now', new DateTimeZone('Africa/Lagos')))->format('Y-m-d H:i:s'); }

/** Derive a stable, unique uppercase location code from a branch name. */
function makeCode(string $name, array &$seen): string {
    $base = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $name));
    if ($base === '') $base = 'BR';
    $base = substr($base, 0, 16);
    $code = $base;
    $n = 2;
    while (isset($seen[$code])) { $code = substr($base, 0, 14) . '-' . $n; $n++; }
    $seen[$code] = true;
    return substr($code, 0, 20);
}

// ─── Inspect legacy `user` columns ───
$cols = [];
foreach ($mysql->query("SHOW COLUMNS FROM `user`") as $c) { $cols[] = $c['Field']; }

if ($listColumns) {
    echo "Legacy `user` columns:\n";
    foreach ($cols as $c) echo "  - {$c}\n";
    exit(0);
}

// ─── Resolve which column holds the branch ───
$branchCol = $forceBranchCol;
if ($branchCol === null) {
    // Ordered so the most specific / most likely wins first.
    $candidates = ['branch', 'branch_name', 'branchname', 'branch_id', 'branchid',
                   'station', 'zone', 'region', 'location', 'office', 'unit',
                   'posting', 'centre', 'center'];
    $lower = array_map('strtolower', $cols);
    foreach ($candidates as $cand) {
        $i = array_search($cand, $lower, true);
        if ($i !== false) { $branchCol = $cols[$i]; break; }
    }
}

if ($branchCol === null) {
    echo "!! Could not auto-detect a branch column on `user`.\n";
    echo "   Columns are: " . implode(', ', $cols) . "\n";
    echo "   Re-run with --branch-col=THE_COLUMN (or --list-columns).\n";
    exit(1);
}
if (!in_array($branchCol, $cols, true)) {
    echo "!! Column '{$branchCol}' does not exist on `user`. Columns: " . implode(', ', $cols) . "\n";
    exit(1);
}

echo "Branch source column : `user`.`{$branchCol}`" . ($forceBranchCol ? " (forced)" : " (auto-detected)") . "\n";
if ($branchTable) {
    echo "Lookup table         : `{$branchTable}` ({$branchIdCol} → {$branchLabelCol}"
        . ($branchAddressCol ? ", addr {$branchAddressCol}" : "") . ")\n";
}

// ─── Build id/key → {label, address} resolver ───
// The legacy `user` column may hold a single value or a comma-separated list
// of ids (a user assigned to several branches). Each token is resolved
// independently. In lookup-table mode the token is a foreign key into that
// table; otherwise the token IS the label.
$lookup = null;
if ($branchTable !== null) {
    $addrSel = $branchAddressCol ? ", `{$branchAddressCol}` AS a" : "";
    $lookup = [];
    foreach ($mysql->query("SELECT `{$branchIdCol}` AS k, `{$branchLabelCol}` AS v{$addrSel} FROM `{$branchTable}`") as $r) {
        $lookup[trim((string)$r['k'])] = [
            'label'   => trim((string)$r['v']),
            'address' => isset($r['a']) ? trim((string)$r['a']) : null,
        ];
    }
    echo "Lookup rows          : " . count($lookup) . "\n";
}

$resolve = static function (string $token) use ($lookup): ?array {
    $token = trim($token);
    if ($token === '') return null;
    if ($lookup !== null) {
        return $lookup[$token] ?? null;   // unknown id → orphan
    }
    return ['label' => $token, 'address' => null];
};

// ─── Pass 1: collect distinct branches + each user's branch set ───
$userRows = $mysql->query("SELECT `email_address`, `{$branchCol}` AS branch_raw FROM `user`");
$branches = [];          // label => ['count' => int, 'address' => ?string]
$userBranches = [];      // lower(email) => [label, ...]
$noBranch = 0; $noEmail = 0; $orphans = [];   // unresolved token => count
foreach ($userRows as $r) {
    $email = strtolower(trim((string)($r['email_address'] ?? '')));
    if ($email === '') { $noEmail++; continue; }

    $labels = [];
    foreach (explode(',', (string)($r['branch_raw'] ?? '')) as $token) {
        $token = trim($token);
        if ($token === '') continue;
        $info = $resolve($token);
        if ($info === null) { $orphans[$token] = ($orphans[$token] ?? 0) + 1; continue; }
        $labels[$info['label']] = $info['address'];
    }
    if (empty($labels)) { $noBranch++; continue; }

    foreach ($labels as $label => $address) {
        if (!isset($branches[$label])) $branches[$label] = ['count' => 0, 'address' => $address];
        $branches[$label]['count']++;
    }
    $userBranches[$email] = array_keys($labels);
}
ksort($branches);

echo "\nDistinct branches resolved: " . count($branches) . "\n";
foreach ($branches as $label => $meta) {
    echo sprintf("  %-28s  %d user(s)\n", $label, $meta['count']);
}
echo "  (users with no resolvable branch: {$noBranch}; with no email: {$noEmail})\n";
if ($orphans) {
    ksort($orphans);
    $parts = [];
    foreach ($orphans as $tok => $cnt) $parts[] = "{$tok}×{$cnt}";
    echo "  Unresolved ids (skipped): " . implode(', ', $parts) . "\n";
}
echo "\n";

if (empty($branches)) {
    echo "Nothing to migrate — no branch values resolved from `{$branchCol}`.\n";
    echo "If that's wrong, pick the right column with --branch-col / --branch-table.\n";
    exit($dryRun ? 0 : 1);
}

// ─── Ensure a Location exists per branch (idempotent on code) ───
$seenCodes = [];
$labelToCode = [];
foreach (array_keys($branches) as $label) {
    $labelToCode[$label] = makeCode($label, $seenCodes);
}

$locInsert = $pg->prepare(
    "INSERT INTO locations (id, name, code, address, state, type, is_active, created_at, updated_at)
     VALUES (:id, :name, :code, :address, :state, 'branch', true, :now, :now)
     ON CONFLICT (code) DO NOTHING"
);

$locCreated = 0; $locExisting = 0;
foreach ($branches as $label => $meta) {
    $code = $labelToCode[$label];
    $addr = $meta['address'] ?: null;
    if ($dryRun) {
        echo "  [dry] Location  {$code}  ←  {$label}" . ($addr ? "  ({$addr})" : "") . "\n";
        continue;
    }
    $locInsert->execute([
        ':id' => uuid(), ':name' => $label, ':code' => $code,
        ':address' => $addr, ':state' => $addr, ':now' => now(),
    ]);
    if ($locInsert->rowCount() > 0) $locCreated++; else $locExisting++;
}

// Build code → location_id map from PG (covers both new + pre-existing rows).
$codeToId = [];
$codes = array_values($labelToCode);
if (!$dryRun && $codes) {
    $ph = implode(',', array_fill(0, count($codes), '?'));
    $st = $pg->prepare("SELECT id, code FROM locations WHERE code IN ($ph)");
    $st->execute($codes);
    foreach ($st as $row) { $codeToId[$row['code']] = $row['id']; }
}

// ─── Map users → locations ───
$findUser = $pg->prepare("SELECT id FROM users WHERE email = :email");
$mapInsert = $pg->prepare(
    "INSERT INTO user_locations (user_id, location_id) VALUES (:uid, :lid) ON CONFLICT DO NOTHING"
);

$usersMapped = 0; $links = 0; $alreadyLinked = 0; $unmatchedUser = 0; $noLocId = 0;
foreach ($userBranches as $email => $labels) {
    if ($dryRun) { $usersMapped++; $links += count($labels); continue; }

    $findUser->execute([':email' => $email]);
    $uid = $findUser->fetchColumn();
    if ($uid === false) { $unmatchedUser++; continue; }

    $linkedThisUser = false;
    foreach ($labels as $label) {
        $lid = $codeToId[$labelToCode[$label]] ?? null;
        if ($lid === null) { $noLocId++; continue; }
        $mapInsert->execute([':uid' => $uid, ':lid' => $lid]);
        if ($mapInsert->rowCount() > 0) { $links++; $linkedThisUser = true; }
        else $alreadyLinked++;
    }
    if ($linkedThisUser) $usersMapped++;
}

// ─── Flag role=agent users as is_agent ───
$agentFlagged = 0;
if ($setAgentFlag && !$dryRun) {
    $agentFlagged = $pg->exec(
        "UPDATE users SET is_agent = true
         WHERE is_agent = false
           AND id IN (SELECT ur.user_id FROM user_roles ur
                      JOIN roles r ON r.id = ur.role_id WHERE r.slug = 'agent')"
    );
}

// ─── Summary ───
echo "\n╔══════════════════════════════════════════════════════╗\n";
echo "║  Summary                                             ║\n";
echo "╚══════════════════════════════════════════════════════╝\n";
if ($dryRun) {
    echo "  DRY RUN — nothing written.\n";
    echo "  Would create up to " . count($branches) . " location(s), map {$usersMapped} user(s) "
       . "via {$links} user→location link(s).\n";
    echo "  Re-run without --dry-run to apply.\n";
} else {
    echo "  Locations created     : {$locCreated}\n";
    echo "  Locations pre-existing: {$locExisting}\n";
    echo "  Users mapped          : {$usersMapped}\n";
    echo "  User→location links   : {$links} new, {$alreadyLinked} already present\n";
    echo "  Users not found in PG : {$unmatchedUser}\n";
    if ($noLocId > 0) echo "  Links skipped (no loc id): {$noLocId}\n";
    if ($setAgentFlag) echo "  Users flagged is_agent : {$agentFlagged}\n";
}
echo "\nDone.\n";
