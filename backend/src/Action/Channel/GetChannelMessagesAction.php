<?php
declare(strict_types=1);
namespace App\Action\Channel;
use App\Domain\Entity\ChannelMessage;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GetChannelMessagesAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface {
        $msgs = $this->em->createQueryBuilder()
            ->select('m')->from(ChannelMessage::class, 'm')
            ->where('m.channel = :cid')->setParameter('cid', $args['id'])
            ->orderBy('m.createdAt', 'ASC')
            ->setMaxResults(200)
            ->getQuery()->getResult();
        return $this->success(array_map(fn($m) => $m->toArray(), $msgs));
    }
}
