<?php
declare(strict_types=1);
namespace App\Action\Notification;

use App\Domain\Entity\NotificationTemplate;
use App\Domain\Enum\NotificationChannel;
use App\Domain\Repository\NotificationTemplateRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateTemplateAction
{
    use ApiResponse;
    public function __construct(private readonly NotificationTemplateRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'name'          => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 100],
            'code'          => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 50],
            'channel'       => ['required' => true, 'type' => 'string', 'in' => array_column(NotificationChannel::cases(), 'value')],
            'subject'       => ['required' => false, 'type' => 'string', 'max' => 200],
            'body'          => ['required' => true, 'type' => 'string'],
            'event_trigger' => ['required' => false, 'type' => 'string', 'max' => 50],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);
        if ($this->repo->codeExists($v['clean']['code'])) return $this->validationError(['code' => 'Template code already exists']);

        $t = new NotificationTemplate();
        $t->setName($v['clean']['name']);
        $t->setCode($v['clean']['code']);
        $t->setChannel(NotificationChannel::from($v['clean']['channel']));
        $t->setSubject($v['clean']['subject'] ?? null);
        $t->setBody($v['clean']['body']);
        $t->setEventTrigger($v['clean']['event_trigger'] ?? null);
        $this->repo->save($t);

        $this->audit->logCreate($request->getAttribute('user_id'), 'NotificationTemplate', $t->getId(), $t->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($t->toArray(), 'Notification template created');
    }
}
