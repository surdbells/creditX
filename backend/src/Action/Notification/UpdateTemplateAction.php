<?php
declare(strict_types=1);
namespace App\Action\Notification;

use App\Domain\Enum\NotificationChannel;
use App\Domain\Repository\NotificationTemplateRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateTemplateAction
{
    use ApiResponse;
    public function __construct(private readonly NotificationTemplateRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $t = $this->repo->find($args['id'] ?? '');
        if ($t === null) return $this->notFound('Template not found');

        $old = $t->toArray();
        $data = (array) ($request->getParsedBody() ?? []);

        if (isset($data['name']) && $data['name'] !== '') $t->setName($data['name']);
        if (isset($data['channel'])) $t->setChannel(NotificationChannel::from($data['channel']));
        if (isset($data['subject'])) $t->setSubject($data['subject']);
        if (isset($data['body']) && $data['body'] !== '') $t->setBody($data['body']);
        if (isset($data['event_trigger'])) $t->setEventTrigger($data['event_trigger']);
        if (isset($data['is_active'])) $t->setIsActive(filter_var($data['is_active'], FILTER_VALIDATE_BOOLEAN));

        $this->repo->flush();
        $this->audit->logUpdate($request->getAttribute('user_id'), 'NotificationTemplate', $t->getId(), $old, $t->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($t->toArray(), 'Template updated');
    }
}
