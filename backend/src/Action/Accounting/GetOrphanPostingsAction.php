<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\CustomerLedger;
use App\Domain\Entity\GeneralLedger;
use App\Domain\Entity\LedgerTransaction;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/accounting/gl-accounts/{id}/orphan-postings
 *
 * Returns every LedgerTransaction on a given GL that has
 * customer_ledger_id IS NULL. For CUSTOMER-type parent GLs (the
 * ones that host sub-ledgers), these are the orphan rows flagged
 * by the GL Reconciliation report.
 *
 * Typical causes we've seen in the wild:
 *   - Top-up disbursement rolled the previous loan's balance
 *     forward by posting a CR to the parent GL without attaching
 *     it to the previous customer ledger (pre-2026-04 fix).
 *   - Manual journal entries created via the admin tool without
 *     selecting a customer ledger.
 *   - Imported data from legacy systems that didn't track
 *     sub-ledger linkage.
 *
 * Shape mirrors what ListJournalEntriesAction returns per row,
 * so the frontend can reuse the same renderer. Also includes
 * candidate sub-ledgers on the same GL so the reassign UI can
 * present them directly without a second round-trip.
 *
 * Gated by accounting.view.
 */
final class GetOrphanPostingsAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $glId = $args['id'] ?? '';
        $gl = $this->em->find(GeneralLedger::class, $glId);
        if ($gl === null) return $this->notFound('GL account not found');

        // Orphan postings — no customer ledger linkage. Ordered by
        // created_at DESC so the most recent offenders surface first.
        $orphans = $this->em->createQueryBuilder()
            ->select('t')
            ->from(LedgerTransaction::class, 't')
            ->where('t.generalLedger = :gl')
            ->andWhere('t.customerLedger IS NULL')
            ->setParameter('gl', $gl)
            ->orderBy('t.createdAt', 'DESC')
            ->getQuery()
            ->getResult();

        // Candidate sub-ledgers on this same GL — so the reassign
        // modal can show them as a dropdown. Sorted by account
        // number for stable display.
        $candidates = $this->em->createQueryBuilder()
            ->select('cl')
            ->from(CustomerLedger::class, 'cl')
            ->where('cl.generalLedger = :gl')
            ->setParameter('gl', $gl)
            ->orderBy('cl.accountNumber', 'ASC')
            ->getQuery()
            ->getResult();

        return $this->success([
            'gl' => [
                'id'           => $gl->getId(),
                'code'         => $gl->getAccountCode(),
                'name'         => $gl->getAccountName(),
                'account_type' => $gl->getAccountType()->value,
                'ledger_type'  => $gl->getLedgerType()->value,
            ],
            'orphan_postings' => array_map(
                fn(LedgerTransaction $t) => $this->postingRow($t),
                $orphans,
            ),
            'candidate_ledgers' => array_map(
                fn(CustomerLedger $cl) => [
                    'id'             => $cl->getId(),
                    'account_number' => $cl->getAccountNumber(),
                    'customer_name'  => $cl->getCustomer()?->getFullName(),
                    'loan_ref'       => $cl->getLoan()?->getApplicationId(),
                ],
                $candidates,
            ),
        ]);
    }

    /**
     * Minimal row shape — everything the frontend needs to render
     * an orphan entry with enough context for the operator to
     * choose a destination ledger.
     */
    private function postingRow(LedgerTransaction $t): array
    {
        return [
            'id'              => $t->getId(),
            'trans_type'      => $t->getTransType()->value,
            'trans_amount'    => $t->getTransAmount(),
            'trans_narration' => $t->getTransNarration(),
            'trans_reference' => $t->getTransReference(),
            'trans_callback'  => $t->getTransCallback(),
            'trans_date'      => $t->getTransYear() . '-' . $t->getTransMonth() . '-' . $t->getTransDay(),
            'posted_by'       => $t->getPostedBy(),
            'created_at'      => $t->getCreatedAt()->format('Y-m-d H:i:s'),
        ];
    }
}
