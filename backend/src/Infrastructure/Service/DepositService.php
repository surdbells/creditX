<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\DepositAccount;
use App\Domain\Entity\DepositProduct;
use App\Domain\Entity\DepositTransaction;
use App\Domain\Enum\DepositAccountStatus;
use App\Domain\Enum\DepositTransactionType;
use App\Domain\Enum\DepositWithdrawalPolicy;
use App\Domain\Enum\JournalEntryType;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\CustomerRepository;
use App\Domain\Repository\DepositAccountRepository;
use App\Domain\Repository\GeneralLedgerRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * DepositService — the deposit-taking counterpart to DisbursementService /
 * RepaymentService. It opens accounts and posts customer money movements,
 * keeping the deposit sub-ledger (DepositAccount.balance + DepositTransaction
 * rows) in lockstep with the GL by routing every movement through
 * LedgerService::postJournal.
 *
 * GL legs (CUSTDEP = Customer Deposits liability, BANK = settlement asset):
 *   deposit    DR BANK            CR CUSTDEP
 *   withdrawal DR CUSTDEP         CR BANK
 *   charge     DR CUSTDEP         CR OTHINC (fee income)
 *
 * Withdrawals honour the per-product DepositWithdrawalPolicy:
 *   STRICT_MIN_BALANCE  resulting balance must stay >= product.minBalance
 *   BLOCK_OVERDRAW      resulting balance must stay >= 0
 *   ALLOW_OVERDRAW      negative balances permitted (overdraft)
 */
