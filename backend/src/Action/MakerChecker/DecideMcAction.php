<?php
declare(strict_types=1);
namespace App\Action\MakerChecker;

use App\Domain\Repository\{MakerCheckerRepository, UserRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class DecideMcAction
{
    use ApiResponse;
    public function __construct(
        private readonly MakerCheckerRepository $mcRepo,
        private readonly UserRepository $userRepo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $mc = $this->mcRepo->find($args['id'] ?? '');
        if ($mc === null) return $this->notFound('Maker-checker request not found');
        if (!$mc->isPending()) return $this->error('Request has already been decided', 400);

        $userId = $request->getAttribute('user_id');
        if ($mc->getMaker()->getId() === $userId) return $this->error('Maker cannot be the checker for the same request', 403);

        $user = $this->userRepo->find($userId);
        if ($user === null) return $this->unauthorized('User not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $action = $data['action'] ?? '';
        $comment = $data['comment'] ?? null;

        if (!in_array($action, ['approve', 'reject'], true)) return $this->validationError(['action' => 'Must be "approve" or "reject"']);

        if ($action === 'approve') {
            $mc->approve($user, $comment);
        } else {
            $mc->reject($user, $comment);
        }

        $this->mcRepo->flush();
        $this->audit->logUpdate($userId, 'MakerCheckerRequest', $mc->getId(), ['status' => 'pending'], ['status' => $mc->getStatus()->value], $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($mc->toArray(), "Request {$action}d successfully");
    }
}
