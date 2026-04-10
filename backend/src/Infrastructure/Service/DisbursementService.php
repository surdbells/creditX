<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\CustomerLedger;
use App\Domain\Entity\LedgerTransaction;
use App\Domain\Entity\Loan;
use App\Domain\Entity\LoanTrail;
use App\Domain\Entity\RepaymentSchedule;
use App\Domain\Enum\CustomerLedgerStatus;
use App\Domain\Enum\LoanStatus;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\CustomerLedgerRepository;
use App\Domain\Repository\GeneralLedgerRepository;
use Doctrine\ORM\EntityManagerInterface;

final class DisbursementService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly GeneralLedgerRepository $glRepo,
        private readonly CustomerLedgerRepository $clRepo,
        private readonly LoanCalculationService $calcService,
        private readonly SettingsCacheService $settings,
    ) {
    }

    /**
     * Disburse an approved loan — full accounting workflow.
     *
     * @param Loan $loan Must be in APPROVED status
     * @param string $settlementGlId GL account for settlement (bank/cash)
     * @param string $effectiveDate Disbursement effective date (Y-m-d)
     * @param string|null $userId The user performing disbursement
     * @throws DomainException
     */
    public function disburse(Loan $loan, string $settlementGlId, string $effectiveDate, ?string $userId = null): array
    {
        if ($loan->getStatus() !== LoanStatus::APPROVED) {
            throw new DomainException('Loan must be in Approved status to disburse');
        }

        $settlementGl = $this->glRepo->find($settlementGlId);
        if ($settlementGl === null) {
            throw new DomainException('Settlement GL account not found');
        }

        $transaction = $loan->getTransaction();
        if ($transaction === null) {
            throw new DomainException('Loan transaction record not found');
        }

        $callback = 'DISB-' . $loan->getApplicationId() . '-' . date('YmdHis');
        $customerName = $loan->getCustomer()->getFullName();

        $this->em->beginTransaction();

        try {
            // ─── 1. Create customer ledger ───
            $customerLedger = new CustomerLedger();
            $customerLedger->setCustomer($loan->getCustomer());
            $customerLedger->setLoan($loan);

            // Find or create a parent GL for customer ledgers
            $customerGl = $this->glRepo->findByCode('CUBGL');
            if ($customerGl === null) {
                throw new DomainException('Customer balance GL (CUBGL) not found. Run seeder.');
            }
            $customerLedger->setGeneralLedger($customerGl);
            $customerLedger->setAccountNumber(CustomerLedger::generateAccountNumber());
            $this->em->persist($customerLedger);

            // ─── 2. CR gross loan to customer ledger ───
            $this->postEntry(
                $customerGl, $customerLedger, TransactionType::CR,
                $transaction->getGrossLoan(), 'LOAN DISBURSEMENT APPROVED',
                $callback, $effectiveDate, $userId
            );

            // ─── 3. DR each fee from customer ledger ───
            $feeBreakdowns = $loan->getFeeBreakdowns();
            foreach ($feeBreakdowns as $fb) {
                if (!$fb->isDeducted() || bccomp($fb->getAmount(), '0.00', 2) <= 0) {
                    continue;
                }

                // DR from customer ledger
                $this->postEntry(
                    $customerGl, $customerLedger, TransactionType::DR,
                    $fb->getAmount(), strtoupper($fb->getFeeType()->getName()),
                    $callback, $effectiveDate, $userId
                );

                // CR to fee type's GL
                $feeGl = null;
                if ($fb->getFeeType()->getGlAccountId()) {
                    $feeGl = $this->glRepo->find($fb->getFeeType()->getGlAccountId());
                }
                if ($feeGl === null) {
                    $feeGl = $this->glRepo->findByCode($fb->getFeeType()->getCode());
                }
                if ($feeGl !== null) {
                    $this->postEntry(
                        $feeGl, null, TransactionType::CR,
                        $fb->getAmount(), $customerName . ' - ' . $fb->getFeeType()->getName(),
                        $callback, $effectiveDate, $userId
                    );
                }
            }

            // ─── 4. DR top-up balance if applicable ───
            $topUpBalance = $transaction->getTopUpBalance();
            if (bccomp($topUpBalance, '0.00', 2) > 0) {
                $this->postEntry(
                    $customerGl, $customerLedger, TransactionType::DR,
                    $topUpBalance, 'PREVIOUS BALANCE B/F',
                    $callback, $effectiveDate, $userId
                );

                // CR to customer balance GL
                $this->postEntry(
                    $customerGl, null, TransactionType::CR,
                    $topUpBalance, 'CUSTOMER PREVIOUS BALANCE - ' . $customerName,
                    $callback, $effectiveDate, $userId
                );
            }

            // ─── 5. DR net disbursed from customer ledger ───
            $this->postEntry(
                $customerGl, $customerLedger, TransactionType::DR,
                $transaction->getNetDisbursed(), 'NET DISBURSED',
                $callback, $effectiveDate, $userId
            );

            // ─── 6. CR settlement GL ───
            $this->postEntry(
                $settlementGl, null, TransactionType::CR,
                $transaction->getNetDisbursed(), 'LOAN SETTLEMENT - ' . $customerName,
                $callback, $effectiveDate, $userId
            );

            // ─── 7. Update loan status ───
            $loan->transitionTo(LoanStatus::DISBURSED);
            $loan->setDisbursedAt(new \DateTimeImmutable($effectiveDate, new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos')));

            // Then transition to active
            $loan->transitionTo(LoanStatus::ACTIVE);

            // ─── 8. Generate repayment schedule ───
            $this->generateRepaymentSchedule($loan, $customerLedger, $effectiveDate);

            // ─── 9. Trail ───
            $trail = new LoanTrail();
            $trail->setUserId($userId);
            $trail->setAction('Loan disbursed');
            $trail->setDetails([
                'settlement_gl' => $settlementGl->getAccountCode(),
                'effective_date' => $effectiveDate,
                'net_disbursed' => $transaction->getNetDisbursed(),
                'customer_ledger' => $customerLedger->getAccountNumber(),
                'callback' => $callback,
            ]);
            $loan->addTrail($trail);

            $this->em->flush();
            $this->em->commit();

            return [
                'loan_id' => $loan->getId(),
                'application_id' => $loan->getApplicationId(),
                'status' => $loan->getStatus()->value,
                'customer_ledger' => $customerLedger->getAccountNumber(),
                'net_disbursed' => $transaction->getNetDisbursed(),
                'callback' => $callback,
                'effective_date' => $effectiveDate,
            ];

        } catch (\Exception $e) {
            $this->em->rollback();
            throw new DomainException('Disbursement failed: ' . $e->getMessage());
        }
    }

    /**
     * Post a single ledger entry.
     */
    private function postEntry(
        \App\Domain\Entity\GeneralLedger $gl,
        ?CustomerLedger $customerLedger,
        TransactionType $type,
        string $amount,
        string $narration,
        string $callback,
        string $effectiveDate,
        ?string $userId,
    ): void {
        if (bccomp($amount, '0.00', 2) <= 0) {
            return;
        }

        $dateParts = explode('-', $effectiveDate);
        $entry = new LedgerTransaction();
        $entry->setGeneralLedger($gl);
        $entry->setCustomerLedger($customerLedger);
        $entry->setTransType($type);
        $entry->setTransAmount($amount);
        $entry->setTransNarration($narration);
        $entry->setTransCallback($callback);
        $entry->setTransDate($dateParts[0] ?? date('Y'), $dateParts[1] ?? date('m'), $dateParts[2] ?? date('d'));
        $entry->setPostedBy($userId);

        $this->em->persist($entry);
    }

    /**
     * Generate monthly repayment schedule entries.
     */
    private function generateRepaymentSchedule(Loan $loan, CustomerLedger $ledger, string $effectiveDate): void
    {
        $transaction = $loan->getTransaction();
        if ($transaction === null) {
            return;
        }

        $tenure = $transaction->getLoanTenure();
        $calc = $this->calcService->calculate(
            $loan->getProduct(),
            $transaction->getAppAmount(),
            $tenure,
            $loan->getBankStatementMode(),
            $transaction->getTopUpBalance(),
        );

        $schedulePreview = $calc['schedule_preview'] ?? [];

        $baseDate = new \DateTime($effectiveDate);

        for ($i = 0; $i < $tenure; $i++) {
            $dueDate = (clone $baseDate)->modify('+' . ($i + 1) . ' months');

            $schedule = new RepaymentSchedule();
            $schedule->setLoan($loan);
            $schedule->setLedger($ledger);
            $schedule->setInstallmentNumber($i + 1);
            $schedule->setDueDate($dueDate);

            if (isset($schedulePreview[$i])) {
                $schedule->setPrincipalAmount($schedulePreview[$i]['principal']);
                $schedule->setInterestAmount($schedulePreview[$i]['interest']);
                $schedule->setTotalAmount($schedulePreview[$i]['total']);
            } else {
                // Fallback to flat split
                $schedule->setPrincipalAmount($calc['mr_principal']);
                $schedule->setInterestAmount($calc['mr_interest']);
                $schedule->setTotalAmount($calc['mr_principal_interest']);
            }

            $this->em->persist($schedule);
        }
    }
}
