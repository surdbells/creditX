<?php
declare(strict_types=1);
namespace App\Infrastructure\Service\Payment;

use App\Domain\Entity\Settlement;
use App\Domain\Enum\SettlementStatus;

/**
 * Flutterwave payout provider (API v3). Transfer flow:
 *   1. POST /transfers with account_bank (code), account_number, amount in
 *      naira, and our settlement idempotency key as `reference`.
 *   2. Final status arrives via webhook (event 'transfer.completed',
 *      data.status SUCCESSFUL / FAILED), verified with the verif-hash header.
 *
 * Docs: https://developer.flutterwave.com/docs/transfers
 */
final class FlutterwaveTransferProvider extends AbstractTransferProvider implements TransferProviderInterface
{
    private const BASE = 'https://api.flutterwave.com/v3';

    public function name(): string { return 'flutterwave'; }

    public function isConfigured(): bool { return $this->secret() !== ''; }

    private function secret(): string { return $this->env('FLUTTERWAVE_SECRET_KEY'); }

    private function authHeaders(): array
    {
        return ['Authorization: Bearer ' . $this->secret()];
    }

    public function resolveAccount(string $accountNumber, string $bankCode): string
    {
        if (!$this->isConfigured()) $this->fail('Flutterwave is not configured on the server.');

        $res = $this->request('POST', self::BASE . '/accounts/resolve', $this->authHeaders(), [
            'account_number' => $accountNumber,
            'account_bank'   => $bankCode,
        ]);
        $name = $res['body']['data']['account_name'] ?? null;
        if (($res['body']['status'] ?? '') !== 'success' || !$name) {
            $this->fail((string) ($res['body']['message'] ?? 'Could not resolve the bank account with Flutterwave.'));
        }
        return (string) $name;
    }

    public function initiateTransfer(Settlement $settlement): array
    {
        if (!$this->isConfigured()) $this->fail('Flutterwave is not configured on the server.');

        // Flutterwave amount is in the major unit (naira), not kobo.
        $amount = round((float) $settlement->getAmount(), 2);
        $tr = $this->request('POST', self::BASE . '/transfers', $this->authHeaders(), [
            'account_bank'   => $settlement->getBankCode(),
            'account_number' => $settlement->getAccountNumber(),
            'amount'         => $amount,
            'currency'       => 'NGN',
            'narration'      => 'Loan settlement ' . $settlement->getLoan()->getApplicationId(),
            'reference'      => $settlement->getIdempotencyKey(),
        ]);

        $settlement->setProviderResponse($tr['body']);

        if (($tr['body']['status'] ?? '') !== 'success') {
            $this->fail((string) ($tr['body']['message'] ?? 'Flutterwave rejected the transfer.'));
        }

        $data = $tr['body']['data'] ?? [];
        // Store the numeric transfer id as our provider reference.
        $settlement->setProviderReference((string) ($data['id'] ?? $settlement->getIdempotencyKey()));

        // Flutterwave transfer status: NEW / PENDING (async) → processing;
        // SUCCESSFUL → success; FAILED → failed.
        $status = match (strtoupper((string) ($data['status'] ?? 'PENDING'))) {
            'SUCCESSFUL' => SettlementStatus::SUCCESS,
            'FAILED'     => SettlementStatus::FAILED,
            default      => SettlementStatus::PROCESSING,
        };

        return ['status' => $status, 'reference' => $settlement->getProviderReference(), 'reason' => null];
    }

    public function verifyWebhook(string $rawBody, array $headers): bool
    {
        // Flutterwave signs webhooks with a static secret hash the merchant
        // configures in the dashboard, sent in the 'verif-hash' header.
        $expected = $this->env('FLUTTERWAVE_WEBHOOK_HASH');
        if ($expected === '') return false;
        $got = $this->header($headers, 'verif-hash');
        return $got !== '' && hash_equals($expected, $got);
    }

    public function parseWebhookEvent(array $payload): ?array
    {
        $event = (string) ($payload['event'] ?? '');
        if ($event !== 'transfer.completed') return null;

        $data = $payload['data'] ?? [];
        $reference = (string) ($data['reference'] ?? '');
        if ($reference === '') return null;

        $status = match (strtoupper((string) ($data['status'] ?? ''))) {
            'SUCCESSFUL' => SettlementStatus::SUCCESS,
            'FAILED'     => SettlementStatus::FAILED,
            default      => null,
        };
        if ($status === null) return null;

        return [
            'reference' => $reference,
            'status'    => $status,
            'reason'    => $data['complete_message'] ?? $data['narration'] ?? null,
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
