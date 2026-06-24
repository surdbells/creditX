<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use Psr\Log\LoggerInterface;

/**
 * One-time-code service for the customer self-service portal.
 *
 * Unlike the staff {@see OtpService} (which is bound to the User entity and
 * persists OtpToken rows), customers may not yet have a verified account when
 * they need a code — e.g. email-verification at registration. So codes live in
 * Redis, keyed by purpose + email, with a TTL. No database row is required and
 * codes expire on their own.
 *
 * Two purposes are used:
 *   - 'verify': email-verification code sent at registration / resend.
 *   - 'login':  passwordless login code (email OTP).
 */
final class CustomerOtpService
{
    private const CODE_TTL_SECONDS = 600;   // 10 minutes
    private const RESEND_COOLDOWN = 60;     // min seconds between sends
    private const MAX_ATTEMPTS = 5;         // verify attempts per code

    public function __construct(
        private readonly RedisService $redis,
        private readonly ?LoggerInterface $logger = null,
    ) {
    }

    /**
     * Generate a 6-digit code for the given email + purpose, store it in
     * Redis, and email it. Returns false if a code was sent too recently
     * (cooldown still active), true once a code has been issued.
     */
    public function generateAndSend(string $email, string $fullName, string $purpose = 'login'): bool
    {
        $email = strtolower(trim($email));

        if ($this->redis->exists($this->cooldownKey($email, $purpose))) {
            return false;
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $this->redis->setJson(
            $this->codeKey($email, $purpose),
            ['code' => $code, 'attempts' => 0],
            self::CODE_TTL_SECONDS,
        );
        $this->redis->set($this->cooldownKey($email, $purpose), '1', self::RESEND_COOLDOWN);

        try {
            $this->sendOtpEmail($email, $fullName, $code, $purpose);
        } catch (\Throwable $e) {
            $this->logger?->error('Customer OTP email failed: ' . $e->getMessage(), [
                'email'   => $email,
                'purpose' => $purpose,
            ]);
            // Code is stored — the customer can request a resend.
        }

        return true;
    }

    /**
     * Verify a submitted code. On success the code is consumed (deleted) so it
     * cannot be reused. Wrong codes count against a per-code attempt limit;
     * exceeding it invalidates the code (forces a fresh request).
     */
    public function verify(string $email, string $code, string $purpose = 'login'): bool
    {
        $email = strtolower(trim($email));
        $key   = $this->codeKey($email, $purpose);

        $stored = $this->redis->getJson($key);
        if ($stored === null || !isset($stored['code'])) {
            return false;
        }

        $attempts = (int) ($stored['attempts'] ?? 0);
        if ($attempts >= self::MAX_ATTEMPTS) {
            $this->redis->delete($key);
            return false;
        }

        if (!hash_equals((string) $stored['code'], $code)) {
            $stored['attempts'] = $attempts + 1;
            // Preserve the remaining TTL so a bad guess can't extend the window.
            $ttl = $this->redis->ttl($key);
            $this->redis->setJson($key, $stored, $ttl > 0 ? $ttl : self::CODE_TTL_SECONDS);
            return false;
        }

        $this->redis->delete($key);
        $this->redis->delete($this->cooldownKey($email, $purpose));
        return true;
    }

    private function codeKey(string $email, string $purpose): string
    {
        return 'customer_otp:' . $purpose . ':' . $email;
    }

    private function cooldownKey(string $email, string $purpose): string
    {
        return 'customer_otp_cooldown:' . $purpose . ':' . $email;
    }

    private function sendOtpEmail(string $email, string $fullName, string $code, string $purpose): void
    {
        $apiKey = $_ENV['ZEPTOMAIL_API_KEY'] ?? '';
        if (empty($apiKey)) {
            $this->logger?->warning('ZEPTOMAIL_API_KEY not set, skipping customer OTP email');
            return;
        }

        if (!function_exists('curl_init')) {
            $this->logger?->error('Customer OTP email: curl extension not installed');
            return;
        }

        $fromEmail = $_ENV['ZEPTOMAIL_FROM_EMAIL'] ?? 'noreply@dostsuite.com';
        $fromName  = $_ENV['ZEPTOMAIL_FROM_NAME'] ?? 'CreditX';
        $ttlMin    = (int) (self::CODE_TTL_SECONDS / 60);

        $intro = $purpose === 'verify'
            ? 'Use the code below to verify your email and activate your CreditX account.'
            : 'Use the code below to sign in to your CreditX account.';
        $subject = $purpose === 'verify'
            ? "CreditX - Verify your email: {$code}"
            : "CreditX - Your login code is {$code}";

        $payload = [
            'from'     => ['address' => $fromEmail, 'name' => $fromName],
            'to'       => [['email_address' => ['address' => $email, 'name' => $fullName]]],
            'subject'  => $subject,
            'htmlbody' => $this->buildOtpEmailHtml($fullName, $code, $ttlMin, $intro),
        ];

        $ch = curl_init('https://api.zeptomail.com/v1.1/email');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => [
                'Authorization: ' . $apiKey,
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            $this->logger?->error('Customer OTP email curl failed', ['error' => $curlError]);
            return;
        }

        if ($httpCode >= 400) {
            $this->logger?->error('Customer OTP email API error', [
                'http_code' => $httpCode,
                'response'  => substr((string) $response, 0, 500),
            ]);
        }
    }

    private function buildOtpEmailHtml(string $name, string $code, int $ttl, string $intro): string
    {
        return <<<HTML
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:500px;margin:0 auto;padding:0;background:#f8f9fa">
            <div style="background:linear-gradient(135deg,#0A4F2A 0%,#0d6b3a 100%);padding:32px 24px;text-align:center;border-radius:0 0 24px 24px">
                <h1 style="color:#fff;font-size:28px;margin:0;font-weight:800;letter-spacing:-0.5px">
                    Credit<span style="color:#C9A227">X</span>
                </h1>
                <p style="color:rgba(255,255,255,0.7);font-size:12px;margin:8px 0 0;text-transform:uppercase;letter-spacing:2px">Customer Portal</p>
            </div>
            <div style="padding:32px 24px">
                <p style="color:#374151;font-size:15px;margin:0 0 8px">Hello <strong>{$name}</strong>,</p>
                <p style="color:#6b7280;font-size:14px;margin:0 0 24px;line-height:1.5">{$intro} This code is valid for <strong>{$ttl} minutes</strong>.</p>
                <div style="background:#fff;border:2px solid #e5e7eb;border-radius:16px;padding:24px;text-align:center;margin:0 0 24px">
                    <div style="font-size:36px;font-weight:800;letter-spacing:12px;color:#0A4F2A;font-family:'Courier New',monospace">{$code}</div>
                </div>
                <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0 0 24px">If you didn't request this code, you can safely ignore this email.</p>
                <div style="border-top:1px solid #e5e7eb;padding-top:16px;text-align:center">
                    <p style="color:#9ca3af;font-size:11px;margin:0">&copy; 2026 DOST HQ LIMITED</p>
                </div>
            </div>
        </div>
        HTML;
    }
}
