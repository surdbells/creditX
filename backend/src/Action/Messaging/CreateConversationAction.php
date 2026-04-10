<?php
declare(strict_types=1);
namespace App\Action\Messaging;

use App\Domain\Entity\{Conversation, Message};
use App\Domain\Repository\{ConversationRepository, UserRepository};
use App\Infrastructure\Service\{ApiResponse, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateConversationAction
{
    use ApiResponse;
    public function __construct(private readonly ConversationRepository $repo, private readonly UserRepository $userRepo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'subject' => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 200],
            'message' => ['required' => true, 'type' => 'string', 'min' => 1],
            'loan_id' => ['required' => false, 'type' => 'string'],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);

        $userId = $request->getAttribute('user_id');
        $agent = $this->userRepo->find($userId);
        if ($agent === null) return $this->unauthorized();

        $conv = new Conversation();
        $conv->setAgent($agent);
        $conv->setSubject($v['clean']['subject']);
        $conv->setLoanId($v['clean']['loan_id'] ?? null);

        $msg = new Message();
        $msg->setSenderId($userId);
        $msg->setBody($v['clean']['message']);
        $conv->addMessage($msg);

        $this->repo->save($conv);
        return $this->created($conv->toArray(true, $userId), 'Conversation created');
    }
}
