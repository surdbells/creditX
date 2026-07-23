<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use Psr\Log\LoggerInterface;

/**
 * FirstCentral Credit Bureau integration (REST v2).
 *
 * Three-step API: login (DataTicket, ~5h TTL) → consumer/commercial match →
 * report generation. This service wraps all three and returns a NORMALIZED
 * result so callers never touch FirstCentral's payload shapes.
 *
 * Configuration is per-deployment. Secrets live in env (never the DB); the
 * on/off switch and decision thresholds live in system settings:
 *   env      FIRSTCENTRAL_BASE_URL / _USERNAME / _PASSWORD / _ENQUIRY_REASON
 *   settings credit_bureau.enabled / .consumer_product_id / .pass_threshold /
 *            .fail_threshold
 *
 * Verified against UAT (demo/demo@123, BVN 22471069115): the iScore report
 * returns Scoring[0].TotalConsumerScore (e.g. "762") and Description
 * (e.g. "LOW RISK"); an unknown BVN matches with ConsumerID "0" / MatchingRate
 * 0, which we treat as a no-hit.
 */
final class FirstCentralService
{
    private const TICKET_KEY = 'firstcentral:ticket';
    private const TICKET_TTL = 16200; // 4.5h — under the documented 5h expiry.

    public function __construct(
        private readonly SettingsCacheService $settings,
        private readonly RedisService $redis,
        private readonly ?LoggerInterface $logger = null,
    ) {}

    public function isConfigured(): bool
    {
        return $this->baseUrl() !== '' && $this->env('FIRSTCENTRAL_USERNAME') !== '' && $this->env('FIRSTCENTRAL_PASSWORD') !== '';
    }

    public function isEnabled(): bool
    {
        return $this->settings->getBool('credit_bureau.enabled', false);
    }

    private function baseUrl(): string
    {
        return rtrim($this->env('FIRSTCENTRAL_BASE_URL'), '/');
    }

    private function env(string $key): string
    {
        return (string) ($_ENV[$key] ?? getenv($key) ?: '');
    }

    /**
     * Consumer credit check by BVN (preferred) or name + date of birth.
     *
     * @return array{status:string, score:?int, risk_band:?string, summary:array, provider_ref:?string, raw:array, error:?string}
     *         status is one of: hit | no_hit | not_configured | error
     */
    public function checkConsumer(?string $bvn, ?string $name = null, ?string $dob = null): array
    {
        if (!$this->isConfigured()) return $this->result('not_configured', null, null, [], null, [], 'FirstCentral is not configured on this server.');

        $productId = (string) $this->settings->get('credit_bureau.consumer_product_id', '70'); // iScore

        try {
            $ticket = $this->ticket();

            $match = $this->call('/ConnectConsumerMatch', [
                'DataTicket'     => $ticket,
                'EnquiryReason'  => $this->enquiryReason(),
                'ConsumerName'   => $name ?? '',
                'DateOfBirth'    => $dob ?? '',
                'Identification' => $bvn ?? '',
                'Accountno'      => '',
                'ProductID'      => $productId,
            ]);

            $matched = $match[0]['MatchedConsumer'][0] ?? null;
            $consumerId = (string) ($matched['ConsumerID'] ?? '0');
            $matchRate = (int) ($matched['MatchingRate'] ?? 0);
            // No-hit: unknown identity matches with ConsumerID "0" / rate 0.
            if ($matched === null || $consumerId === '0' || $consumerId === '' || $matchRate === 0) {
                return $this->result('no_hit', null, null, [], null, $match, null);
            }

            // Gather all consumer IDs for the merge list (BVN is unique, so this
            // is normally one — but the API asks for a comma-joined list).
            $ids = [];
            foreach ($match[0]['MatchedConsumer'] as $m) {
                $id = (string) ($m['ConsumerID'] ?? '');
                if ($id !== '' && $id !== '0') $ids[] = $id;
            }
            $mergeList = implode(',', array_unique($ids));

            $report = $this->call('/consumerreports', [
                'DataTicket'                => $ticket,
                'consumerID'                => $consumerId,
                'EnquiryID'                 => (string) ($matched['EnquiryID'] ?? ''),
                'consumerMergeList'         => $mergeList ?: $consumerId,
                'SubscriberEnquiryEngineID' => (string) ($matched['MatchingEngineID'] ?? ''),
                'productid'                 => (int) $productId,
            ]);

            $scoring = $this->firstBlock($report, 'Scoring');
            $score = $this->parseScore($scoring['TotalConsumerScore'] ?? null);

            return $this->result(
                'hit',
                $score,
                $scoring['Description'] ?? null,
                $this->consumerSummary($scoring),
                $consumerId,
                $report,
                $score === null ? 'Report returned but no numeric score present.' : null,
            );
        } catch (\Throwable $e) {
            $this->logger?->error('FirstCentral consumer check failed', ['error' => $e->getMessage(), 'bvn' => $bvn]);
            return $this->result('error', null, null, [], null, [], $e->getMessage());
        }
    }

