<?php

declare(strict_types=1);

/**
 * Push-notification diagnostic
 * ----------------------------
 * Pinpoints why FCM push isn't delivering. Checks the service-account
 * credential, the push_enabled setting, a user's device tokens, and (if a
 * user is given) performs a LIVE test send so you see the real FCM result.
 *
 * Usage:
 *   php bin/diagnose-push.php                    # config checks only
 *   php bin/diagnose-push.php agent@example.com  # + live test push to that user
 *   php bin/diagnose-push.php <user-uuid>        # same, by id
 *
 * IMPORTANT: the backend needs a Firebase *service account* private key
 * (Firebase Console → Project settings → Service accounts → Generate new
 * private key). That is NOT google-services.json (which is the Android app's
 * client config). FCM_SERVICE_ACCOUNT_PATH in .env must point at the service
 * account file.
 */

require __DIR__ . '/../vendor/autoload.php';

use App\Domain\Entity\DeviceToken;
use App\Domain\Entity\User;
use App\Infrastructure\Service\PushNotificationService;
use DI\ContainerBuilder;
use Doctrine\ORM\EntityManagerInterface;

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->safeLoad();

$target = $argv[1] ?? null;

function line(string $label, string $value): void {
    echo sprintf("  %-26s %s\n", $label . ':', $value);
}

echo "\n=== CreditX Push Diagnostic ===\n\n";

// ─── 1. Service-account credential ───
echo "[1] FCM service account\n";
$path = $_ENV['FCM_SERVICE_ACCOUNT_PATH'] ?? '';
line('FCM_SERVICE_ACCOUNT_PATH', $path !== '' ? $path : '(unset)');

$credOk = false;
if ($path === '') {
    echo "  ✗ Not set. Push is disabled — set it to the service-account JSON path.\n";
} elseif (!is_file($path)) {
    echo "  ✗ File does not exist at that path.\n";
} elseif (!is_readable($path)) {
    echo "  ✗ File exists but is NOT readable by this user (" . (function_exists('posix_getpwuid') ? (posix_getpwuid(posix_geteuid())['name'] ?? '?') : get_current_user()) . ").\n";
    echo "     Fix: chown to the php-fpm user and chmod 600.\n";
} else {
    $json = json_decode((string) file_get_contents($path), true);
    if (!is_array($json)) {
        echo "  ✗ File is not valid JSON.\n";
    } elseif (isset($json['project_info']) || isset($json['client'][0]['client_info'])) {
        echo "  ✗ This is google-services.json (the ANDROID app config), not a service account.\n";
        echo "     The backend needs the service-account private key instead:\n";
        echo "     Firebase Console → Project settings → Service accounts → Generate new private key.\n";
    } elseif (($json['type'] ?? '') === 'service_account'
              && !empty($json['private_key']) && !empty($json['client_email'])) {
        $credOk = true;
        echo "  ✓ Valid service-account JSON.\n";
        line('project_id', (string) ($json['project_id'] ?? '(missing!)'));
        line('client_email', (string) ($json['client_email'] ?? '?'));
        echo "     ↳ Confirm project_id matches the Firebase project your APK's\n";
        echo "       google-services.json belongs to — a mismatch = tokens rejected.\n";
    } else {
        echo "  ✗ JSON is missing service-account fields (type/private_key/client_email).\n";
    }
}
echo "\n";

// ─── Boot container for DB + service checks ───
$builder = new ContainerBuilder();
$builder->addDefinitions(__DIR__ . '/../config/container.php');
$container = $builder->build();
/** @var EntityManagerInterface $em */
$em = $container->get(EntityManagerInterface::class);

// ─── 2. push_enabled setting ───
echo "[2] Settings\n";
try {
    $settings = $container->get(\App\Infrastructure\Service\SettingsCacheService::class);
    $pushEnabled = $settings->getBool('notification.push_enabled', true);
    line('notification.push_enabled', $pushEnabled ? 'true' : 'FALSE  ← blocks all push!');
} catch (\Throwable $e) {
    line('notification.push_enabled', 'could not read (' . $e->getMessage() . ')');
}
echo "\n";

// ─── 3. Device tokens (global + per user) ───
echo "[3] Device tokens\n";
$conn = $em->getConnection();
$totalActive = (int) $conn->executeQuery("SELECT COUNT(*) FROM device_tokens WHERE is_active = true")->fetchOne();
$totalAll    = (int) $conn->executeQuery("SELECT COUNT(*) FROM device_tokens")->fetchOne();
line('active / total (all users)', "{$totalActive} / {$totalAll}");
$byPlatform = $conn->executeQuery("SELECT platform, COUNT(*) c FROM device_tokens WHERE is_active = true GROUP BY platform")->fetchAllAssociative();
foreach ($byPlatform as $r) line('  active ' . $r['platform'], (string) $r['c']);
echo "\n";

if ($target === null) {
    echo "Pass a user email or id to run a LIVE test send:\n";
    echo "  php bin/diagnose-push.php agent@example.com\n\n";
    exit(0);
}

// ─── 4. Resolve the target user ───
echo "[4] Target user: {$target}\n";
$repo = $em->getRepository(User::class);
$user = $repo->findOneBy(['email' => strtolower(trim($target))]) ?? $repo->findOneBy(['id' => $target]);
if ($user === null) {
    echo "  ✗ No user found by email or id.\n\n";
    exit(1);
}
line('user id', $user->getId());
line('name', method_exists($user, 'getFullName') ? $user->getFullName() : '?');

$tokens = $em->getRepository(DeviceToken::class)->findBy(['user' => $user->getId(), 'isActive' => true]);
$inactive = $em->getRepository(DeviceToken::class)->findBy(['user' => $user->getId(), 'isActive' => false]);
line('active tokens', (string) count($tokens));
line('inactive tokens', (string) count($inactive));
foreach ($tokens as $t) {
    $tok = $t->getToken();
    echo "     • {$t->getPlatform()}  " . substr($tok, 0, 16) . '…' . substr($tok, -6) . "\n";
}
if (count($tokens) === 0) {
    echo "  ✗ No ACTIVE tokens. Either none registered, or FCM previously marked\n";
    echo "     them stale and they were auto-deactivated. Re-open the app to re-register.\n\n";
    exit(1);
}
echo "\n";

// ─── 5. Live test send ───
echo "[5] Live test send\n";
if (!$credOk) {
    echo "  ✗ Skipped — service account not valid (see [1]). Fix that first.\n\n";
    exit(1);
}
/** @var PushNotificationService $push */
$push = $container->get(PushNotificationService::class);
$result = $push->sendToUser(
    $user->getId(),
    'CreditX push test',
    'If you can see this, push delivery is working. (' . date('H:i:s') . ')',
    ['type' => 'diagnostic'],
);
echo "  Result: " . json_encode($result) . "\n\n";

if (isset($result['error'])) {
    echo "  ✗ FCM returned an error above — that string is the real cause.\n";
} elseif (($result['sent'] ?? 0) > 0) {
    echo "  ✓ FCM accepted {$result['sent']} message(s). If the device still shows\n";
    echo "     nothing: check the app has notification permission granted, is built\n";
    echo "     with the matching google-services.json, and (Android) that a data/\n";
    echo "     notification payload is handled while backgrounded.\n";
} else {
    echo "  ⚠ FCM reported 0 sent (" . ($result['reason'] ?? 'unknown') . ").\n";
}
echo "\nDone.\n";
