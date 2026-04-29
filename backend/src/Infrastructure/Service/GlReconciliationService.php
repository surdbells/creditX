<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\GeneralLedger;
use App\Domain\Entity\GlReconciliationRun;
use App\Domain\Entity\Notification;
use App\Domain\Enum\AccountType;
use App\Domain\Enum\LedgerType;
use App\Domain\Enum\NotificationChannel;
use App\Domain\Enum\NotificationStatus;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * GlReconciliationService — runs sub-ledger ↔ control-account checks
 * for every CUSTOMER-type parent GL.
 *
 * Phase-2 schema-hardening extraction. Previously this logic was
 * inline in ReconciliationAction (HTTP only). Lifting it into a
 * service lets a scheduled CLI job run the same check daily and
 * dispatch alerts when discrepancies exceed a threshold.
 *
 * The HTTP action and the CLI worker share the scan() output —
 * single source of truth for "what does reconciliation look like
 * right now?".
 *
 * Discrepancy rule:
 *   For each CUSTOMER-type parent GL, the parent's direct postings
 *   (where customer_ledger_id IS NULL) should net to zero. A non-
 *   zero parent balance means someone posted directly to the
 *   control account, bypassing the sub-ledger — an integrity issue
 *   warranting investigation.
 *
 * Threshold:
 *   accounting.reconciliation_alert_threshold (system setting,
 *   defaults to '0.01' kobo). A discrepancy of < threshold doesn't
 *   alert. Set higher to filter rounding noise; set lower (e.g. '0')
 *   to alert on any kobo of mismatch.
 */
