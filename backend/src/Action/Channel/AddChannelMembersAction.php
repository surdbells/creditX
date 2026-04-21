<?php
declare(strict_types=1);
namespace App\Action\Channel;

use App\Domain\Entity\{Channel, ChannelMember, User};
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Add members to an existing channel.
 *
 * Route: POST /api/channels/{id}/members
 *
 * Only channel admins can add members. Regular members can ask an
 * admin to add someone; RBAC permission alone isn't enough.
 *
 * Payload: user_ids, department_ids, team_ids — all optional arrays.
 * Same semantics as CreateChannel — duplicates deduped, existing
 * members skipped silently.
 *
 * Audit: logs a single 'ChannelMember' create with the channel id +
 * count added. We don't log one entry per added user — that would
 * flood the audit log when bulk-adding by department. The aggregate
 * log is enough to trace "X added N members to channel Y at time T".
 */
final class AddChannelMembersAction {
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface {
        $channelId = $args['id'] ?? '';
        $callerId = $request->getAttribute('user_id');

        $channel = $this->em->find(Channel::class, $channelId);
        if ($channel === null) return $this->notFound('Channel not found');

        // Admin check
        $callerMember = $this->em->getRepository(ChannelMember::class)
            ->findOneBy(['channel' => $channel, 'user' => $callerId]);
        if ($callerMember === null) return $this->forbidden('Not a member of this channel');
        if ($callerMember->getRole() !== 'admin') {
            return $this->forbidden('Only channel admins can add members');
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $added = 0;

        // Pre-load existing member user IDs to skip duplicates in-memory
        // rather than round-tripping per candidate. For channels with
        // thousands of members this matters; for small channels it's
        // still cheaper than N lookups.
        $existingIds = array_map(
            fn (ChannelMember $m) => $m->getUser()->getId(),
            $this->em->getRepository(ChannelMember::class)->findBy(['channel' => $channel]),
        );
        $knownIds = array_fill_keys($existingIds, true);

        foreach (($data['user_ids'] ?? []) as $uid) {
            if (!is_string($uid) || isset($knownIds[$uid])) continue;
            $u = $this->em->find(User::class, $uid);
            if ($u === null) continue;
            $m = new ChannelMember();
            $m->setChannel($channel);
            $m->setUser($u);
            $this->em->persist($m);
            $knownIds[$uid] = true;
            $added++;
        }

        foreach (($data['department_ids'] ?? []) as $did) {
            $users = $this->em->createQueryBuilder()
                ->select('u')->from(User::class, 'u')
                ->where('u.department = :d')->setParameter('d', $did)
                ->getQuery()->getResult();
            foreach ($users as $u) {
                $uid = $u->getId();
                if (isset($knownIds[$uid])) continue;
                $m = new ChannelMember();
                $m->setChannel($channel);
                $m->setUser($u);
                $this->em->persist($m);
                $knownIds[$uid] = true;
                $added++;
            }
        }

        foreach (($data['team_ids'] ?? []) as $tid) {
            $users = $this->em->createQueryBuilder()
                ->select('u')->from(User::class, 'u')
                ->where('u.team = :t')->setParameter('t', $tid)
                ->getQuery()->getResult();
            foreach ($users as $u) {
                $uid = $u->getId();
                if (isset($knownIds[$uid])) continue;
                $m = new ChannelMember();
                $m->setChannel($channel);
                $m->setUser($u);
                $this->em->persist($m);
                $knownIds[$uid] = true;
                $added++;
            }
        }

        $this->em->flush();

        if ($added > 0) {
            $this->audit->logCreate(
                $callerId,
                'ChannelMember',
                $channelId,
                ['channel_id' => $channelId, 'count' => $added],
                $this->getClientIp($request),
                $this->getUserAgent($request),
            );
        }

        return $this->success(['added' => $added], "{$added} member(s) added");
    }
}
