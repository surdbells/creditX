<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\JournalEntry;
use App\Domain\Enum\JournalEntryType;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\GeneralLedgerRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * OpeningBalanceService — seeds the GL with day-one opening balances.
 *
 * When a bank migrates onto CreditX it already has balances: cash in the
 * bank, an existing loan book, share capital, fixed assets, etc. Rather
 * than make the accountant hand-compute a giant balancing contra line,
 * this service takes each account's opening balance on its natural side
 * and posts the difference to "Opening Balance Equity" (OBE) so the
 * journal balances.
 *
 * OBE is a clearing account: once every real opening balance has been
 * entered, OBE should net to zero. A non-zero OBE balance afterwards is
 * a signal that the opening trial balance the bank handed over didn't
 * itself balance — which is worth surfacing rather than hiding.
 *
 * This is a manual journal under the hood (type MANUAL, posted via
 * LedgerService::postJournal) so it inherits the same DR==CR validation,
 * header, and audit trail as everything else.
 *
 * ## Re-run guard
 *
 * Opening balances are conceptually a one-time event. Running this twice
 * would double the equity. We refuse if OBE already has any postings,
 * unless the caller explicitly passes $force (e.g. to correct a
 * mis-entered opening balance — though a reversing manual journal is
 * usually the cleaner fix).
 */
final class OpeningBalanceService
{
    private const OBE_CODE = 'OBE';

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly GeneralLedgerRepository $glRepo,
        private readonly PeriodGuardService $periodGuard,
        private readonly LedgerService $ledger,
        private readonly GlMappingService $glMapping,
    ) {}

    /**
     * Post opening balances.
     *
     * @param string $postingDate YYYY-MM-DD — typically the go-live date
     * @param array<int, array<string, mixed>> $balances each: {
     *     gl_id: string (required),
     *     type: 'DR'|'CR' (required — the natural side of the balance),
     *     amount: string|float positive (required)
     * }
     * @param string|null $userId
     * @param bool $force bypass the re-run guard
     *
     * @throws DomainException on validation / re-run failure
     */
    public function post(
        string $postingDate,
        array $balances,
        ?string $userId,
        bool $force = false,
    ): JournalEntry {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $postingDate)) {
            throw new DomainException('posting_date must be a valid YYYY-MM-DD date.');
        }
        $this->periodGuard->assertDateOpen($postingDate);

        if (count($balances) === 0) {
            throw new DomainException('At least one opening balance is required.');
        }

        // Default Ledgers override for Opening Balance Equity, else seeded OBE.
        $obe = $this->glMapping->resolveByCode(self::OBE_CODE);
        if ($obe === null) {
            throw new DomainException(
                'Opening Balance Equity GL (OBE) not found. Run bin/migrate-expand-chart-of-accounts.php.'
            );
        }

        if (!$force && $this->obeHasPostings($obe->getId())) {
            throw new DomainException(
                'Opening balances have already been posted (Opening Balance Equity already has activity). '
              . 'Pass force=true to post anyway, or record a correcting manual journal instead.'
            );
        }

        // Resolve + normalise each real-account line, accumulating the
        // DR/CR totals so we can compute the OBE balancing line.
        $lines = [];
        $totalDr = '0.00';
        $totalCr = '0.00';
        foreach ($balances as $i => $b) {
            $human = $i + 1;

            $glId = isset($b['gl_id']) ? (string) $b['gl_id'] : '';
            if ($glId === '') {
                throw new DomainException("Balance {$human}: gl_id is required.");
            }
            $gl = $this->glRepo->find($glId);
            if ($gl === null) {
                throw new DomainException("Balance {$human}: GL account {$glId} not found.");
            }
            if (!$gl->isActive()) {
                throw new DomainException("Balance {$human}: GL account {$gl->getAccountCode()} is inactive.");
            }
            if ($gl->getId() === $obe->getId()) {
                throw new DomainException('Do not include Opening Balance Equity itself — it is computed automatically.');
            }

            $typeRaw = strtoupper(trim((string) ($b['type'] ?? '')));
            $type = TransactionType::tryFrom($typeRaw);
            if ($type === null) {
                throw new DomainException("Balance {$human}: type must be 'DR' or 'CR'.");
            }

            $amount = isset($b['amount']) ? (string) $b['amount'] : '';
            if (!preg_match('/^\d+(\.\d{1,2})?$/', $amount) || bccomp($amount, '0.00', 2) <= 0) {
                throw new DomainException("Balance {$human}: amount must be a positive number.");
            }

            $lines[] = [
                'gl'        => $gl,
                'type'      => $type,
                'amount'    => $amount,
                'narration' => 'Opening balance',
            ];

            if ($type === TransactionType::DR) {
                $totalDr = bcadd($totalDr, $amount, 2);
            } else {
                $totalCr = bcadd($totalCr, $amount, 2);
            }
        }

        // Compute the balancing OBE line. If debits exceed credits the
        // contra is a credit to OBE, and vice versa.
        $diff = bcsub($totalDr, $totalCr, 2);
        $absDiff = ltrim($diff, '-');
        if (bccomp($absDiff, '0.00', 2) > 0) {
            $obeType = bccomp($diff, '0.00', 2) > 0 ? TransactionType::CR : TransactionType::DR;
            $lines[] = [
                'gl'        => $obe,
                'type'      => $obeType,
                'amount'    => $absDiff,
                'narration' => 'Opening balance equity (balancing contra)',
            ];
        }
        // If the submitted balances already net to zero, OBE needs no
        // line — but postJournal requires the whole batch to balance,
        // which it does in that case.

        $this->em->beginTransaction();
        try {
            $journal = $this->ledger->postJournal(
                entryType: JournalEntryType::MANUAL,
                postingDate: $postingDate,
                narration: 'Opening balances as at ' . $postingDate,
                postedBy: $userId,
                lines: $lines,
                reference: 'OPENING-BALANCE',
            );
            $this->em->commit();

            return $journal;
        } catch (\Throwable $e) {
            $this->em->rollback();
            throw $e;
        }
    }

    /**
     * True if the OBE account already has any ledger lines — the signal
     * that opening balances were posted before.
     */
    private function obeHasPostings(string $obeId): bool
    {
        $count = (int) $this->em->getConnection()->fetchOne(
            'SELECT COUNT(*) FROM ledger_transactions WHERE gl_id = :gl',
            ['gl' => $obeId]
        );
        return $count > 0;
    }
}
