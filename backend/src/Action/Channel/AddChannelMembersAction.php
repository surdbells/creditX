<?php
declare(strict_types=1);
namespace App\Action\Channel;
use App\Domain\Entity\{Channel, ChannelMember, User};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class AddChannelMembersAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface {
        $channel = $this->em->find(Channel::class, $args['id'] ?? '');
        if (!$channel) return $this->notFound('Channel not found');
        $data = (array) ($request->getParsedBody() ?? []);
        $added = 0;

        foreach (($data['user_ids'] ?? []) as $uid) {
            $u = $this->em->find(User::class, $uid); if (!$u) continue;
            $existing = $this->em->getRepository(ChannelMember::class)->findOneBy(['channel' => $channel, 'user' => $u]);
            if (!$existing) { $m = new ChannelMember(); $m->setChannel($channel); $m->setUser($u); $this->em->persist($m); $added++; }
        }
        foreach (($data['department_ids'] ?? []) as $did) {
            $users = $this->em->createQueryBuilder()->select('u')->from(User::class, 'u')->where('u.department = :d')->setParameter('d', $did)->getQuery()->getResult();
            foreach ($users as $u) { $ex = $this->em->getRepository(ChannelMember::class)->findOneBy(['channel' => $channel, 'user' => $u]); if (!$ex) { $m = new ChannelMember(); $m->setChannel($channel); $m->setUser($u); $this->em->persist($m); $added++; } }
        }
        foreach (($data['team_ids'] ?? []) as $tid) {
            $users = $this->em->createQueryBuilder()->select('u')->from(User::class, 'u')->where('u.team = :t')->setParameter('t', $tid)->getQuery()->getResult();
            foreach ($users as $u) { $ex = $this->em->getRepository(ChannelMember::class)->findOneBy(['channel' => $channel, 'user' => $u]); if (!$ex) { $m = new ChannelMember(); $m->setChannel($channel); $m->setUser($u); $this->em->persist($m); $added++; } }
        }

        $this->em->flush();
        return $this->success(['added' => $added], "{$added} members added");
    }
}
