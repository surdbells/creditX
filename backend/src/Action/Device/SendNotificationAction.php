<?php
declare(strict_types=1);
namespace App\Action\Device;

use App\Infrastructure\Service\{ApiResponse, PushNotificationService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class SendNotificationAction
{
    use ApiResponse;
    public function __construct(private readonly PushNotificationService $push) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        if (empty($data['title']) || empty($data['body'])) {
            return $this->validationError(['title' => 'Title and body are required']);
        }

        $title = $data['title'];
        $body = $data['body'];
        $extraData = $data['data'] ?? [];

        if (!empty($data['user_id'])) {
            // Send to specific user
            $result = $this->push->sendToUser($data['user_id'], $title, $body, $extraData);
        } elseif (!empty($data['user_ids'])) {
            // Send to multiple users
            $result = $this->push->sendToUsers($data['user_ids'], $title, $body, $extraData);
        } else {
            return $this->validationError(['user_id' => 'Specify user_id or user_ids']);
        }

        return $this->success($result, 'Notification sent');
    }
}
