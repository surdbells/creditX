<?php
declare(strict_types=1);
namespace App\Infrastructure\Service\Payment;

use App\Domain\Entity\Settlement;

/**
 * Abstraction over a bank-transfer (payout) provider — Paystack or
 * Flutterwave. Implementations wrap the provider's HTTP API so the rest of
 * the app deals only in normalized results. Secret keys are read from the
 * environment inside each implementation; they never pass through here.
 */
interface TransferProviderInterface
{
    /** Machine name: 'paystack' | 'flutterwave'. */
    public function name(): string;

    /** True when the provider's secret key is configured (env present). */
    public function isConfigured(): bool;

    /**
     * Resolve / verify a bank account, returning the account name.
     *
     * @throws \App\Domain\Exception\DomainException on failure.
     */
    public function resolveAccount(string $accountNumber, string $bankCode): string;

    /**
     * Initiate the payout for a settlement. Implementations set the
     * settlement's providerReference / providerRecipient / providerResponse.
     *
     * @return array{status: \App\Domain\Enum\SettlementStatus, reference: ?string, reason: ?string}
     * @throws \App\Domain\Exception\DomainException on a hard/synchronous failure.
     */
    public function initiateTransfer(Settlement $settlement): array;

    /** Verify an inbound webhook is authentic (signature/hash check). */
    public function verifyWebhook(string $rawBody, array $headers): bool;

    /**
     * Parse an inbound webhook body into a normalized transfer event, or null
     * if the event is not a transfer status we handle.
     *
     * @return array{reference: string, status: \App\Domain\Enum\SettlementStatus, reason: ?string}|null
     */
    public function parseWebhookEvent(array $payload): ?array;
}
