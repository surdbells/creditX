<?php
declare(strict_types=1);
namespace App\Infrastructure\Service\Payment;

use App\Domain\Entity\Settlement;
use App\Domain\Enum\SettlementStatus;

/**
 * Paystack payout provider. Transfer flow:
 *   1. Create a transfer recipient (nuban) → recipient_code.
 *   2. Initiate a transfer to that recipient, amount in kobo, with our
 *      settlement idempotency key as the transfer `reference`.
 *   3. Final status arrives asynchronously via webhook (transfer.success /
 *      transfer.failed / transfer.reversed).
 *
 * Docs: https://paystack.com/docs/transfers
 */
final class PaystackTransferProvider extends AbstractTransferProvider implements TransferProviderInterface
{
    private const BASE = 'https://api.paystack.co';

    public function name(): string { return 'paystack'; }

    public function isConfigured(): bool { return $this->secret() !== ''; }

    private function secret(): string { return $this->env('PAYSTACK_SECRET_KEY'); }

    private function authHeaders(): array
    {
        return ['Authorization: Bearer ' . $this->secret()];
    }

    public function resolveAccount(string $accountNumber, string $bankCode): string
    {
        if (!$this->isConfigured()) $this->fail('Paystack is not configured on the server.');

        $res = $this->request(
            'GET',
            self::BASE . '/bank/resolve?account_number=' . urlencode($accountNumber) . '&bank_code=' . urlencode($bankCode),
            $this->authHeaders(),
        );
        $name = $res['body']['data']['account_name'] ?? null;
        if (empty($res['body']['status']) || !$name) {
            $this->fail((string) ($res['body']['message'] ?? 'Could not resolve the bank account with Paystack.'));
        }
        return (string) $name;
    }

    public function initiateTransfer(Settlement $settlement): array
    {
        if (!$this->isConfigured()) $this->fail('Paystack is not configured on the server.');

        // 1. Ensure a transfer recipient exists.
        $recipient = $settlement->getProviderRecipient();
        if ($recipient === null || $recipient === '') {
            $rr = $this->request('POST', self::BASE . '/transferrecipient', $this->authHeaders(), [
                'type'           => 'nuban',
                'name'           => $settlement->getAccountName() ?: $settlement->getCustomer()->getFullName(),
                'account_number' => $settlement->getAccountNumber(),
                'bank_code'      => $settlement->getBankCode(),
                'currency'       => 'NGN',
            ]);
            $recipient = $rr['body']['data']['recipient_code'] ?? null;
            if (empty($rr['body']['status']) || !$recipient) {
                $this->fail((string) ($rr['body']['message'] ?? 'Paystack could not create the transfer recipient.'));
            }
            $settlement->setProviderRecipient((string) $recipient);
        }

        // 2. Initiate the transfer. Amount is in kobo.
        $kobo = (int) round(((float) $settlement->getAmount()) * 100);
        $tr = $this->request('POST', self::BASE . '/transfer', $this->authHeaders(), [
            'source'    => 'balance',
            'amount'    => $kobo,
            'recipient' => $recipient,
            'reason'    => 'Loan settlement ' . $settlement->getLoan()->getApplicationId(),
            'reference' => $settlement->getIdempotencyKey(),
            'currency'  => 'NGN',
        ]);

        $settlement->setProviderResponse($tr['body']);

        if (empty($tr['body']['status'])) {
            $this->fail((string) ($tr['body']['message'] ?? 'Paystack rejected the transfer.'));
        }

        $data = $tr['body']['data'] ?? [];
        $settlement->setProviderReference((string) ($data['transfer_code'] ?? $settlement->getIdempotencyKey()));

        // Paystack transfer status: 'success' (rare, instant), 'pending',
        // 'otp' (OTP required — treat as processing; admin must enable
        // no-OTP transfers for automation), 'failed'.
        $status = match ((string) ($data['status'] ?? 'pending')) {
            'success' => SettlementStatus::SUCCESS,
            'failed'  => SettlementStatus::FAILED,
            default   => SettlementStatus::PROCESSING,
        };

        return ['status' => $status, 'reference' => $settlement->getProviderReference(), 'reason' => null];
    }

    public function verifyWebhook(string $rawBody, array $headers): bool
    {
        $secret = $this->secret();
        if ($secret === '') return false;
        $signature = $this->header($headers, 'x-paystack-signature');
        if ($signature === '') return false;
        $expected = hash_hmac('sha512', $rawBody, $secret);
        return hash_equals($expected, $signature);
    }

    public function parseWebhookEvent(array $payload): ?array
    {
        $event = (string) ($payload['event'] ?? '');
        $data  = $payload['data'] ?? [];
        // Our transfer `reference` = settlement idempotency key.
        $reference = (string) ($data['reference'] ?? '');
        if ($reference === '') return null;

        $status = match ($event) {
            'transfer.success'  => SettlementStatus::SUCCESS,
            'transfer.failed'   => SettlementStatus::FAILED,
            'transfer.reversed' => SettlementStatus::REVERSED,
            default             => null,
        };
        if ($status === null) return null;

        return [
            'reference' => $reference,
            'status'    => $status,
            'reason'    => $data['reason'] ?? $data['message'] ?? null,
        ];
    }

    /** @param array<string,mixed> $headers */
    private function header(array $headers, string $name): string
    {
        foreach ($headers as $k => $v) {
            if (strtolower((string) $k) === $name) {
                return is_array($v) ? (string) ($v[0] ?? '') : (string) $v;
            }
        }
        return '';
    }
}