    /**
     * Commercial credit check by business name or RC number. Commercial reports
     * do not carry the iScore-style numeric score, so score stays null and the
     * caller routes these to a human with the report attached.
     *
     * @return array{status:string, score:?int, risk_band:?string, summary:array, provider_ref:?string, raw:array, error:?string}
     */
    public function checkCommercial(?string $businessName, ?string $rcNumber): array
    {
        if (!$this->isConfigured()) return $this->result('not_configured', null, null, [], null, [], 'FirstCentral is not configured on this server.');

        $productId = (string) $this->settings->get('credit_bureau.commercial_product_id', '47'); // Commercial Full Credit

        try {
            $ticket = $this->ticket();

            $match = $this->call('/ConnectCommercialMatch', [
                'DataTicket'                 => $ticket,
                'EnquiryReason'              => $this->enquiryReason(),
                'BusinessName'               => $businessName ?? '',
                'BusinessRegistrationNumber' => $rcNumber ?? '',
                'AccountNumber'              => '',
                'ProductID'                  => $productId,
            ]);

            $matches = $match[0]['ConnectCommercialMatch'] ?? [];
            $first = $matches[0] ?? null;
            $commercialId = (string) ($first['CommercialID'] ?? '');
            if ($first === null || $commercialId === '' || $commercialId === '0') {
                return $this->result('no_hit', null, null, [], null, $match, null);
            }

            $ids = [];
            foreach ($matches as $m) {
                $id = (string) ($m['CommercialID'] ?? '');
                if ($id !== '' && $id !== '0') $ids[] = $id;
            }

            $report = $this->call('/commercialreports', [
                'DataTicket'                => $ticket,
                'commercialID'              => $commercialId,
                'EnquiryID'                 => (string) ($first['SubscriberEnquiryID'] ?? ''),
                'commercialMergeList'       => implode(',', array_unique($ids)) ?: $commercialId,
                'SubscriberEnquiryEngineID' => (string) ($first['MatchingEngineID'] ?? ''),
                'productid'                 => (int) $productId,
            ]);

            return $this->result('hit', null, null, [], $commercialId, $report, 'Commercial report attached — manual review (no numeric score).');
        } catch (\Throwable $e) {
            $this->logger?->error('FirstCentral commercial check failed', ['error' => $e->getMessage(), 'business' => $businessName, 'rc' => $rcNumber]);
            return $this->result('error', null, null, [], null, [], $e->getMessage());
        }
    }

    // ── Internals ──────────────────────────────────────────────────────────

    private function enquiryReason(): string
    {
        // Live requires a CBN-approved reason; default fits loan applications.
        $r = $this->env('FIRSTCENTRAL_ENQUIRY_REASON');
        return $r !== '' ? $r : 'Application for Credit by a borrower';
    }

