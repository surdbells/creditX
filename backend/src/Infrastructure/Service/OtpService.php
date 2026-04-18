<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\{OtpToken, User};
use Doctrine\ORM\EntityManagerInterface;

final class OtpService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly SettingsCacheService $settings,
    ) {}

    /**
     * Generate OTP and send via email.
     */
    public function generateAndSend(User $user, string $purpose = 'login'): OtpToken
    {
        // Invalidate any existing unused OTPs for this user+purpose
        $existing = $this->em->getRepository(OtpToken::class)->findBy([
            'user' => $user, 'purpose' => $purpose, 'used' => false,
        ]);
        foreach ($existing as $old) { $old->markUsed(); }

        $ttl = (int) ($this->settings->get('2fa.otp_ttl_minutes', '10'));
        $otp = OtpToken::create($user, $purpose, $ttl);
        $this->em->persist($otp);
        $this->em->flush();

        // Send OTP email via ZeptoMail
        $this->sendOtpEmail($user, $otp->getCode(), $ttl);

        return $otp;
    }

    /**
     * Verify OTP code.
     */
    public function verify(User $user, string $code, string $purpose = 'login'): bool
    {
        $otp = $this->em->getRepository(OtpToken::class)->findOneBy([
            'user' => $user, 'purpose' => $purpose, 'used' => false,
        ], ['createdAt' => 'DESC']);

        if (!$otp || !$otp->isValid($code)) return false;

        $otp->markUsed();
        $this->em->flush();
        return true;
    }

    /**
     * Check if 2FA is enforced.
     */
    public function isEnforced(): bool
    {
        return $this->settings->getBool('2fa.enabled', false);
    }

    /**
     * Send OTP email via ZeptoMail API.
     */
    private function sendOtpEmail(User $user, string $code, int $ttlMinutes): void
    {
        $apiKey = $_ENV['ZEPTOMAIL_API_KEY'] ?? '';
        if (empty($apiKey)) return;

        $fromEmail = $_ENV['ZEPTOMAIL_FROM_EMAIL'] ?? 'noreply@dostsuite.com';
        $fromName = $_ENV['ZEPTOMAIL_FROM_NAME'] ?? 'CreditX';

        $htmlBody = "
        <div style='font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px'>
            <div style='text-align:center;margin-bottom:24px'>
                <h1 style='color:#0A4F2A;font-size:24px;margin:0'>Credit<span style='color:#C9A227'>X</span></h1>
            </div>
            <div style='background:#f8f9fa;border-radius:12px;padding:32px;text-align:center'>
                <h2 style='color:#1a1a2e;font-size:18px;margin:0 0 8px'>Verification Code</h2>
                <p style='color:#64748b;font-size:14px;margin:0 0 24px'>Enter this code to complete your sign in</p>
                <div style='background:#0A4F2A;color:#fff;font-size:32px;letter-spacing:8px;padding:16px 24px;border-radius:12px;display:inline-block;font-weight:bold'>{$code}</div>
                <p style='color:#94a3b8;font-size:12px;margin-top:24px'>This code expires in {$ttlMinutes} minutes</p>
            </div>
            <p style='color:#94a3b8;font-size:11px;text-align:center;margin-top:16px'>If you didn't request this, please ignore this email.</p>
        </div>";

        $payload = [
            'from' => ['address' => $fromEmail, 'name' => $fromName],
            'to' => [['email_address' => ['address' => $user->getEmail(), 'name' => $user->getFullName()]]],
            'subject' => "CreditX - Your verification code is {$code}",
            'htmlbody' => $htmlBody,
        ];

        $ch = curl_init('https://api.zeptomail.com/v1.1/email');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: Zoho-enczapikey ' . $apiKey,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => 10,
        ]);
        curl_exec($ch);
        curl_close($ch);
    }
}
