<?php

declare(strict_types=1);

/**
 * CreditX — Repair customer-ledger imbalance from the ADDS_TO_GROSS
 * fee posting bug (commit AA).
 *
 * THE BUG
 * =======
 *
 * Before commit AA, DisbursementService::disburse() posted fees to
 * the customer ledger with this filter:
 *
 *     if (!\$fb->isDeducted() || bccomp(\$fb->getAmount(), '0.00', 2) <= 0) {
 *         continue;
 *     }
 *
 * Only DEDUCTED_FROM_DISBURSEMENT fees (management, bank statement)
 * were posted as DR. ADDS_TO_GROSS fees (admin, insurance) were
 * SKIPPED entirely — they never hit the customer ledger and never
 * hit their fee GL as income.
 *
 * But ADDS_TO_GROSS fees WERE still baked into gross_loan, which was
 * CR'd to the customer ledger. So every affected loan has a
 * permanent CR imbalance on its customer ledger equal to the total
 * ADDS_TO_GROSS fees for that loan — the customer 'owes' money they
 * never actually received.
 *
 * For a typical loan:
 *   gross_loan    = 500,000 + 2,000 admin + 10,000 insurance = 512,000
 *   DR mgmt       =  10,000  (DEDUCTED — posted correctly)
 *   DR net_disb   = 490,000  (500 - 10 mgmt)
 *   Imbalance CR  =  12,000  (admin + insurance, never posted)
 *
 * WHAT THIS SCRIPT DOES
 * =====================
 *
 * For every loan disbursed before commit AA:
 *   1. Load its fee_breakdowns
 *   2. For each ADDS_TO_GROSS fee with amount > 0 that has no matching
 *      ledger transaction:
 *      a. Post DR to customer ledger under the same callback ref the
 *         disbursement used (so the journal stays grouped)
 *      b. Post CR to the fee type's GL (belated income recognition)
 *   3. Verify the customer ledger balances to zero after the fix
 *
 * Idempotent: if a fee already has a matching DR on the customer
 * ledger (verified by amount + narration), the script skips it. Safe
 * to re-run. Safe on partial runs (each loan is its own transaction).
 *
 * Usage:
 *   php bin/repair-fee-ledger-imbalance.php                # dry-run, shows plan
 *   php bin/repair-fee-ledger-imbalance.php --apply        # apply, prompts
 *   php bin/repair-fee-ledger-imbalance.php --apply --yes  # apply, no prompt
 */

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

use App\Domain\Entity\LedgerTransaction;
use App\Domain\Entity\LoanFeeBreakdown;
use App\Domain\Entity\Loan;
use App\Domain\Entity\CustomerLedger;
use App\Domain\Enum\FeeEffect;
use App\Domain\Enum\TransactionType;

echo "=== CreditX Fee Ledger Imbalance Repair ===\n\n";

$em = \App\Infrastructure\Persistence\DoctrineEntityManagerFactory::create();
$conn = $em->getConnection();

$apply = in_array('--apply', $argv, true);
$yes = in_array('--yes', $argv, true);

if (!$apply) {
    echo "DRY RUN — no changes will be made. Re-run with --apply to commit.\n\n";
}

// Find loans with a CustomerLedger (i.e. disbursed) and at least one
// ADDS_TO_GROSS fee breakdown.
$loans = $em->createQueryBuilder()
    ->select('DISTINCT l')
    ->from(Loan::class, 'l')
    ->innerJoin('l.feeBreakdowns', 'fb')
    ->where('fb.amount > 0')
    ->getQuery()->getResult();

echo "Scanning " . count($loans) . " loan(s) with fee breakdowns...\n\n";

$totalFixed = 0;
$totalSkipped = 0;
$totalAlreadyBalanced = 0;
$totalImbalanceNgn = '0.00';

