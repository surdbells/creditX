<?php
declare(strict_types=1);
namespace App\Action\Messaging;

use App\Domain\Entity\Message;
use App\Domain\Repository\ConversationRepository;
use App\Infrastructure\Service\{ApiResponse, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class SendMessageAction
{
    use ApiResponse;
    public function __construct(private readonly ConversationRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $conv = $this->repo->find($args['id'] ?? '');
        if ($conv === null) return $this->notFound('Conversation not found');

        if ($conv->getStatus()->value === 'closed') {
            return $this->error('Cannot send messages to a closed conversation', 400);
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $body = trim($data['message'] ?? $data['body'] ?? '');
        if ($body === '') return $this->validationError(['message' => 'Message body is required']);

        $userId = $request->getAttribute('user_id');

        $msg = new Message();
        $msg->setSenderId($userId);
        $msg->setBody($body);

        // Handle file attachment
        $uploadedFiles = $request->getUploadedFiles();
        $attachment = $uploadedFiles['attachment'] ?? null;
        if ($attachment !== null && $attachment->getError() === UPLOAD_ERR_OK) {
            $originalName = $attachment->getClientFilename() ?? 'attachment';
            $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
            $safeName = bin2hex(random_bytes(12)) . '.' . $ext;
            $storagePath = $_ENV['STORAGE_PATH'] ?? 'storage/uploads';
            $subDir = 'messages/' . $conv->getId();
            $fullDir = rtrim($storagePath, '/') . '/' . $subDir;
            if (!is_dir($fullDir)) mkdir($fullDir, 0755, true);
            $attachment->moveTo($fullDir . '/' . $safeName);

            $msg->setAttachmentPath($subDir . '/' . $safeName);
            $msg->setAttachmentName($originalName);
            $msg->setAttachmentMime($attachment->getClientMediaType() ?? 'application/octet-stream');
        }

        $conv->addMessage($msg);
        $this->repo->flush();

        return $this->created($msg->toArray(), 'Message sent');
    }
}
