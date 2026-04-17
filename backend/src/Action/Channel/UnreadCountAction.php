<?php
declare(strict_types=1);
namespace App\Action\Channel;
use App\Domain\Entity\{ChannelMember, ChannelMessage, Message};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UnreadCountAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
        $userId = $request->getAttribute('user_id');
        // Count unread conversations
        $convCount = 0;
        try {
            $convCount = (int) $this->em->createQueryBuilder()
                ->select('COUNT(m.id)')->from(Message::class, 'm')
                ->join('m.conversation', 'c')
                ->where('c.participantTwo = :uid OR c.participantOne = :uid')
                ->andWhere('m.sender != :uid')
                ->andWhere('m.isRead = false')
                ->setParameter('uid', $userId)
                ->getQuery()->getSingleScalarResult();
        } catch (\Exception $e) {}

        // Count unread channel messages (messages sent after user's last read)
        $chanCount = 0;
        try {
            $memberChannels = $this->em->createQueryBuilder()
                ->select('IDENTITY(cm.channel)')->from(ChannelMember::class, 'cm')
                ->where('cm.user = :uid')->setParameter('uid', $userId)
                ->getQuery()->getSingleColumnResult();
            if (!empty($memberChannels)) {
                $chanCount = (int) $this->em->createQueryBuilder()
                    ->select('COUNT(cmsg.id)')->from(ChannelMessage::class, 'cmsg')
                    ->where('cmsg.channel IN (:cids)')
                    ->andWhere('cmsg.sender != :uid')
                    ->setParameter('cids', $memberChannels)
                    ->setParameter('uid', $userId)
                    ->getQuery()->getSingleScalarResult();
            }
        } catch (\Exception $e) {}

        return $this->success(['conversations' => $convCount, 'channels' => $chanCount, 'total' => $convCount + $chanCount]);
    }
}
