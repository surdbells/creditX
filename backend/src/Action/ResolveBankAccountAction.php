<?php
declare(strict_types=1);
namespace App\Action;

use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/banks/resolve?account_number=...&bank_code=...
 *
 * Resolves a Nigerian bank account to its account name via Paystack, using the
 * server-side PAYSTACK_SECRET_KEY. The secret NEVER leaves the backend — the
 * agent app calls this endpoint, not Paystack directly. Authenticated.
 */
final class ResolveBankAccountAction
{
    use ApiResponse;

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $q = $request->getQueryParams();
        $accountNumber = preg_replace('/\D/', '', (string) ($q['account_number'] ?? ''));
        $bankCode = trim((string) ($q['bank_code'] ?? ''));

        if (strlen($accountNumber) < 10 || $bankCode === '') {
            return $this->error('A 10-digit account_number and a bank_code are required.', 422);
        }

        $secret = $_ENV['PAYSTACK_SECRET_KEY'] ?? '';
        if ($secret === '') {
            return $this->error('Bank account resolution is not configured on the server.', 503);
        }

        $url = 'https://api.paystack.co/bank/resolve?account_number=' . urlencode($accountNumber)
            . '&bank_code=' . urlencode($bankCode);

        $curl = curl_init();
        curl_setopt_array($curl, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $secret,
                'Cache-Control: no-cache',
            ],
        ]);
        $body = curl_exec($curl);
        $err  = curl_error($curl);
        curl_close($curl);

        if ($err !== '') {
            return $this->error('Could not reach the bank resolution service. Try again.', 502);
        }

        $json = json_decode((string) $body, true);
        if (!is_array($json) || empty($json['status']) || empty($json['data']['account_name'])) {
            $msg = is_array($json) ? (string) ($json['message'] ?? '') : '';
            return $this->error($msg !== '' ? $msg : 'Account name could not be resolved. Check the number and bank.', 422);
        }

        return $this->success([
            'account_number' => (string) ($json['data']['account_number'] ?? $accountNumber),
            'account_name'   => (string) $json['data']['account_name'],
            'bank_code'      => $bankCode,
        ]);
    }
}
