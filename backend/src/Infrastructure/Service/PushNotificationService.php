<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\DeviceToken;
use Doctrine\ORM\EntityManagerInterface;
use Kreait\Firebase\Exception\Messaging\NotFound;
use Kreait\Firebase\Exception\MessagingException;
use Kreait\Firebase\Factory;
use Kreait\Firebase\Messaging;
use Kreait\Firebase\Messaging\CloudMessage;
use Kreait\Firebase\Messaging\Notification as FcmNotification;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;

/**
 * Push Notification Service — FCM HTTP v1
 *
 * Sends push notifications via Firebase Cloud Messaging HTTP v1 API,
 * using the kreait/firebase-php SDK for OAuth2 service-account auth.
 *
 * Migration note:
 *   Earlier versions of this file used Google's legacy FCM HTTP API
 *   (server-key auth, /fcm/send endpoint). Google deprecated that API
 *   on 2024-06-20 — new Firebase projects return 404. This rewrite
 *   targets the HTTP v1 endpoint
 *   (https://fcm.googleapis.com/v1/projects/{project-id}/messages:send)
 *   which uses OAuth2 credentials from a service account JSON key.
 *
 * ## Setup
 *
 *   1. Go to https://console.firebase.google.com
 *   2. Select (or create) the project. Project Settings → Service accounts.
 *   3. Generate new private key → downloads a JSON file.
 *   4. Upload the JSON to the server (out-of-tree; don't commit it).
 *   5. Set in backend/.env:
 *         FCM_SERVICE_ACCOUNT_PATH=/path/to/firebase-service-account.json
 *
 *   Suggested path: /www/wwwroot/creditx/backend/storage/firebase/
 *     service-account.json (already under storage/, already excluded
 *     from git via .gitignore on the storage dir).
 *
 *   File permissions: chmod 600 and chown it to the www user —
 *   it's a secret credential.
 *
 * ## Behavior when not configured
 *
 *   If FCM_SERVICE_ACCOUNT_PATH is unset or points at a file that
 *   doesn't exist, every send call returns ['error' => ...] WITHOUT
 *   hitting the network. NotificationDispatchService.sendPush treats
 *   this as a failure and marks the notification failed, which surfaces
 *   the configuration problem in the notifications admin UI.
 *
 *   This means you can deploy this code to a server that doesn't have
 *   Firebase set up yet — push notifications just all fail quietly
 *   until the service account file lands.
 *
 * ## Stale tokens
 *
 *   FCM returns NotFound for tokens that are no longer valid
 *   (user uninstalled app, token rotated). We catch that and mark
 *   the DeviceToken inactive so future sends skip it. Prevents
 *   log spam and reduces FCM quota usage.
 */
final class PushNotificationService
{
    /**
     * Lazy-initialized FCM messaging client. Cached across calls so we
     * don't re-read the service account JSON or re-auth on every send.
     * Null when credentials are unavailable.
     */
    private ?Messaging $messaging = null;