final class GlReconciliationService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly SettingsCacheService $settings,
        private readonly LoggerInterface $logger,
    ) {}

    /**
     * Run the reconciliation scan and return a structured result.
     * Pure read-only — does not persist runs or notifications.
     * Used by both the HTTP endpoint (immediate display) and the
     * scheduled CLI (which then persists + alerts based on this).
     *
     * Return shape mirrors what ReconciliationAction's HTTP response
     * has always returned, so the action can delegate to this and
     * pass through unchanged.
     *
     * @return array{
     *   accounts: list<array<string, mixed>>,
     *   summary: array{
     *     accounts_checked: int,
     *     accounts_with_discrepancy: int,
     *     total_discrepancy_amount: string,
     *     generated_at: string,
     *   },
     * }
     */
    public function scan(): array
    {
        $conn = $this->em->getConnection();

        // Fetch all CUSTOMER-type parent GLs (control accounts that
        // host sub-ledgers). Sorted by code for stable display order.
        $glAccounts = $this->em->createQueryBuilder()
            ->select('gl')
            ->from(GeneralLedger::class, 'gl')
            ->where('gl.ledgerType = :type')
            ->setParameter('type', LedgerType::CUSTOMER->value)
            ->orderBy('gl.accountCode', 'ASC')
            ->getQuery()->getResult();

        $accounts = [];
        $accountsWithDiscrepancy = 0;
        $totalDiscrepancy = '0.00';

        foreach ($glAccounts as $gl) {
            /** @var GeneralLedger $gl */
            $glId = $gl->getId();

            // Parent-only postings (control account direct hits).
            $parentRow = $conn->executeQuery(
                'SELECT
                    COALESCE(SUM(CASE WHEN trans_type = \'DR\' THEN trans_amount ELSE 0 END), 0) AS total_dr,
                    COALESCE(SUM(CASE WHEN trans_type = \'CR\' THEN trans_amount ELSE 0 END), 0) AS total_cr
                 FROM ledger_transactions
                 WHERE gl_id = :glId AND customer_ledger_id IS NULL',
                ['glId' => $glId],
            )->fetchAssociative();

            // Sub-ledger aggregate (every CustomerLedger child rolled
            // up via this parent GL).
            $subRow = $conn->executeQuery(
                'SELECT
                    COALESCE(SUM(CASE WHEN trans_type = \'DR\' THEN trans_amount ELSE 0 END), 0) AS total_dr,
                    COALESCE(SUM(CASE WHEN trans_type = \'CR\' THEN trans_amount ELSE 0 END), 0) AS total_cr,
                    COUNT(DISTINCT customer_ledger_id) AS subledger_count
                 FROM ledger_transactions
                 WHERE gl_id = :glId AND customer_ledger_id IS NOT NULL',
                ['glId' => $glId],
            )->fetchAssociative();

            $parentDr = (string) $parentRow['total_dr'];
            $parentCr = (string) $parentRow['total_cr'];
            $subDr    = (string) $subRow['total_dr'];
            $subCr    = (string) $subRow['total_cr'];

            $combinedDr = bcadd($parentDr, $subDr, 2);
            $combinedCr = bcadd($parentCr, $subCr, 2);

            $accountType = $gl->getAccountType();
            $parentBalance   = $this->balance($parentDr, $parentCr, $accountType);
            $subBalance      = $this->balance($subDr, $subCr, $accountType);
            $combinedBalance = $this->balance($combinedDr, $combinedCr, $accountType);

            // Discrepancy = absolute parent-only balance. Zero = healthy.
            $parentAbs = $this->abs($parentBalance);
            $hasDiscrepancy = bccomp($parentAbs, '0.00', 2) !== 0;
            if ($hasDiscrepancy) {
                $accountsWithDiscrepancy++;
                $totalDiscrepancy = bcadd($totalDiscrepancy, $parentAbs, 2);
            }

            $accounts[] = [
                'id'                 => $glId,
                'code'               => $gl->getAccountCode(),
                'name'               => $gl->getAccountName(),
                'ledger_type'        => $gl->getLedgerType()->value,
                'account_type'       => $accountType->value,
                'parent_total_dr'    => $parentDr,
                'parent_total_cr'    => $parentCr,
                'parent_balance'     => $parentBalance,
                'subledger_total_dr' => $subDr,
                'subledger_total_cr' => $subCr,
                'subledger_balance'  => $subBalance,
                'subledger_count'    => (int) $subRow['subledger_count'],
                'combined_total_dr'  => $combinedDr,
                'combined_total_cr'  => $combinedCr,
                'combined_balance'   => $combinedBalance,
                'has_discrepancy'    => $hasDiscrepancy,
                'discrepancy_amount' => $parentAbs,
            ];
        }

        return [
            'accounts' => $accounts,
            'summary'  => [
                'accounts_checked'           => count($accounts),
                'accounts_with_discrepancy'  => $accountsWithDiscrepancy,
                'total_discrepancy_amount'   => $totalDiscrepancy,
                'generated_at'               => (new \DateTimeImmutable())->format('c'),
            ],
        ];
    }

    /**
     * Run + persist + alert. Used by the daily scheduled CLI worker.
     *
     * Side effects:
     *   - Inserts a GlReconciliationRun row recording the scan
     *     (timestamp, totals, account-level details as JSON)
     *   - For each user with the 'accounting.view' permission,
     *     inserts an IN_APP Notification when total discrepancy
     *     exceeds the configured alert threshold
     *   - Logs structured info for ops visibility
     *
     * @return GlReconciliationRun the persisted run
     */
    public function runScheduled(): GlReconciliationRun
    {
        $started = new \DateTimeImmutable();
        $result = $this->scan();
        $totalDiscrepancy = $result['summary']['total_discrepancy_amount'];
        $accountsChecked = $result['summary']['accounts_checked'];
        $accountsWithDiscrepancy = $result['summary']['accounts_with_discrepancy'];

        // Persist the run.
        $run = new GlReconciliationRun();
        $run->setStartedAt($started);
        $run->setCompletedAt(new \DateTimeImmutable());
        $run->setAccountsChecked($accountsChecked);
        $run->setAccountsWithDiscrepancy($accountsWithDiscrepancy);
        $run->setTotalDiscrepancy($totalDiscrepancy);
        $run->setDetails($result['accounts']);
        $this->em->persist($run);
        $this->em->flush();

        $this->logger->info('GL reconciliation scheduled run completed', [
            'run_id' => $run->getId(),
            'accounts_checked' => $accountsChecked,
            'accounts_with_discrepancy' => $accountsWithDiscrepancy,
            'total_discrepancy' => $totalDiscrepancy,
        ]);

        // Alert if over threshold.
        $threshold = $this->settings->get('accounting.reconciliation_alert_threshold', '0.01') ?? '0.01';
        if (bccomp($totalDiscrepancy, (string) $threshold, 2) > 0) {
            $this->dispatchAlert($run, $threshold);
        }

        return $run;
    }

    /**
     * Create one IN_APP Notification per user with the
     * 'accounting.view' permission.
     *
     * Uses raw SQL for the user lookup — accounting.view is the
     * canonical permission for accounting visibility. Iterating
     * permissions via the ORM would require loading every Role
     * + Permission, which is wasteful when we just want a list of
     * user_ids matching one slug.
     *
     * The notification is IN_APP only (channel=IN_APP). Email/SMS
     * for these operational alerts is deliberately NOT used —
     * they'd be too noisy if the threshold caught small daily
     * variances. Operators see the alert next time they open the
     * notifications panel.
     */
    private function dispatchAlert(GlReconciliationRun $run, string $threshold): void
    {
        $userIds = $this->em->getConnection()->fetchFirstColumn(
            'SELECT DISTINCT u.id
             FROM users u
             INNER JOIN user_roles ur ON ur.user_id = u.id
             INNER JOIN role_permissions rp ON rp.role_id = ur.role_id
             INNER JOIN permissions p ON p.id = rp.permission_id
             WHERE p.slug = :slug
               AND u.is_active = true',
            ['slug' => 'accounting.view'],
        );

        if (empty($userIds)) {
            $this->logger->warning(
                'GL reconciliation alert NOT dispatched: no users with accounting.view permission',
                ['run_id' => $run->getId()],
            );
            return;
        }

        $subject = sprintf(
            'GL reconciliation: ₦%s discrepancy across %d account(s)',
            number_format((float) $run->getTotalDiscrepancy(), 2, '.', ','),
            $run->getAccountsWithDiscrepancy(),
        );
        $body = sprintf(
            "Today's scheduled GL reconciliation found a total discrepancy of ₦%s across %d "
          . "control account(s) (out of %d checked). This means direct postings to those "
          . "control accounts bypassed the sub-ledger.\n\n"
          . "Alert threshold: ₦%s\n"
          . "Run at: %s\n\n"
          . "Open the Reports → GL Reconciliation page for the per-account breakdown.",
            number_format((float) $run->getTotalDiscrepancy(), 2, '.', ','),
            $run->getAccountsWithDiscrepancy(),
            $run->getAccountsChecked(),
            number_format((float) $threshold, 2, '.', ','),
            $run->getStartedAt()->format('Y-m-d H:i'),
        );

        foreach ($userIds as $uid) {
            $notif = new Notification();
            $notif->setUserId((string) $uid);
            $notif->setChannel(NotificationChannel::IN_APP);
            // Recipient field is required (NOT NULL); for IN_APP it's
            // conventionally the user_id.
            $notif->setRecipient((string) $uid);
            $notif->setSubject($subject);
            $notif->setBody($body);
            $notif->setStatus(NotificationStatus::SENT);
            $notif->setSentAt(new \DateTimeImmutable());
            $this->em->persist($notif);
        }
        $this->em->flush();

        $this->logger->info('GL reconciliation alert dispatched', [
            'run_id' => $run->getId(),
            'recipients' => count($userIds),
        ]);
    }

    private function balance(string $dr, string $cr, AccountType $type): string
    {
        if ($type === AccountType::ASSET || $type === AccountType::EXPENSE) {
            return bcsub($dr, $cr, 2);
        }
        return bcsub($cr, $dr, 2);
    }

    private function abs(string $n): string
    {
        return str_starts_with($n, '-') ? substr($n, 1) : $n;
    }
}