    /** Login (cached ~4.5h in Redis) → DataTicket. */
    private function ticket(): string
    {
        $cached = null;
        try { $cached = $this->redis->get(self::TICKET_KEY); } catch (\Throwable $e) { /* redis optional */ }
        if ($cached !== null && $cached !== '') return $cached;

        $res = $this->call('/login', [
            'username' => $this->env('FIRSTCENTRAL_USERNAME'),
            'password' => $this->env('FIRSTCENTRAL_PASSWORD'),
        ], /* isLogin */ true);

        $ticket = (string) ($res[0]['DataTicket'] ?? '');
        if ($ticket === '') {
            throw new \RuntimeException('FirstCentral login did not return a DataTicket.');
        }
        try { $this->redis->set(self::TICKET_KEY, $ticket, self::TICKET_TTL); } catch (\Throwable $e) { /* redis optional */ }
        return $ticket;
    }

    /**
     * POST a JSON body and return the decoded array. On a 400/401 for a
     * non-login call the ticket may have expired — drop the cached ticket and
     * retry once with a fresh login.
     *
     * @param array<string,mixed> $body
     * @return array<mixed>
     */
    private function call(string $path, array $body, bool $isLogin = false, bool $retried = false): array
    {
        [$code, $decoded, $err] = $this->http($this->baseUrl() . $path, $body);

        if (!$isLogin && !$retried && in_array($code, [400, 401], true)) {
            try { $this->redis->delete(self::TICKET_KEY); } catch (\Throwable $e) {}
            $body['DataTicket'] = $this->ticket();
            return $this->call($path, $body, false, true);
        }

        if ($err !== null) {
            throw new \RuntimeException('FirstCentral request failed: ' . $err);
        }
        if ($code >= 400) {
            throw new \RuntimeException("FirstCentral returned HTTP {$code} for {$path}.");
        }
        return $decoded;
    }

    /**
     * @return array{0:int,1:array<mixed>,2:?string} [httpCode, decodedBody, errorOrNull]
     */
    private function http(string $url, array $body): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 90,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_POSTFIELDS     => json_encode($body),
        ]);
        $raw = curl_exec($ch);
        $err = curl_error($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($raw === false || $err !== '') {
            return [0, [], $err !== '' ? $err : 'connection error'];
        }
        $decoded = json_decode((string) $raw, true);
        return [$code, is_array($decoded) ? $decoded : [], null];
    }

    /** FirstCentral wraps report sections as [{"Scoring":[{...}]}, ...]. Pull the first row of a named section. */
    private function firstBlock(array $report, string $section): array
    {
        foreach ($report as $block) {
            if (is_array($block) && isset($block[$section][0]) && is_array($block[$section][0])) {
                return $block[$section][0];
            }
        }
        return [];
    }

    private function parseScore(mixed $v): ?int
    {
        if ($v === null || $v === '') return null;
        if (!is_numeric($v)) return null;
        return (int) $v;
    }

    /** @param array<string,mixed> $scoring */
    private function consumerSummary(array $scoring): array
    {
        $keys = [
            'Description', 'ScoreDate', 'TotalOutstandingDebt', 'TotalAmountOverdue',
            'TotalAccountarrear', 'TotalAccounts', 'TotalaccountinGoodcondition',
            'TotalaccountinBadcondition',
        ];
        $out = [];
        foreach ($keys as $k) {
            if (array_key_exists($k, $scoring)) $out[$k] = $scoring[$k];
        }
        return $out;
    }

    private function result(string $status, ?int $score, ?string $band, array $summary, ?string $ref, array $raw, ?string $error): array
    {
        return [
            'status'       => $status,
            'score'        => $score,
            'risk_band'    => $band,
            'summary'      => $summary,
            'provider_ref' => $ref,
            'raw'          => $raw,
            'error'        => $error,
        ];
    }
}
