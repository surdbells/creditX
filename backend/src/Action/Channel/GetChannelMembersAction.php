<?php
declare(strict_types=1);
namespace App\Action\Channel;
use App\Domain\Entity\{Channel, ChannelMember};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GetChannelMembersAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface {
        $channel = $this->em->find(Channel::class, $args['id'] ?? '');
        if (!$channel) return $this->notFound('Channel not found');
        $members = $this->em->getRepository(ChannelMember::class)->findBy(['channel' => $channel]);
        $result = array_map(fn($m) => [
            'id' => $m->getId(), 'user_id' => $m->getUser()->getId(),
            'user_name' => $m->getUser()->getFullName(), 'email' => $m->getUser()->getEmail(),
            'role' => $m->getRole(),
        ], $members);
        return $this->success($result);
    }
}
