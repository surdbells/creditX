<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\{OtpToken, User};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

final class OtpService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly SettingsCacheService $settings,
        private readonly ?LoggerInterface $logger = null,
    ) {}

    public function generateAndSend(User $user, string $purpose = 'login'): OtpToken
    {
        // Invalidate existing unused OTPs
        $existing = $this->em->getRepository(OtpToken::class)->findBy([
            'user' => $user, 'purpose' => $purpose, 'used' => false,
        ]);
        foreach ($existing as $old) { $old->markUsed(); }

        $ttl = max(5, (int) ($this->settings->get('2fa.otp_ttl_minutes', '10')));
        $otp = OtpToken::create($user, $purpose, $ttl);
        $this->em->persist($otp);
        $this->em->flush();

        // Send email — MUST NOT throw on failure
        try {
            $this->sendOtpEmail($user, $otp->getCode(), $ttl);
        } catch (\Throwable $e) {
            $this->logger?->error('OTP email failed: ' . $e->getMessage(), [
                'user_id' => $user->getId(),
                'email' => $user->getEmail(),
            ]);
            // OTP is still created — user can request resend
        }

        return $otp;
    }

    public function verify(User $user, string $code, string $purpose = 'login'): bool
    {
        $otp = $this->em->getRepository(OtpToken::class)->findOneBy([
            'user' => $user, 'purpose' => $purpose, 'used' => false,
        ], ['createdAt' => 'DESC']);

        if (!$otp) {
            $this->logger?->error('OTP verify: no unused OTP found', ['user_id' => $user->getId(), 'purpose' => $purpose]);
            return false;
        }

        $this->logger?->info('OTP verify attempt', [
            'user_id' => $user->getId(),
            'input_code' => $code,
            'stored_code' => $otp->getCode(),
            'codes_match' => $otp->getCode() === $code,
            'is_used' => $otp->isUsed(),
            'expires_at' => $otp->getExpiresAt()->format('Y-m-d H:i:s T'),
            'now' => (new \DateTimeImmutable())->format('Y-m-d H:i:s T'),
            'is_expired' => $otp->isExpired(),
        ]);

        if (!$otp->isValid($code)) {
            $this->logger?->error('OTP verify: invalid', [
                'codes_match' => $otp->getCode() === $code,
                'is_expired' => $otp->isExpired(),
                'is_used' => $otp->isUsed(),
            ]);
            return false;
        }

        $otp->markUsed();
        $this->em->flush();
        return true;
    }

    public function isEnforced(): bool
    {
        return $this->settings->getBool('2fa.enabled', false);
    }

    private function sendOtpEmail(User $user, string $code, int $ttlMinutes): void
    {
        $apiKey = $_ENV['ZEPTOMAIL_API_KEY'] ?? '';
        if (empty($apiKey)) {
            $this->logger?->warning('ZEPTOMAIL_API_KEY not set, skipping OTP email');
            return;
        }

        $email = $user->getEmail();
        if (empty($email)) {
            $this->logger?->warning('User has no email, skipping OTP', ['user_id' => $user->getId()]);
            return;
        }

        $fromEmail = $_ENV['ZEPTOMAIL_FROM_EMAIL'] ?? 'noreply@dostsuite.com';
        $fromName = $_ENV['ZEPTOMAIL_FROM_NAME'] ?? 'CreditX';

        $htmlBody = $this->buildOtpEmailHtml($user->getFullName(), $code, $ttlMinutes);

        $payload = [
            'from' => ['address' => $fromEmail, 'name' => $fromName],
            'to' => [['email_address' => ['address' => $email, 'name' => $user->getFullName()]]],
            'subject' => "CreditX - Your verification code is {$code}",
            'htmlbody' => $htmlBody,
        ];

        if (!function_exists('curl_init')) {
            $this->logger?->error('OTP email: curl extension not installed');
            return;
        }

        $this->logger?->info('OTP email: sending to ' . $email, ['code' => $code]);

        $ch = curl_init('https://api.zeptomail.com/v1.1/email');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: ' . $apiKey,
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            $this->logger?->error('OTP email curl failed', ['error' => $curlError]);
            return;
        }

        $this->logger?->info('OTP email response', [
            'http_code' => $httpCode,
            'response' => substr((string)$response, 0, 500),
            'to' => $email,
        ]);

        if ($httpCode >= 400) {
            $this->logger?->error('OTP email API error', [
                'http_code' => $httpCode,
                'response' => substr((string)$response, 0, 500),
            ]);
        }
    }

    private function buildOtpEmailHtml(string $name, string $code, int $ttl): string
    {
        return <<<HTML
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:500px;margin:0 auto;padding:0;background:#f8f9fa">
            <div style="background:linear-gradient(135deg,#0A4F2A 0%,#0d6b3a 100%);padding:32px 24px;text-align:center;border-radius:0 0 24px 24px">
                <h1 style="color:#fff;font-size:28px;margin:0;font-weight:800;letter-spacing:-0.5px">
                    Credit<span style="color:#C9A227">X</span>
                </h1>
                <p style="color:rgba(255,255,255,0.7);font-size:12px;margin:8px 0 0;text-transform:uppercase;letter-spacing:2px">Loan Management System</p>
            </div>
            <div style="padding:32px 24px">
                <p style="color:#374151;font-size:15px;margin:0 0 8px">Hello <strong>{$name}</strong>,</p>
                <p style="color:#6b7280;font-size:14px;margin:0 0 24px;line-height:1.5">Use the verification code below to complete your sign in. This code is valid for <strong>{$ttl} minutes</strong>.</p>
                <div style="background:#fff;border:2px solid #e5e7eb;border-radius:16px;padding:24px;text-align:center;margin:0 0 24px">
                    <div style="font-size:36px;font-weight:800;letter-spacing:12px;color:#0A4F2A;font-family:'Courier New',monospace">{$code}</div>
                </div>
                <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0 0 24px">If you didn't request this code, please ignore this email or contact your administrator.</p>
                <div style="border-top:1px solid #e5e7eb;padding-top:16px;text-align:center">
                    <p style="color:#9ca3af;font-size:11px;margin:0">&copy; 2026 Kodek Innovations Limited</p>
                </div>
            </div>
        </div>
        HTML;
    }
}
