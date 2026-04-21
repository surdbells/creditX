<?php
declare(strict_types=1);
namespace App\Action\Channel;

use App\Domain\Entity\{Channel, ChannelMember, User};
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Create a channel / group.
 *
 * Payload:
 *   name            (required, non-empty after trim)
 *   description     (optional)
 *   type            (optional; one of 'group' | 'channel'. Default 'group'.
 *                   'direct' is reserved for 1:1 DMs and not settable here.)
 *   user_ids        (optional array — seed members by user id)
 *   department_ids  (optional array — auto-add all users in these depts)
 *   team_ids        (optional array — auto-add all users in these teams)
 *
 * Creator is auto-added as an admin member. Additional members (from
 * user_ids / department_ids / team_ids) join as regular members.
 * Duplicates across sources are de-duped so a user in both user_ids
 * AND a selected department only gets one membership row (enforced by
 * the unique constraint on channel_members(channel_id, user_id) too).
 *
 * Audit: logs the channel creation. Member additions during creation
 * are NOT separately audited — the initial member list is part of the
 * channel-creation payload, not a separate action.
 */
final class CreateChannelAction {
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
        $data = (array) ($request->getParsedBody() ?? []);
        $userId = $request->getAttribute('user_id');

        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '') return $this->validationError(['name' => 'Name is required']);

        // type whitelist — reject anything but group/channel. We don't allow
        // creating 'direct' channels via this endpoint; DMs go through
        // CreateConversationAction (the existing 1:1 flow).
        $type = (string) ($data['type'] ?? 'group');
        if (!in_array($type, ['group', 'channel'], true)) {
            return $this->validationError(['type' => 'Must be "group" or "channel"']);
        }

        $channel = new Channel();
        $channel->setName($name);
        $channel->setDescription(isset($data['description']) && $data['description'] !== '' ? (string) $data['description'] : null);
        $channel->setType($type);
        $channel->setCreatedBy($userId);
        $this->em->persist($channel);

        // Flush once here so $channel->id is persisted and the audit log
        // below references a real row. Members are persisted after this
        // in a second flush with the membership rows.
        $this->em->flush();

        // Creator as admin
        $creator = $this->em->find(User::class, $userId);
        if ($creator !== null) {
            $cm = new ChannelMember();
            $cm->setChannel($channel);
            $cm->setUser($creator);
            $cm->setRole('admin');
            $this->em->persist($cm);
        }

        // Track which user IDs we've already added this request to avoid
        // duplicate persist calls (cheaper than round-tripping the DB
        // for a uniqueness lookup per add).
        $addedUserIds = [$userId => true];

        // Individual user_ids
        foreach (($data['user_ids'] ?? []) as $uid) {
            if (!is_string($uid) || isset($addedUserIds[$uid])) continue;
            $u = $this->em->find(User::class, $uid);
            if ($u === null) continue;
            $m = new ChannelMember();
            $m->setChannel($channel);
            $m->setUser($u);
            $this->em->persist($m);
            $addedUserIds[$uid] = true;
        }

        // By department
        if (!empty($data['department_ids']) && is_array($data['department_ids'])) {
            foreach ($data['department_ids'] as $did) {
                $users = $this->em->createQueryBuilder()
                    ->select('u')->from(User::class, 'u')
                    ->where('u.department = :d')->setParameter('d', $did)
                    ->getQuery()->getResult();
                foreach ($users as $u) {
                    $uid = $u->getId();
                    if (isset($addedUserIds[$uid])) continue;
                    $m = new ChannelMember();
                    $m->setChannel($channel);
                    $m->setUser($u);
                    $this->em->persist($m);
                    $addedUserIds[$uid] = true;
                }
            }
        }

        // By team
        if (!empty($data['team_ids']) && is_array($data['team_ids'])) {
            foreach ($data['team_ids'] as $tid) {
                $users = $this->em->createQueryBuilder()
                    ->select('u')->from(User::class, 'u')
                    ->where('u.team = :t')->setParameter('t', $tid)
                    ->getQuery()->getResult();
                foreach ($users as $u) {
                    $uid = $u->getId();
                    if (isset($addedUserIds[$uid])) continue;
                    $m = new ChannelMember();
                    $m->setChannel($channel);
                    $m->setUser($u);
                    $this->em->persist($m);
                    $addedUserIds[$uid] = true;
                }
            }
        }

        $this->em->flush();

        $this->audit->logCreate(
            $userId,
            'Channel',
            $channel->getId(),
            array_merge($channel->toArray(), ['initial_member_count' => count($addedUserIds)]),
            $this->getClientIp($request),
            $this->getUserAgent($request),
        );

        return $this->created($channel->toArray(), 'Channel created');
    }
}
