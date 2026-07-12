<?php
declare(strict_types=1);
namespace App\Infrastructure\Service\Payment;

use App\Domain\Exception\DomainException;
use Psr\Log\LoggerInterface;

/**
 * Shared HTTP plumbing for transfer providers — a small curl wrapper with
 * consistent timeouts, JSON handling and error logging. Kept deliberately
 * minimal (no external HTTP client dependency) to match the codebase's
 * existing direct-curl style (see ResolveBankAccountAction).
 */
abstract class AbstractTransferProvider
{
    public function __construct(protected readonly LoggerInterface $logger)
    {
    }

    /**
     * Perform an HTTP request and return the decoded JSON body.
     *
     * @param array<string,string> $headers
     * @return array{status_code: int, body: array<mixed>, error: ?string}
     */
    protected function request(string $method, string $url, array $headers = [], ?array $json = null): array
    {
        $curl = curl_init();
        $opts = [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST  => strtoupper($method),
            CURLOPT_HTTPHEADER     => array_merge(['Content-Type: application/json', 'Accept: application/json'], $headers),
        ];
        if ($json !== null) {
            $opts[CURLOPT_POSTFIELDS] = json_encode($json);
        }
        curl_setopt_array($curl, $opts);

        $body = curl_exec($curl);
        $err  = curl_error($curl);
        $code = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);

        if ($err !== '') {
            $this->logger->error('Transfer provider HTTP error', ['url' => $url, 'error' => $err]);
            return ['status_code' => 0, 'body' => [], 'error' => $err];
        }

        $decoded = json_decode((string) $body, true);
        return [
            'status_code' => $code,
            'body'        => is_array($decoded) ? $decoded : [],
            'error'       => null,
        ];
    }

    protected function env(string $key): string
    {
        return (string) ($_ENV[$key] ?? getenv($key) ?: '');
    }

    protected function fail(string $message): never
    {
        throw new DomainException($message);
    }
}
