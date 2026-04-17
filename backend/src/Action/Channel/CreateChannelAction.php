<?php
declare(strict_types=1);
namespace App\Action\Channel;
use App\Domain\Entity\{Channel, ChannelMember, User, Department, Team};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateChannelAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
        $data = (array) ($request->getParsedBody() ?? []);
        $userId = $request->getAttribute('user_id');
        if (empty($data['name'])) return $this->validationError(['name' => 'Name is required']);

        $channel = new Channel();
        $channel->setName($data['name']);
        $channel->setDescription($data['description'] ?? null);
        $channel->setType($data['type'] ?? 'group');
        $channel->setCreatedBy($userId);
        $this->em->persist($channel);

        // Add creator as admin
        $creator = $this->em->find(User::class, $userId);
        if ($creator) {
            $cm = new ChannelMember(); $cm->setChannel($channel); $cm->setUser($creator); $cm->setRole('admin');
            $this->em->persist($cm);
        }

        // Add individual user_ids
        foreach (($data['user_ids'] ?? []) as $uid) {
            if ($uid === $userId) continue;
            $u = $this->em->find(User::class, $uid);
            if ($u) { $m = new ChannelMember(); $m->setChannel($channel); $m->setUser($u); $this->em->persist($m); }
        }

        // Add by department
        if (!empty($data['department_ids'])) {
            foreach ($data['department_ids'] as $did) {
                $users = $this->em->createQueryBuilder()->select('u')->from(User::class, 'u')
                    ->where('u.department = :did')->setParameter('did', $did)->getQuery()->getResult();
                foreach ($users as $u) {
                    if ($u->getId() === $userId) continue;
                    $existing = $this->em->getRepository(ChannelMember::class)->findOneBy(['channel' => $channel, 'user' => $u]);
                    if (!$existing) { $m = new ChannelMember(); $m->setChannel($channel); $m->setUser($u); $this->em->persist($m); }
                }
            }
        }

        // Add by team
        if (!empty($data['team_ids'])) {
            foreach ($data['team_ids'] as $tid) {
                $users = $this->em->createQueryBuilder()->select('u')->from(User::class, 'u')
                    ->where('u.team = :tid')->setParameter('tid', $tid)->getQuery()->getResult();
                foreach ($users as $u) {
                    if ($u->getId() === $userId) continue;
                    $existing = $this->em->getRepository(ChannelMember::class)->findOneBy(['channel' => $channel, 'user' => $u]);
                    if (!$existing) { $m = new ChannelMember(); $m->setChannel($channel); $m->setUser($u); $this->em->persist($m); }
                }
            }
        }

        $this->em->flush();
        return $this->created($channel->toArray(), 'Channel created');
    }
}
