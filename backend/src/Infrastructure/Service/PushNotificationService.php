<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\DeviceToken;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Push Notification Service
 * 
 * Sends push notifications via Firebase Cloud Messaging (FCM) HTTP v1 API.
 * 
 * Setup:
 *   1. Create Firebase project at https://console.firebase.google.com
 *   2. Enable Cloud Messaging
 *   3. Download service account JSON key
 *   4. Set FCM_SERVER_KEY in .env (legacy HTTP key) or
 *      FCM_SERVICE_ACCOUNT_PATH for OAuth2 auth
 * 
 * For now, uses the legacy HTTP API (simpler setup):
 *   FCM_SERVER_KEY=your_server_key_here
 */
final class PushNotificationService
{
    private string $fcmUrl = 'https://fcm.googleapis.com/fcm/send';

    public function __construct(private readonly EntityManagerInterface $em) {}

    /**
     * Send push notification to a specific user.
     */
    public function sendToUser(
        string $userId,
        string $title,
        string $body,
        array $data = [],
    ): array {
        $tokens = $this->em->getRepository(DeviceToken::class)->findBy([
            'user' => $userId, 'isActive' => true,
        ]);

        if (empty($tokens)) return ['sent' => 0, 'reason' => 'No active devices'];

        $results = [];
        foreach ($tokens as $device) {
            $result = $this->send($device->getToken(), $title, $body, $data);
            $results[] = $result;

            // If FCM says token is invalid, deactivate it
            if (isset($result['error']) && in_array($result['error'], ['InvalidRegistration', 'NotRegistered'])) {
                $device->setIsActive(false);
            }
        }

        $this->em->flush();
        return ['sent' => count($results), 'results' => $results];
    }

    /**
     * Send push notification to multiple users.
     */
    public function sendToUsers(
        array $userIds,
        string $title,
        string $body,
        array $data = [],
    ): array {
        $tokens = $this->em->createQueryBuilder()
            ->select('dt')
            ->from(DeviceToken::class, 'dt')
            ->where('dt.user IN (:ids)')
            ->andWhere('dt.isActive = true')
            ->setParameter('ids', $userIds)
            ->getQuery()
            ->getResult();

        if (empty($tokens)) return ['sent' => 0];

        $tokenStrings = array_map(fn($t) => $t->getToken(), $tokens);

        // FCM supports up to 1000 tokens per multicast
        $chunks = array_chunk($tokenStrings, 1000);
        $totalSent = 0;

        foreach ($chunks as $chunk) {
            $result = $this->sendMulticast($chunk, $title, $body, $data);
            $totalSent += ($result['success'] ?? 0);
        }

        return ['sent' => $totalSent, 'total_devices' => count($tokenStrings)];
    }

    /**
     * Send to a single FCM token.
     */
    private function send(string $token, string $title, string $body, array $data = []): array
    {
        $serverKey = $_ENV['FCM_SERVER_KEY'] ?? '';
        if (empty($serverKey)) return ['error' => 'FCM_SERVER_KEY not configured'];

        $payload = [
            'to' => $token,
            'notification' => [
                'title' => $title,
                'body' => $body,
                'sound' => 'default',
                'badge' => '1',
            ],
            'data' => $data,
            'priority' => 'high',
        ];

        return $this->post($payload, $serverKey);
    }

    /**
     * Send to multiple FCM tokens (multicast).
     */
    private function sendMulticast(array $tokens, string $title, string $body, array $data = []): array
    {
        $serverKey = $_ENV['FCM_SERVER_KEY'] ?? '';
        if (empty($serverKey)) return ['error' => 'FCM_SERVER_KEY not configured'];

        $payload = [
            'registration_ids' => $tokens,
            'notification' => [
                'title' => $title,
                'body' => $body,
                'sound' => 'default',
            ],
            'data' => $data,
            'priority' => 'high',
        ];

        return $this->post($payload, $serverKey);
    }

    /**
     * POST to FCM.
     */
    private function post(array $payload, string $serverKey): array
    {
        $ch = curl_init($this->fcmUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: key=' . $serverKey,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => 10,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false) return ['error' => 'FCM request failed'];

        $result = json_decode($response, true);
        return $result ?: ['error' => 'Invalid FCM response', 'http_code' => $httpCode];
    }
}
