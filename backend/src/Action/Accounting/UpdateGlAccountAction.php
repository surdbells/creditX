<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Enum\{AccountType, LedgerType};
use App\Domain\Repository\GeneralLedgerRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateGlAccountAction
{
    use ApiResponse;
    public function __construct(private readonly GeneralLedgerRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $gl = $this->repo->find($args['id'] ?? '');
        if ($gl === null) return $this->notFound('GL account not found');

        $old = $gl->toArray();
        $data = (array) ($request->getParsedBody() ?? []);

        if (isset($data['account_name']) && $data['account_name'] !== '') $gl->setAccountName($data['account_name']);
        if (isset($data['description'])) $gl->setDescription($data['description']);
        if (isset($data['account_type'])) $gl->setAccountType(AccountType::from($data['account_type']));
        if (isset($data['is_active'])) $gl->setIsActive(filter_var($data['is_active'], FILTER_VALIDATE_BOOLEAN));

        $this->repo->flush();
        $this->audit->logUpdate($request->getAttribute('user_id'), 'GeneralLedger', $gl->getId(), $old, $gl->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($gl->toArray(), 'GL account updated successfully');
    }
}
