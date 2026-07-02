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

        // Deliver the in-app notification inline (DB-only, fast) so every
        // agent's notification list is populated immediately and we can report
        // an accurate count.
        $inAppCount = 0;
        foreach ($agents as $agent) {
            $res = $this->dispatch->deliverToUser($agent, $subject, $message, ['in_app']);
            foreach ($res as $r) {
                if (($r['status'] ?? '') === 'sent' && $r['channel'] === 'in_app') $inAppCount++;
            }
        }

        // The external channels (email/push) each make a per-agent HTTP call to
        // the provider — for a large audience that easily exceeds the request
        // timeout. Run them AFTER the response is flushed to the client so the
        // admin gets an immediate confirmation instead of a hung spinner.
        if (!empty($external)) {
            $dispatch = $this->dispatch;
            register_shutdown_function(static function () use ($agents, $subject, $message, $external, $dispatch): void {
                if (function_exists('fastcgi_finish_request')) {
                    fastcgi_finish_request();   // return the response, keep working
                }
                @set_time_limit(0);
                foreach ($agents as $agent) {
                    try { $dispatch->deliverToUser($agent, $subject, $message, $external); }
                    catch (\Throwable $e) { /* best-effort; per-channel errors are logged inside */ }
                }
            });
        }

        $count = count($agents);
        $queued = !empty($external);
        return $this->success([
            'agents'   => $count,
            'channels' => $channels,
            'queued'   => $queued,
            'sent'     => [
                'in_app' => $inAppCount,
                'email'  => in_array('email', $external, true) ? $count : 0,
                'push'   => in_array('push', $external, true) ? $count : 0,
            ],
        ], $queued
            ? "In-app delivered to {$count} agent(s); email/push are sending in the background."
            : "Broadcast delivered to {$count} agent(s).");
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
