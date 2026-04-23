<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\Budget;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Delete a budget row. Hard delete — budgets are not audited at the
 * entity level, so there's no soft-delete story; if audit is needed,
 * add to the AuditLog trail inline.
 *
 * Contract:
 *   DELETE /api/accounting/budgets/{id}
 *
 * Gated by accounting.budget.
 */
final class DeleteBudgetAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = $args['id'] ?? '';
        $budget = $this->em->find(Budget::class, $id);
        if ($budget === null) return $this->notFound('Budget not found');

        $this->em->remove($budget);
        $this->em->flush();

        return $this->success(['id' => $id], 'Budget deleted');
    }
}