    /**
     * Set to true after we've attempted to build the client at least once.
     * Prevents re-trying the Factory call on every send when credentials
     * are missing (which would waste time on filesystem checks).
     */
    private bool $clientInitialized = false;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly LoggerInterface $logger = new NullLogger(),
    ) {}

    /**
     * Send push notification to a specific user's devices.
     *
     * @return array{sent: int, results?: array<int, array<string, mixed>>, error?: string, reason?: string}
     */
    public function sendToUser(
        string $userId,
        string $title,
        string $body,
        array $data = [],
    ): array {
        $messaging = $this->getMessaging();
        if ($messaging === null) {
            return ['error' => 'FCM_SERVICE_ACCOUNT_PATH not configured'];
        }

        $tokens = $this->em->getRepository(DeviceToken::class)->findBy([
            'user' => $userId, 'isActive' => true,
        ]);

        if (empty($tokens)) {
            return ['sent' => 0, 'reason' => 'No active devices'];
        }

        // Use sendMulticast when the user has multiple devices. Even for 1
        // device, the multicast path is simpler (unified reporting) and the
        // kreait SDK doesn't penalize us for it.
        $tokenStrings = array_map(fn (DeviceToken $t) => $t->getToken(), $tokens);
        $tokenToDevice = [];
        foreach ($tokens as $t) {
            $tokenToDevice[$t->getToken()] = $t;
        }

        // Build a data-only message, then attach display notification. kreait's
        // CloudMessage::new() gives us a message we can target at multiple
        // tokens via sendMulticast. Data values must all be strings; cast
        // anything non-string upfront.
        $stringData = array_map(fn ($v) => (string) $v, $data);

        $message = CloudMessage::new()
            ->withNotification(FcmNotification::create($title, $body))
            ->withData($stringData);

        try {
            $report = $messaging->sendMulticast($message, $tokenStrings);
        } catch (MessagingException $e) {
            $this->logger->error('FCM multicast failed', [
                'user_id' => $userId,
                'device_count' => count($tokenStrings),
                'error' => $e->getMessage(),
            ]);
            return ['error' => $e->getMessage()];
        }

        // Deactivate any tokens FCM rejected as invalid (unknown /
        // unregistered). Avoids re-sending to them next time.
        $invalidTokens = $report->invalidTokens();
        $unknownTokens = $report->unknownTokens();
        $stale = array_unique(array_merge($invalidTokens, $unknownTokens));

        if (!empty($stale)) {
            foreach ($stale as $badToken) {
                $dev = $tokenToDevice[$badToken] ?? null;
                if ($dev !== null) {
                    $dev->setIsActive(false);
                }
            }
            $this->em->flush();
            $this->logger->info('Deactivated stale FCM tokens', [
                'user_id' => $userId,
                'count' => count($stale),
            ]);
        }

        return [
            'sent' => $report->successes()->count(),
            'failures' => $report->failures()->count(),
            'total_devices' => count($tokenStrings),
        ];
    }

    /**
     * Send to multiple users. Collects all device tokens then issues a
     * single multicast request (batched in chunks of 500 — FCM HTTP v1
     * caps sendMulticast at 500 tokens per request, not 1000 like legacy).
     *
     * @param array<int, string> $userIds
     * @return array{sent: int, total_devices: int, error?: string}
     */
    public function sendToUsers(
        array $userIds,
        string $title,
        string $body,
        array $data = [],
    ): array {
        $messaging = $this->getMessaging();
        if ($messaging === null) {
            return ['error' => 'FCM_SERVICE_ACCOUNT_PATH not configured', 'sent' => 0, 'total_devices' => 0];
        }

        if (empty($userIds)) {
            return ['sent' => 0, 'total_devices' => 0];
        }

        $devices = $this->em->createQueryBuilder()
            ->select('dt')
            ->from(DeviceToken::class, 'dt')
            ->where('dt.user IN (:ids)')
            ->andWhere('dt.isActive = true')
            ->setParameter('ids', $userIds)
            ->getQuery()
            ->getResult();

        if (empty($devices)) {
            return ['sent' => 0, 'total_devices' => 0];
        }

        $tokenStrings = array_map(fn (DeviceToken $t) => $t->getToken(), $devices);
        $tokenToDevice = [];
        foreach ($devices as $t) {
            $tokenToDevice[$t->getToken()] = $t;
        }

        $stringData = array_map(fn ($v) => (string) $v, $data);
        $message = CloudMessage::new()
            ->withNotification(FcmNotification::create($title, $body))
            ->withData($stringData);

        // HTTP v1 cap is 500 per multicast; chunk larger batches.
        $chunks = array_chunk($tokenStrings, 500);
        $totalSent = 0;
        $stale = [];

        foreach ($chunks as $chunk) {
            try {
                $report = $messaging->sendMulticast($message, $chunk);
                $totalSent += $report->successes()->count();
                $stale = array_merge($stale, $report->invalidTokens(), $report->unknownTokens());
            } catch (MessagingException $e) {
                $this->logger->error('FCM multicast chunk failed', [
                    'chunk_size' => count($chunk),
                    'error' => $e->getMessage(),
                ]);
                // Continue with remaining chunks — partial delivery is
                // better than aborting everyone.
            }
        }

        $stale = array_unique($stale);
        if (!empty($stale)) {
            foreach ($stale as $badToken) {
                $dev = $tokenToDevice[$badToken] ?? null;
                if ($dev !== null) {
                    $dev->setIsActive(false);
                }
            }
            $this->em->flush();
        }

        return ['sent' => $totalSent, 'total_devices' => count($tokenStrings)];
    }

    /**
     * Lazy-load the kreait Messaging client. Returns null if the service
     * account file is missing or unreadable — callers treat that as a
     * configuration error, not a runtime failure.
     */
    private function getMessaging(): ?Messaging
    {
        if ($this->clientInitialized) {
            return $this->messaging;
        }
        $this->clientInitialized = true;

        $path = $_ENV['FCM_SERVICE_ACCOUNT_PATH'] ?? '';
        if ($path === '' || !is_file($path) || !is_readable($path)) {
            $this->logger->warning('FCM service account not available', [
                'path' => $path ?: '(unset)',
                'exists' => $path !== '' && is_file($path),
            ]);
            return null;
        }

        try {
            $factory = (new Factory())->withServiceAccount($path);
            $this->messaging = $factory->createMessaging();
            return $this->messaging;
        } catch (\Throwable $e) {
            $this->logger->error('Failed to initialize FCM client', [
                'path' => $path,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }
}
