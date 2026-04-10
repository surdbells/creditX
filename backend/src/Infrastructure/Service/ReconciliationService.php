<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\Reconciliation;
use App\Domain\Entity\ReconciliationItem;
use App\Domain\Enum\ReconciliationMatchType;
use App\Domain\Enum\ReconciliationStatus;
use App\Domain\Repository\LedgerTransactionRepository;
use App\Domain\Repository\ReconciliationRepository;
use Doctrine\ORM\EntityManagerInterface;

final class ReconciliationService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly ReconciliationRepository $reconRepo,
        private readonly LedgerTransactionRepository $txRepo,
    ) {
    }

    /**
     * Process a bank statement CSV against system ledger transactions.
     *
     * @param string $filePath Path to uploaded bank statement CSV
     * @param string $year Period year
     * @param string $month Period month
     * @return Reconciliation
     */
    public function reconcile(string $filePath, string $year, string $month): Reconciliation
    {
        $bankRows = $this->parseBankStatement($filePath);

        // Get system transactions for the period (repayments)
        $systemTx = $this->em->getConnection()->fetchAllAssociative(
            "SELECT lt.id, lt.trans_reference, lt.trans_amount, lt.trans_narration, lt.trans_callback
             FROM ledger_transactions lt
             WHERE lt.trans_year = :y AND lt.trans_month = :m AND lt.is_repayment = true AND lt.trans_type = 'DR'
             ORDER BY lt.created_at",
            ['y' => $year, 'm' => str_pad($month, 2, '0', STR_PAD_LEFT)]
        );

        $recon = new Reconciliation();
        $recon->setPeriodYear($year);
        $recon->setPeriodMonth($month);

        $bankTotal = '0.00';
        $systemTotal = '0.00';
        $matchedSystemIds = [];

        // Calculate system total
        foreach ($systemTx as $tx) {
            $systemTotal = bcadd($systemTotal, $tx['trans_amount'], 2);
        }

        // Match bank rows against system transactions
        foreach ($bankRows as $bankRow) {
            $bankRef = $bankRow['reference'] ?? '';
            $bankAmount = $bankRow['amount'] ?? '0.00';
            $bankTotal = bcadd($bankTotal, $bankAmount, 2);

            $item = new ReconciliationItem();
            $item->setBankReference($bankRef);
            $item->setBankAmount($bankAmount);

            // Try exact match by reference
            $matched = false;
            foreach ($systemTx as $tx) {
                if (isset($matchedSystemIds[$tx['id']])) continue;

                // Match by reference
                if ($bankRef !== '' && ($tx['trans_reference'] === $bankRef || $tx['trans_callback'] === $bankRef)) {
                    $item->setSystemReference($tx['trans_reference'] ?? $tx['trans_callback']);
                    $item->setSystemAmount($tx['trans_amount']);

                    if (bccomp($bankAmount, $tx['trans_amount'], 2) === 0) {
                        $item->setMatchType(ReconciliationMatchType::EXACT);
                        $item->setStatus(ReconciliationStatus::MATCHED);
                    } else {
                        $item->setMatchType(ReconciliationMatchType::PARTIAL);
                        $item->setStatus(ReconciliationStatus::EXCEPTION);
                    }

                    $matchedSystemIds[$tx['id']] = true;
                    $matched = true;
                    break;
                }

                // Match by amount (if no reference match)
                if (!$matched && bccomp($bankAmount, $tx['trans_amount'], 2) === 0 && !isset($matchedSystemIds[$tx['id']])) {
                    $item->setSystemReference($tx['trans_reference'] ?? $tx['trans_callback']);
                    $item->setSystemAmount($tx['trans_amount']);
                    $item->setMatchType(ReconciliationMatchType::PARTIAL);
                    $item->setStatus(ReconciliationStatus::MATCHED);
                    $matchedSystemIds[$tx['id']] = true;
                    $matched = true;
                    break;
                }
            }

            if (!$matched) {
                $item->setMatchType(ReconciliationMatchType::UNMATCHED_BANK);
                $item->setStatus(ReconciliationStatus::EXCEPTION);
            }

            $recon->addItem($item);
        }

        // Add unmatched system transactions
        foreach ($systemTx as $tx) {
            if (isset($matchedSystemIds[$tx['id']])) continue;

            $item = new ReconciliationItem();
            $item->setSystemReference($tx['trans_reference'] ?? $tx['trans_callback']);
            $item->setSystemAmount($tx['trans_amount']);
            $item->setMatchType(ReconciliationMatchType::UNMATCHED_SYSTEM);
            $item->setStatus(ReconciliationStatus::EXCEPTION);
            $recon->addItem($item);
        }

        $recon->setBankTotal($bankTotal);
        $recon->setSystemTotal($systemTotal);
        $recon->setDifference(bcsub($bankTotal, $systemTotal, 2));

        // Set overall status
        $hasExceptions = false;
        foreach ($recon->getItems() as $item) {
            if ($item->getStatus() === ReconciliationStatus::EXCEPTION) {
                $hasExceptions = true;
                break;
            }
        }
        $recon->setStatus($hasExceptions ? ReconciliationStatus::EXCEPTION : ReconciliationStatus::MATCHED);

        $this->em->persist($recon);
        $this->em->flush();

        return $recon;
    }

    private function parseBankStatement(string $filePath): array
    {
        if (!file_exists($filePath)) {
            throw new \RuntimeException('File not found');
        }

        $handle = fopen($filePath, 'r');
        $headers = fgetcsv($handle);
        if (!$headers) { fclose($handle); return []; }

        $headers = array_map(fn($h) => strtolower(str_replace([' ', '-'], '_', trim($h))), $headers);
        $rows = [];
        while (($data = fgetcsv($handle)) !== false) {
            if (count($data) === count($headers)) {
                $rows[] = array_combine($headers, $data);
            }
        }
        fclose($handle);
        return $rows;
    }
}
