<?php
declare(strict_types=1);
namespace App\Action\Channel;
use App\Domain\Entity\{Channel, ChannelMember};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListChannelsAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
        $userId = $request->getAttribute('user_id');
        // Get channels where user is a member
        $qb = $this->em->createQueryBuilder()
            ->select('c')->from(Channel::class, 'c')
            ->innerJoin(ChannelMember::class, 'cm', 'WITH', 'cm.channel = c.id AND cm.user = :uid')
            ->setParameter('uid', $userId)
            ->where('c.isActive = true')
            ->orderBy('c.createdAt', 'DESC');
        $channels = $qb->getQuery()->getResult();

        // Add member count + unread for each
        $result = [];
        foreach ($channels as $ch) {
            $data = $ch->toArray();
            $data['member_count'] = (int) $this->em->createQueryBuilder()
                ->select('COUNT(m.id)')->from(ChannelMember::class, 'm')
                ->where('m.channel = :cid')->setParameter('cid', $ch->getId())
                ->getQuery()->getSingleScalarResult();
            $result[] = $data;
        }
        return $this->success($result);
    }
}
