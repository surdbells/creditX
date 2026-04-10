<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Entity\LoanTrail;
use App\Domain\Enum\LoanStatus;
use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CancelLoanAction
{
    use ApiResponse;
    public function __construct(private readonly LoanRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->repo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        try {
            $loan->transitionTo(LoanStatus::CANCELLED);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $userId = $request->getAttribute('user_id');
        $trail = new LoanTrail();
        $trail->setUserId($userId);
        $trail->setAction('Loan cancelled');
        $trail->setDetails(['reason' => $data['reason'] ?? 'No reason provided']);
        $trail->setIpAddress($this->getClientIp($request));
        $loan->addTrail($trail);

        $this->repo->flush();
        $this->audit->logUpdate($userId, 'Loan', $loan->getId(), ['status' => 'previous'], ['status' => LoanStatus::CANCELLED->value], $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($loan->toArray(), 'Loan cancelled');
    }
}
