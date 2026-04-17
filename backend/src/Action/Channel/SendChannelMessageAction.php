<?php
declare(strict_types=1);
namespace App\Action\Channel;
use App\Domain\Entity\{Channel, ChannelMessage, User};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class SendChannelMessageAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface {
        $channel = $this->em->find(Channel::class, $args['id']);
        if (!$channel) return $this->notFound('Channel not found');
        $data = (array) ($request->getParsedBody() ?? []);
        if (empty($data['body'])) return $this->validationError(['body' => 'Message body is required']);
        $sender = $this->em->find(User::class, $request->getAttribute('user_id'));
        if (!$sender) return $this->unauthorized('User not found');
        $msg = new ChannelMessage(); $msg->setChannel($channel); $msg->setSender($sender); $msg->setBody($data['body']);
        $this->em->persist($msg); $this->em->flush();
        return $this->created($msg->toArray(), 'Message sent');
    }
}