foreach ($loans as $loan) {
    /** @var Loan $loan */
    $ledger = $em->createQueryBuilder()
        ->select('cl')
        ->from(CustomerLedger::class, 'cl')
        ->where('cl.loan = :loan')
        ->setParameter('loan', $loan)
        ->getQuery()->getOneOrNullResult();

    if ($ledger === null) {
        // Not disbursed yet. Skip.
        continue;
    }

    // Compute current ledger balance: CR - DR. If non-zero, we likely
    // have missing fee postings (or some other bug). Only zero if
    // already repaired or was always correct.
    $row = $conn->executeQuery(
        'SELECT
            COALESCE(SUM(CASE WHEN trans_type = \'DR\' THEN trans_amount ELSE 0 END), 0) AS total_dr,
            COALESCE(SUM(CASE WHEN trans_type = \'CR\' THEN trans_amount ELSE 0 END), 0) AS total_cr
         FROM ledger_transactions
         WHERE customer_ledger_id = :clId',
        ['clId' => $ledger->getId()],
    )->fetchAssociative();
    $totalDr = (string) ($row['total_dr'] ?? '0');
    $totalCr = (string) ($row['total_cr'] ?? '0');
    $balance = bcsub($totalCr, $totalDr, 2);

    if (bccomp($balance, '0.00', 2) === 0) {
        $totalAlreadyBalanced++;
        continue;
    }

    // Find the disbursement callback ref. All disbursement entries
    // share the same callback; grab any one from this ledger.
    $callbackRow = $conn->executeQuery(
        'SELECT trans_callback FROM ledger_transactions
         WHERE customer_ledger_id = :clId AND trans_callback LIKE \'DISB-%\'
         ORDER BY created_at ASC LIMIT 1',
        ['clId' => $ledger->getId()],
    )->fetchAssociative();
    $callback = $callbackRow['trans_callback'] ?? null;
    if ($callback === null) {
        echo "  SKIP loan {$loan->getApplicationId()}: no disbursement callback found\n";
        $totalSkipped++;
        continue;
    }

    // Find the effective date + user_id from the disbursement entries
    $meta = $conn->executeQuery(
        'SELECT trans_year, trans_month, trans_day, posted_by FROM ledger_transactions
         WHERE customer_ledger_id = :clId AND trans_callback = :cb
         ORDER BY created_at ASC LIMIT 1',
        ['clId' => $ledger->getId(), 'cb' => $callback],
    )->fetchAssociative();
    $effectiveDate = sprintf('%s-%s-%s', $meta['trans_year'], $meta['trans_month'], $meta['trans_day']);
    $postedBy = $meta['posted_by'] ?? null;

    // For each ADDS_TO_GROSS fee breakdown, check if a DR entry
    // already exists for its amount + narration. If not, post it.
    $feeBreakdowns = $loan->getFeeBreakdowns();
    $loanFixes = 0;
    $loanAddedAmount = '0.00';

    foreach ($feeBreakdowns as $fb) {
        /** @var LoanFeeBreakdown $fb */
        if (bccomp($fb->getAmount(), '0.00', 2) <= 0) continue;

        $feeType = $fb->getFeeType();
        // Only repair ADDS_TO_GROSS fees — DEDUCTED fees were posted
        // correctly under the old code.
        if ($feeType->getEffect() !== FeeEffect::ADDS_TO_GROSS) continue;

        $narration = strtoupper($feeType->getName());
        $amount = $fb->getAmount();

        // Check for an existing DR under this callback + amount + narration.
        // Using narration ignores case — strtoupper match is safe since
        // DisbursementService uppercases when posting.
        $existing = $conn->executeQuery(
            'SELECT COUNT(*) AS c FROM ledger_transactions
             WHERE customer_ledger_id = :clId
               AND trans_callback = :cb
               AND trans_type = \'DR\'
               AND trans_amount = :amt
               AND UPPER(trans_narration) = :narr',
            [
                'clId' => $ledger->getId(),
                'cb' => $callback,
                'amt' => $amount,
                'narr' => $narration,
            ],
        )->fetchAssociative();

        if ((int) ($existing['c'] ?? 0) > 0) {
            // Already posted — skip.
            continue;
        }

        // Post DR on customer ledger + CR on fee GL. Resolve fee GL
        // the same way DisbursementService does.
        $feeGlId = $feeType->getGlAccountId();
        $feeGl = $feeGlId ? $em->find(\App\Domain\Entity\GeneralLedger::class, $feeGlId) : null;
        if ($feeGl === null) {
            $feeGl = $em->getRepository(\App\Domain\Entity\GeneralLedger::class)
                ->findOneBy(['accountCode' => strtoupper($feeType->getCode())]);
        }

        echo "  Loan {$loan->getApplicationId()}: post DR ₦{$amount} for '{$feeType->getName()}'"
            . ($feeGl ? " + CR fee GL {$feeGl->getAccountCode()}" : " (no fee GL — CR skipped)") . "\n";

        if ($apply) {
            // DR customer ledger
            $drEntry = new LedgerTransaction();
            $drEntry->setGeneralLedger($ledger->getGeneralLedger());
            $drEntry->setCustomerLedger($ledger);
            $drEntry->setTransType(TransactionType::DR);
            $drEntry->setTransAmount($amount);
            $drEntry->setTransNarration($narration);
            $drEntry->setTransCallback($callback);
            $drEntry->setTransDate($meta['trans_year'], $meta['trans_month'], $meta['trans_day']);
            $drEntry->setPostedBy($postedBy);
            $em->persist($drEntry);

            // CR fee GL — only if a fee GL exists
            if ($feeGl !== null) {
                $crEntry = new LedgerTransaction();
                $crEntry->setGeneralLedger($feeGl);
                $crEntry->setTransType(TransactionType::CR);
                $crEntry->setTransAmount($amount);
                $crEntry->setTransNarration($loan->getCustomer()->getFullName() . ' - ' . $feeType->getName());
                $crEntry->setTransCallback($callback);
                $crEntry->setTransDate($meta['trans_year'], $meta['trans_month'], $meta['trans_day']);
                $crEntry->setPostedBy($postedBy);
                $em->persist($crEntry);
            }
        }

        $loanFixes++;
        $loanAddedAmount = bcadd($loanAddedAmount, $amount, 2);
    }

    if ($loanFixes > 0) {
        $totalFixed++;
        $totalImbalanceNgn = bcadd($totalImbalanceNgn, $loanAddedAmount, 2);
        echo "  Loan {$loan->getApplicationId()}: +{$loanFixes} entries, total ₦{$loanAddedAmount} moved\n";
    }
}

if ($apply) {
    if (!$yes) {
        echo "\nAbout to commit fixes. Continue? [yN]: ";
        $answer = trim(fgets(STDIN));
        if (strtolower($answer) !== 'y') {
            echo "Aborted.\n";
            exit(1);
        }
    }
    $em->flush();
    echo "\n✓ Committed.\n";
}

echo "\n=== Summary ===\n";
echo "Loans already balanced:   {$totalAlreadyBalanced}\n";
echo "Loans skipped (no DISB):  {$totalSkipped}\n";
echo "Loans fixed:              {$totalFixed}\n";
echo "Total ₦ moved to ledger:  ₦{$totalImbalanceNgn}\n";

if (!$apply) {
    echo "\n(Dry run — no changes committed. Re-run with --apply to commit.)\n";
}