final class DepositService
{
    private const GL_BANK    = 'BANK';
    private const GL_CUSTDEP = 'CUSTDEP';
    private const GL_FEEINC  = 'OTHINC';

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly CustomerRepository $customerRepo,
        private readonly DepositAccountRepository $accountRepo,
        private readonly GeneralLedgerRepository $glRepo,
        private readonly PeriodGuardService $periodGuard,
        private readonly LedgerService $ledger,
    ) {}

    /**
     * Open a new deposit account for a customer against a product. If an
     * opening deposit is supplied it is posted as the account's first
     * DEPOSIT transaction in the same DB transaction as the account row.
     *
     * @throws DomainException
     */
    public function openAccount(
        string $customerId,
        DepositProduct $product,
        string $openingDeposit,
        string $postingDate,
        ?string $userId,
    ): DepositAccount {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $postingDate)) {
            throw new DomainException('posting_date must be a valid YYYY-MM-DD date.');
        }
        if (!$product->isActive()) {
            throw new DomainException("Deposit product {$product->getCode()} is inactive.");
        }

        $customer = $this->customerRepo->find($customerId);
        if ($customer === null) {
            throw new DomainException('Customer not found.');
        }

        $opening = $this->normaliseAmount($openingDeposit, allowZero: true);
        if (bccomp($opening, $product->getMinOpeningBalance(), 2) < 0) {
            throw new DomainException(sprintf(
                'Opening deposit %s is below the product minimum opening balance %s.',
                $opening, $product->getMinOpeningBalance()
            ));
        }

        // Only guard the period when we will actually post a journal.
        if (bccomp($opening, '0.00', 2) > 0) {
            $this->periodGuard->assertDateOpen($postingDate);
        }

        $this->em->beginTransaction();
        try {
            $account = new DepositAccount();
            $account->setAccountNumber($this->uniqueAccountNumber());
            $account->setCustomer($customer);
            $account->setProduct($product);
            $account->setOpenedDate(new \DateTimeImmutable($postingDate));
            $account->setBalance('0.00');
            $this->em->persist($account);
            $this->em->flush();

            if (bccomp($opening, '0.00', 2) > 0) {
                $this->postMovement(
                    $account,
                    DepositTransactionType::DEPOSIT,
                    $opening,
                    $postingDate,
                    'Opening deposit',
                    null,
                    $userId,
                );
            }

            $this->em->commit();
            return $account;
        } catch (\Throwable $e) {
            $this->em->rollback();
            throw $e;
        }
    }

    /**
     * Post a deposit (cash/transfer in). DR Bank, CR Customer Deposits.
     *
     * @throws DomainException
     */
    public function deposit(DepositAccount $account, string $amount, string $postingDate, ?string $reference, ?string $userId): DepositTransaction
    {
        $this->assertTransactable($account);
        $this->assertPostable($postingDate);
        $amount = $this->normaliseAmount($amount);

        $this->em->beginTransaction();
        try {
            $txn = $this->postMovement($account, DepositTransactionType::DEPOSIT, $amount, $postingDate, 'Cash/transfer deposit', $reference, $userId);
            $this->em->commit();
            return $txn;
        } catch (\Throwable $e) {
            $this->em->rollback();
            throw $e;
        }
    }

    /**
     * Post a withdrawal (cash/transfer out). DR Customer Deposits, CR Bank.
     * Enforces the product's withdrawal policy against the resulting balance.
     *
     * @throws DomainException
     */
    public function withdraw(DepositAccount $account, string $amount, string $postingDate, ?string $reference, ?string $userId): DepositTransaction
    {
        $this->assertTransactable($account);
        $this->assertPostable($postingDate);
        $amount = $this->normaliseAmount($amount);

        $resulting = bcsub($account->getBalance(), $amount, 2);
        $this->assertWithdrawalAllowed($account->getProduct(), $resulting);

        $this->em->beginTransaction();
        try {
            $txn = $this->postMovement($account, DepositTransactionType::WITHDRAWAL, $amount, $postingDate, 'Cash/transfer withdrawal', $reference, $userId);
            $this->em->commit();
            return $txn;
        } catch (\Throwable $e) {
            $this->em->rollback();
            throw $e;
        }
    }

    /**
     * Close an account. Refuses unless the balance is zero (the operator
     * must withdraw/settle the residual balance first — we don't silently
     * move customer money).
     *
     * @throws DomainException
     */
    public function closeAccount(DepositAccount $account, ?string $userId): DepositAccount
    {
        if ($account->getStatus() === DepositAccountStatus::CLOSED) {
            throw new DomainException('Account is already closed.');
        }
        if (bccomp($account->getBalance(), '0.00', 2) !== 0) {
            throw new DomainException(sprintf(
                'Cannot close account %s: balance is %s. Withdraw or settle the balance to zero first.',
                $account->getAccountNumber(), $account->getBalance()
            ));
        }

        $account->setStatus(DepositAccountStatus::CLOSED);
        $account->setClosedDate(new \DateTimeImmutable('today'));
        $account->setUpdatedBy($userId);
        $this->em->flush();

        return $account;
    }

    /**
     * Core posting helper — shared by openAccount/deposit/withdraw and by
     * DepositInterestService. Builds the balanced GL journal, records the
     * DepositTransaction sub-ledger row, and updates the running balance.
     *
     * MUST be called inside an open DB transaction (the caller owns it).
     *
     * @throws DomainException
     */
    public function postMovement(
        DepositAccount $account,
        DepositTransactionType $type,
        string $amount,
        string $postingDate,
        string $narration,
        ?string $reference,
        ?string $userId,
    ): DepositTransaction {
        $custdep = $this->requireGl(self::GL_CUSTDEP);

        // Assemble the DR/CR legs by movement type.
        switch ($type) {
            case DepositTransactionType::DEPOSIT:
                $bank = $this->requireGl(self::GL_BANK);
                $lines = [
                    ['gl' => $bank,    'type' => TransactionType::DR, 'amount' => $amount, 'narration' => $narration],
                    ['gl' => $custdep, 'type' => TransactionType::CR, 'amount' => $amount, 'narration' => $narration],
                ];
                $entryType = JournalEntryType::MANUAL;
                $delta = $amount;                          // balance increases
                break;

            case DepositTransactionType::WITHDRAWAL:
                $bank = $this->requireGl(self::GL_BANK);
                $lines = [
                    ['gl' => $custdep, 'type' => TransactionType::DR, 'amount' => $amount, 'narration' => $narration],
                    ['gl' => $bank,    'type' => TransactionType::CR, 'amount' => $amount, 'narration' => $narration],
                ];
                $entryType = JournalEntryType::MANUAL;
                $delta = bcmul($amount, '-1', 2);          // balance decreases
                break;

            case DepositTransactionType::INTEREST:
                $intexp = $this->requireGl('INTEXP');
                $lines = [
                    ['gl' => $intexp,  'type' => TransactionType::DR, 'amount' => $amount, 'narration' => $narration],
                    ['gl' => $custdep, 'type' => TransactionType::CR, 'amount' => $amount, 'narration' => $narration],
                ];
                $entryType = JournalEntryType::MANUAL;
                $delta = $amount;                          // interest credited to customer
                break;

            case DepositTransactionType::CHARGE:
                $feeinc = $this->requireGl(self::GL_FEEINC);
                $lines = [
                    ['gl' => $custdep, 'type' => TransactionType::DR, 'amount' => $amount, 'narration' => $narration],
                    ['gl' => $feeinc,  'type' => TransactionType::CR, 'amount' => $amount, 'narration' => $narration],
                ];
                $entryType = JournalEntryType::MANUAL;
                $delta = bcmul($amount, '-1', 2);          // fee reduces customer balance
                break;

            default:
                throw new DomainException("Unsupported deposit movement type: {$type->value}");
        }

        $journal = $this->ledger->postJournal(
            entryType: $entryType,
            postingDate: $postingDate,
            narration: sprintf('%s — %s (%s)', ucfirst($type->value), $account->getAccountNumber(), $account->getCustomer()->getFullName()),
            postedBy: $userId,
            lines: $lines,
            reference: $reference,
        );

        $newBalance = bcadd($account->getBalance(), $delta, 2);
        $account->setBalance($newBalance);
        // Customer-initiated movements reset the dormancy clock; system
        // postings (interest, charge) do not.
        if ($type === DepositTransactionType::DEPOSIT || $type === DepositTransactionType::WITHDRAWAL) {
            $account->setLastActivityDate(new \DateTimeImmutable($postingDate));
        }
        $account->setUpdatedBy($userId);

        $txn = new DepositTransaction();
        $txn->setAccount($account);
        $txn->setJournalEntry($journal);
        $txn->setType($type);
        $txn->setAmount($amount);
        $txn->setBalanceAfter($newBalance);
        $txn->setNarration($narration);
        $txn->setReference($reference);
        $txn->setPostingDate(new \DateTimeImmutable($postingDate));
        $txn->setCreatedBy($userId);
        $this->em->persist($txn);
        $this->em->flush();

        return $txn;
    }

    // ─── Guards & helpers ────────────────────────────────────────────────

    private function assertTransactable(DepositAccount $account): void
    {
        if (!$account->isTransactable()) {
            throw new DomainException(sprintf(
                'Account %s is %s and cannot transact.',
                $account->getAccountNumber(), $account->getStatus()->value
            ));
        }
    }

    private function assertPostable(string $postingDate): void
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $postingDate)) {
            throw new DomainException('posting_date must be a valid YYYY-MM-DD date.');
        }
        $this->periodGuard->assertDateOpen($postingDate);
    }

    private function assertWithdrawalAllowed(DepositProduct $product, string $resultingBalance): void
    {
        switch ($product->getWithdrawalPolicy()) {
            case DepositWithdrawalPolicy::STRICT_MIN_BALANCE:
                if (bccomp($resultingBalance, $product->getMinBalance(), 2) < 0) {
                    throw new DomainException(sprintf(
                        'Withdrawal denied: resulting balance %s would fall below the product minimum balance %s.',
                        $resultingBalance, $product->getMinBalance()
                    ));
                }
                break;
            case DepositWithdrawalPolicy::BLOCK_OVERDRAW:
                if (bccomp($resultingBalance, '0.00', 2) < 0) {
                    throw new DomainException(sprintf(
                        'Withdrawal denied: insufficient funds (resulting balance %s).',
                        $resultingBalance
                    ));
                }
                break;
            case DepositWithdrawalPolicy::ALLOW_OVERDRAW:
                // Overdraft permitted — no balance floor.
                break;
        }
    }

    private function normaliseAmount(string $amount, bool $allowZero = false): string
    {
        if (!preg_match('/^\d+(\.\d{1,2})?$/', $amount)) {
            throw new DomainException('amount must be a positive number with up to two decimals.');
        }
        $cmp = bccomp($amount, '0.00', 2);
        if ($cmp < 0 || (!$allowZero && $cmp === 0)) {
            throw new DomainException('amount must be greater than zero.');
        }
        // Normalise to two decimals.
        return bcadd($amount, '0.00', 2);
    }

    private function requireGl(string $code): \App\Domain\Entity\GeneralLedger
    {
        $gl = $this->glRepo->findByCode($code);
        if ($gl === null) {
            throw new DomainException("Required GL account '{$code}' not found. Run the chart-of-accounts migration.");
        }
        if (!$gl->isActive()) {
            throw new DomainException("Required GL account '{$code}' is inactive.");
        }
        return $gl;
    }

    private function uniqueAccountNumber(): string
    {
        for ($i = 0; $i < 10; $i++) {
            $candidate = DepositAccount::generateAccountNumber();
            if (!$this->accountRepo->accountNumberExists($candidate)) {
                return $candidate;
            }
        }
        throw new DomainException('Unable to generate a unique deposit account number; please retry.');
    }
}
