<?php
declare(strict_types=1);
namespace App\Action\Notification;

use App\Domain\Entity\User;
use App\Infrastructure\Service\{ApiResponse, NotificationDispatchService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/notifications/broadcast
 *
 * Admin broadcast to field agents. Body:
 *   {
 *     "subject": "...", "message": "...",
 *     "channels": ["email","push"],           // in-app is always included
 *     "recipient_type": "all"|"specific"|"by_location",
 *     "recipient_ids": ["userId", ...],        // for "specific"
 *     "location_id": "..."                     // for "by_location"
 *   }
 *
 * Every targeted agent gets an in-app notification (shows in their app's
 * notification list) plus the selected external channels (email / push).
 * Gated by notifications.manage.
 */
final class BroadcastToAgentsAction
{
    use ApiResponse;

    private const ALLOWED_CHANNELS = ['email', 'push'];

    public function __construct(
        private readonly NotificationDispatchService $dispatch,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $senderId = $request->getAttribute('user_id');
        if ($senderId === null) return $this->unauthorized();

        $data = (array) ($request->getParsedBody() ?? []);
        $subject = trim((string) ($data['subject'] ?? ''));
        $message = trim((string) ($data['message'] ?? ''));
        $recipientType = (string) ($data['recipient_type'] ?? 'all');

        $errors = [];
        if ($subject === '') $errors['subject'] = 'Subject is required.';
        if ($message === '') $errors['message'] = 'Message is required.';

        // In-app is always on; email/push are opt-in from the whitelist.
        $requested = is_array($data['channels'] ?? null) ? $data['channels'] : [];
        $external = array_values(array_intersect(self::ALLOWED_CHANNELS, array_map('strval', $requested)));
        $channels = array_values(array_unique(array_merge(['in_app'], $external)));

        if (!empty($errors)) return $this->validationError($errors);

        // Resolve the target agents (staff users flagged is_agent).
        $agents = $this->resolveAgents($recipientType, $data);
        if (empty($agents)) return $this->error('No matching agents found.', 400);

        $delivered = 0;
        $channelTotals = ['in_app' => 0, 'email' => 0, 'push' => 0];
        foreach ($agents as $agent) {
            $res = $this->dispatch->deliverToUser($agent, $subject, $message, $channels);
            $delivered++;
            foreach ($res as $r) {
                if (($r['status'] ?? '') === 'sent' && isset($channelTotals[$r['channel']])) {
                    $channelTotals[$r['channel']]++;
                }
            }
        }

        return $this->success([
            'agents'   => $delivered,
            'channels' => $channels,
            'sent'     => $channelTotals,
        ], "Broadcast delivered to {$delivered} agent(s)");
    }

    /** @return User[] */
    private function resolveAgents(string $type, array $data): array
    {
        $qb = $this->em->createQueryBuilder()->select('u')->from(User::class, 'u')
            ->where('u.isAgent = true');

        if ($type === 'specific') {
            $ids = is_array($data['recipient_ids'] ?? null) ? $data['recipient_ids'] : [];
            if (empty($ids)) return [];
            $qb->andWhere('u.id IN (:ids)')->setParameter('ids', $ids);
        } elseif ($type === 'by_location') {
            $loc = (string) ($data['location_id'] ?? '');
            if ($loc === '') return [];
            $qb->innerJoin('u.locations', 'loc')->andWhere('loc.id = :loc')->setParameter('loc', $loc);
        }
        // 'all' → no extra filter

        return $qb->getQuery()->getResult();
    }
}
