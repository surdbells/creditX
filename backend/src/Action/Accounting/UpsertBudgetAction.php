<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\Budget;
use App\Domain\Entity\GeneralLedger;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Upsert a budget row — create a new budget line or update the
 * amount/notes on an existing (gl_id, year, month) combination.
 *
 * Contract:
 *   POST /api/accounting/budgets
 *   Body: { gl_id, year, month, amount, notes? }
 *
 * The unique constraint on (gl_id, year, month) guarantees at most
 * one row per combination; we lookup-then-update vs rely on the
 * constraint-violation catch pattern (cleaner error handling).
 *
 * Gated by accounting.budget.
 */
final class UpsertBudgetAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();

        $data = (array) ($request->getParsedBody() ?? []);
        $glId = $data['gl_id'] ?? '';
        $year = (string) ($data['year'] ?? '');
        $month = str_pad((string) ($data['month'] ?? ''), 2, '0', STR_PAD_LEFT);
        $amount = (string) ($data['amount'] ?? '0');
        $notes = $data['notes'] ?? null;

        // Basic validation — year/month format + gl existence.
        $errors = [];
        if (!preg_match('/^\d{4}$/', $year)) $errors['year'] = 'Must be YYYY';
        if (!preg_match('/^\d{2}$/', $month) || (int)$month < 1 || (int)$month > 12) {
            $errors['month'] = 'Must be 01–12';
        }
        if (!is_numeric($amount) || (float) $amount < 0) {
            $errors['amount'] = 'Must be a non-negative number';
        }
        $gl = $this->em->find(GeneralLedger::class, $glId);
        if ($gl === null) $errors['gl_id'] = 'General ledger account not found';
        if ($errors) return $this->validationError($errors);

        // Look up existing row or create new.
        $repo = $this->em->getRepository(Budget::class);
        $budget = $repo->findOneBy([
            'generalLedger' => $gl,
            'year' => $year,
            'month' => $month,
        ]);

        $isNew = false;
        if ($budget === null) {
            $budget = new Budget();
            $budget->setGeneralLedger($gl);
            $budget->setYear($year);
            $budget->setMonth($month);
            $budget->setCreatedBy($userId);
            $this->em->persist($budget);
            $isNew = true;
        }
        $budget->setAmount($amount);
        $budget->setNotes($notes);
        $this->em->flush();

        return $this->success(
            $budget->toArray(),
            $isNew ? 'Budget created' : 'Budget updated',
        );
    }
}
