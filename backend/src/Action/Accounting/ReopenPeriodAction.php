<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\AccountingPeriod;
use App\Infrastructure\Service\{ApiResponse, PeriodCloseService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Reopen a closed period. Body: { reason? }. Reverses the closing
 * journal and flips status back to OPEN. Logged via the reversal
 * service's audit trail.
 *
 * Gated by accounting.close.reopen — a stricter permission than
 * accounting.close because reopening is a rescue operation that
 * should only be available to accounting leads.
 */
final class ReopenPeriodAction
{
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly PeriodCloseService $closeService,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();

        $periodId = $args['id'] ?? '';
        $period = $this->em->find(AccountingPeriod::class, $periodId);
        if ($period === null) return $this->notFound('Period not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $reason = $data['reason'] ?? null;

        try {
            $result = $this->closeService->reopenPeriod($period, $userId, $reason);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        } catch (\Throwable $e) {
            return $this->error('Reopen failed: ' . $e->getMessage(), 500);
        }

        return $this->success($result, "Period {$period->getLabel()} reopened");
    }
}
