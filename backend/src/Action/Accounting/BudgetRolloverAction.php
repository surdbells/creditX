<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\Budget;
use App\Domain\Entity\GeneralLedger;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Budget Rollover — copy budgets from one month to one or more
 * target months, optionally applying a multiplier (e.g. 1.05 for
 * 5% growth year-over-year).
 *
 * Contract:
 *   POST /api/accounting/budgets/rollover
 *   Body: {
 *     source:  'YYYY-MM',      // month to copy from
 *     targets: ['YYYY-MM', …], // months to copy to
 *     multiplier: number,      // e.g. 1.0 for exact copy, 1.05 for +5%
 *     overwrite: bool,         // false = skip existing rows; true = replace
 *   }
 *
 * Response: { status, data: {
 *   copied: N,
 *   skipped: N,          // existing rows when overwrite=false
 *   overwritten: N,      // existing rows replaced when overwrite=true
 *   targets_processed: [
 *     { label, copied, skipped, overwritten }
 *   ]
 * }}
 *
 * ## Why a separate endpoint vs multiple POST /budgets calls
 *
 * One transactional round-trip for N target months × M source rows.
 * The alternative — have the frontend loop and hit the upsert endpoint
 * N×M times — works but is slow (dozens of round-trips) and loses
 * atomicity (a network blip mid-loop leaves the period half-rolled).
 *
 * ## Multiplier semantics
 *
 * amount_new = round(amount_source × multiplier, 2)
 *
 * Multipliers > 1.0 grow the budget, < 1.0 shrink. Exact copy is
 * multiplier = 1.0. Negative multipliers are rejected (doesn't model
 * any meaningful scenario). Zero is allowed (creates ₦0 targets —
 * useful as a 'reset' operation, though callers usually want delete).
 *
 * Gated by accounting.budget.
 */
final class BudgetRolloverAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();

        $data = (array) ($request->getParsedBody() ?? []);
        $source = (string) ($data['source'] ?? '');
        $targets = (array) ($data['targets'] ?? []);
        $multiplier = (string) ($data['multiplier'] ?? '1.0');
        $overwrite = (bool) ($data['overwrite'] ?? false);

        // Validate inputs — each YYYY-MM, multiplier >= 0, at least
        // one target that's distinct from the source.
        $errors = [];
        if (!preg_match('/^\d{4}-\d{2}$/', $source)) {
            $errors['source'] = 'Must be YYYY-MM';
        }
        if (empty($targets)) {
            $errors['targets'] = 'At least one target month required';
        } else {
            foreach ($targets as $t) {
                if (!preg_match('/^\d{4}-\d{2}$/', (string) $t)) {
                    $errors['targets'] = 'Every target must be YYYY-MM';
                    break;
                }
                if ($t === $source) {
                    $errors['targets'] = 'Target cannot equal source (would overwrite itself)';
                    break;
                }
            }
        }
        if (!is_numeric($multiplier) || (float) $multiplier < 0) {
            $errors['multiplier'] = 'Must be a non-negative number';
        }
        if ($errors) return $this->validationError($errors);

        [$srcYear, $srcMonth] = explode('-', $source);

        // Load source budgets. If the source month has no budgets,
        // return zero-counts without erroring — the operator simply
        // has nothing to roll over.
        $sourceBudgets = $this->em->getRepository(Budget::class)
            ->findBy(['year' => $srcYear, 'month' => $srcMonth]);

        if (empty($sourceBudgets)) {
            return $this->success([
                'copied' => 0,
                'skipped' => 0,
                'overwritten' => 0,
                'targets_processed' => [],
                'message' => "No budgets found in source month {$source}",
            ]);
        }

        // For each target: for each source row, either insert or
        // overwrite the (gl, target_year, target_month) row.
        $perTarget = [];
        $totalCopied = 0;
        $totalSkipped = 0;
        $totalOverwritten = 0;

        $this->em->beginTransaction();
        try {
            foreach ($targets as $target) {
                [$tgtYear, $tgtMonth] = explode('-', (string) $target);
                $copied = 0;
                $skipped = 0;
                $overwritten = 0;

                foreach ($sourceBudgets as $src) {
                    $gl = $src->getGeneralLedger();
                    $existing = $this->em->getRepository(Budget::class)
                        ->findOneBy([
                            'generalLedger' => $gl,
                            'year' => $tgtYear,
                            'month' => $tgtMonth,
                        ]);

                    $newAmount = bcmul($src->getAmount(), $multiplier, 2);
                    $note = "Rolled over from {$source}";
                    if (bccomp($multiplier, '1.00', 2) !== 0) {
                        $note .= " × {$multiplier}";
                    }

                    if ($existing !== null) {
                        if ($overwrite) {
                            $existing->setAmount($newAmount);
                            $existing->setNotes($note);
                            $overwritten++;
                        } else {
                            $skipped++;
                        }
                    } else {
                        $b = new Budget();
                        $b->setGeneralLedger($gl);
                        $b->setYear($tgtYear);
                        $b->setMonth($tgtMonth);
                        $b->setAmount($newAmount);
                        $b->setNotes($note);
                        $b->setCreatedBy($userId);
                        $this->em->persist($b);
                        $copied++;
                    }
                }

                $perTarget[] = [
                    'label' => $target,
                    'copied' => $copied,
                    'skipped' => $skipped,
                    'overwritten' => $overwritten,
                ];
                $totalCopied += $copied;
                $totalSkipped += $skipped;
                $totalOverwritten += $overwritten;
            }

            $this->em->flush();
            $this->em->commit();
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) {
                $this->em->rollback();
            }
            throw $e;
        }

        return $this->success([
            'copied' => $totalCopied,
            'skipped' => $totalSkipped,
            'overwritten' => $totalOverwritten,
            'targets_processed' => $perTarget,
        ], sprintf(
            'Rollover complete: %d copied, %d skipped, %d overwritten across %d target month(s)',
            $totalCopied, $totalSkipped, $totalOverwritten, count($targets),
        ));
    }
}
