<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\{Loan, MakerCheckerRequest, Settlement, User};
use App\Domain\Enum\{LoanStatus, SettlementStatus};
use App\Domain\Exception\DomainException;
use App\Domain\Repository\SettlementRepository;
use App\Infrastructure\Data\NigerianBanks;
use App\Infrastructure\Service\Payment\TransferProviderFactory;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Orchestrates loan settlements — the outbound bank transfer that pays the
 * disbursed funds to the customer via Paystack/Flutterwave.
 *
 * Money-safety guarantees:
 *  - Idempotent initiation: at most one ACTIVE settlement per loan. A repeat
 *    call returns the existing active row instead of paying twice.
 *  - The provider `reference` is our per-settlement idempotency key, so a
 *    retried provider call never creates two real transfers.
 *  - Webhook reconciliation is idempotent: replays of the same terminal event
 *    are no-ops.
 */
final class SettlementService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly SettlementRepository $settlementRepo,
        private readonly TransferProviderFactory $providers,
        private readonly SettingsCacheService $settings,
        private readonly NotificationDispatchService $notifier,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function isEnabled(): bool
    {
        return $this->settings->getBool('settlement.enabled', false);
    }

    /** 'immediate' | 'maker_checker' — how a settlement is triggered after disbursement. */
    public function mode(): string
    {
        $mode = (string) $this->settings->get('settlement.mode', 'immediate');
        return $mode === 'maker_checker' ? 'maker_checker' : 'immediate';
    }

    /**
     * Hand off to settlement right after a loan is disbursed, honoring the
     * configured mode. Called from both the direct disburse action and the
     * maker-checker disbursement executor. Never throws — settlement problems
     * must not roll back a completed disbursement; they surface in the return.
     *
     * @return array|null Null when settlement is disabled. Otherwise a small
     *                    status array describing what happened.
     */
    public function handlePostDisbursement(Loan $loan, ?User $actor, ?string $providerOverride = null): ?array
    {
        if (!$this->isEnabled()) {
            return null;
        }
        return $this->dispatch($loan, $actor, $providerOverride);
    }

    /**
     * Explicitly request a settlement (manual "Settle now" / retry button).
     * Unlike handlePostDisbursement this ignores the settlement.enabled flag
     * — the operator is asking for it directly — but still honors the mode
     * (immediate vs maker-checker) so governance isn't bypassed.
     */
    public function requestManual(Loan $loan, User $actor, ?string $providerOverride = null): array
    {
        return $this->dispatch($loan, $actor, $providerOverride);
    }

    /** Mode-based dispatch shared by the post-disbursement hook and manual path. */
    private function dispatch(Loan $loan, ?User $actor, ?string $providerOverride): array
    {
        // Maker-checker mode — queue the settlement for a second approver.
        if ($this->mode() === 'maker_checker') {
            if ($actor === null) {
                // The maker is mandatory; without one we cannot queue. Fall
                // back to recording nothing and reporting the problem.
                $this->logger->error('Cannot queue settlement for maker-checker without an actor', ['loan' => $loan->getId()]);
                return ['mode' => 'maker_checker', 'error' => 'No operator identity to record as maker.'];
            }
            $mc = new MakerCheckerRequest();
            $mc->setOperationType('settlement');
            $mc->setEntityType('Loan');
            $mc->setEntityId($loan->getId());
            $mc->setPayload(['loan_id' => $loan->getId(), 'provider' => $providerOverride]);
            $mc->setMaker($actor);
            $this->em->persist($mc);
            $this->em->flush();
            return ['mode' => 'maker_checker', 'maker_checker_id' => $mc->getId(), 'status' => 'pending_checker'];
        }

        // Immediate mode — send now. Swallow errors into the return so the
        // disbursement response still succeeds; the failed settlement is
        // recorded and retryable.
        try {
            $settlement = $this->initiate($loan, $actor, $providerOverride);
            return ['mode' => 'immediate', 'settlement' => $settlement->toArray()];
        } catch (DomainException $e) {
            $this->logger->error('Post-disbursement settlement could not start', ['loan' => $loan->getId(), 'error' => $e->getMessage()]);
            return ['mode' => 'immediate', 'error' => $e->getMessage()];
        }
    }

    /**
     * Initiate (or return the existing) settlement for a disbursed loan.
     *
     * Validation failures throw DomainException (nothing is charged). A
     * provider-side transfer rejection does NOT throw — it records a FAILED
     * settlement and returns it, so an immediate-mode disbursement is not
     * rolled back and the operator can retry.
     *
     * @param string|null $providerName Explicit provider override, else the default.
     */
    public function initiate(Loan $loan, ?User $initiatedBy = null, ?string $providerName = null): Settlement
    {
        // Idempotency — never pay a loan twice.
        $existing = $this->settlementRepo->findActiveForLoan($loan->getId());
        if ($existing !== null) {
            return $existing;
        }

        if ($loan->getStatus() !== LoanStatus::DISBURSED && $loan->getDisbursedAt() === null) {
            throw new DomainException('Loan must be disbursed before it can be settled.');
        }

        $amount = $loan->getNetDisbursed();
        if ($amount === null || (float) $amount <= 0) {
            throw new DomainException('Loan has no net disbursement amount to settle.');
        }

        $customer = $loan->getCustomer();
        $accountNumber = trim((string) $customer->getAccountNumber());
        if ($accountNumber === '') {
            throw new DomainException('Customer has no bank account number on file.');
        }

        $bankCode = $this->resolveBankCode($customer->getBankCode(), $customer->getBankName());
        if ($bankCode === null) {
            throw new DomainException('Customer bank code is missing and could not be derived from the bank name. Update the customer record.');
        }

        $provider = $this->providers->resolve($providerName);
        if (!$provider->isConfigured()) {
            throw new DomainException(ucfirst($provider->name()) . ' is not configured on the server.');
        }

        // Create the pending settlement and flush BEFORE calling the provider,
        // so a fast webhook can always find the row by idempotency key.
        $settlement = new Settlement();
        $settlement->setLoan($loan);
        $settlement->setCustomer($customer);
        $settlement->setProvider($provider->name());
        $settlement->setAmount($amount);
        $settlement->setBankCode($bankCode);
        $settlement->setAccountNumber($accountNumber);
        $settlement->setAccountName($customer->getFullName());
        $settlement->setInitiatedBy($initiatedBy);
        $settlement->setStatus(SettlementStatus::PENDING);
        $this->em->persist($settlement);
        $this->em->flush();

        // Best-effort account name verification — never blocks the transfer,
        // but records the verified name when available.
        try {
            $settlement->setAccountName($provider->resolveAccount($accountNumber, $bankCode));
        } catch (\Throwable $e) {
            $this->logger->warning('Settlement account resolve failed', ['settlement' => $settlement->getId(), 'error' => $e->getMessage()]);
        }

        try {
            $result = $provider->initiateTransfer($settlement);
            $settlement->setStatus($result['status']);
            if ($result['status'] === SettlementStatus::SUCCESS) {
                $settlement->setSettledAt(new \DateTimeImmutable());
            }
        } catch (DomainException $e) {
            $settlement->setStatus(SettlementStatus::FAILED);
            $settlement->setFailureReason($e->getMessage());
            $this->logger->error('Settlement transfer failed', ['settlement' => $settlement->getId(), 'error' => $e->getMessage()]);
        }

        $this->em->flush();

        if ($settlement->getStatus() === SettlementStatus::SUCCESS) {
            $this->notifySettled($settlement);
        }

        return $settlement;
    }

    /**
     * Reconcile an inbound provider webhook. Verifies authenticity, matches the
     * settlement by our idempotency key, and transitions its status once.
     * Idempotent — replays are no-ops.
     *
     * @return bool True if the webhook was accepted (authentic), even if it
     *              referenced no known settlement.
     */
    public function handleWebhook(string $providerName, string $rawBody, array $headers, array $payload): bool
    {
        $provider = $this->providers->byName($providerName);
        if (!$provider->verifyWebhook($rawBody, $headers)) {
            $this->logger->warning('Settlement webhook signature invalid', ['provider' => $providerName]);
            return false;
        }

        $event = $provider->parseWebhookEvent($payload);
        if ($event === null) {
            return true; // authentic but not a transfer event we track
        }

        $settlement = $this->settlementRepo->findByIdempotencyKey($event['reference']);
        if ($settlement === null) {
            $this->logger->info('Settlement webhook for unknown reference', ['provider' => $providerName, 'reference' => $event['reference']]);
            return true;
        }

        /** @var SettlementStatus $newStatus */
        $newStatus = $event['status'];

        // Idempotency — ignore replays and illegal backward transitions.
        if ($settlement->getStatus() === $newStatus) {
            return true;
        }
        if ($settlement->getStatus() === SettlementStatus::REVERSED) {
            return true; // terminal reversal wins
        }

        $settlement->setStatus($newStatus);
        if ($newStatus === SettlementStatus::SUCCESS) {
            $settlement->setSettledAt(new \DateTimeImmutable());
            $settlement->setFailureReason(null);
        } elseif (in_array($newStatus, [SettlementStatus::FAILED, SettlementStatus::REVERSED], true)) {
            $settlement->setFailureReason($event['reason'] ?? ($newStatus === SettlementStatus::REVERSED ? 'Transfer reversed' : 'Transfer failed'));
        }
        $this->em->flush();

        if ($newStatus === SettlementStatus::SUCCESS) {
            $this->notifySettled($settlement);
        } elseif ($newStatus === SettlementStatus::FAILED) {
            $this->notifyFailed($settlement);
        }

        return true;
    }

    /**
     * Resolve a usable numeric bank code: prefer the stored code, else reverse
     * -map from the bank name against the Nigerian banks list (best effort).
     */
    private function resolveBankCode(?string $code, ?string $bankName): ?string
    {
        $code = trim((string) $code);
        if ($code !== '') return $code;

        $name = strtolower(trim((string) $bankName));
        if ($name === '') return null;

        foreach (NigerianBanks::all() as $bankCode => $bankLabel) {
            if (strtolower($bankLabel) === $name) {
                return (string) $bankCode;
            }
        }
        return null;
    }

    private function notifySettled(Settlement $s): void
    {
        try {
            $this->notifier->notifyAgent(
                $s->getLoan()->getAgent(),
                'Loan settled',
                "Settlement of ₦{$s->getAmount()} for {$s->getCustomer()->getFullName()} (loan {$s->getLoan()->getApplicationId()}) was paid successfully.",
                $s->getCustomer()->getId(),
            );
        } catch (\Throwable $e) {
            $this->logger->warning('Settlement notify (settled) failed', ['error' => $e->getMessage()]);
        }
    }

    private function notifyFailed(Settlement $s): void
    {
        try {
            $this->notifier->notifyAgent(
                $s->getLoan()->getAgent(),
                'Loan settlement failed',
                "Settlement for {$s->getCustomer()->getFullName()} (loan {$s->getLoan()->getApplicationId()}) failed: " . ($s->getFailureReason() ?? 'unknown reason') . '. It can be retried.',
                $s->getCustomer()->getId(),
            );
        } catch (\Throwable $e) {
            $this->logger->warning('Settlement notify (failed) failed', ['error' => $e->getMessage()]);
        }
    }
}
