<?php
declare(strict_types=1);
namespace App\Action\User;

use App\Domain\Entity\User;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};
use Psr\Log\LoggerInterface;

/**
 * POST /api/users/{id}/reset-password
 *
 * Admin-initiated password reset. Generates a new random password,
 * saves the bcrypt hash on the user, and emails the new password to
 * the user's registered email address via ZeptoMail.
 *
 * Response also includes the plain password so the admin can read it
 * out over the phone / show it to the user in person — email is the
 * canonical delivery channel but the admin UI shouldn't be the ONLY
 * way the user learns their new credential if email fails or is slow.
 *
 * Security notes:
 *   - The new password is bcrypt-hashed before persistence (standard).
 *   - The plain value only lives in the response + email body.
 *   - We never log the password itself; log only metadata (user id,
 *     email address, whether email delivery succeeded).
 *   - If ZEPTOMAIL_API_KEY isn't configured (dev), we skip the send
 *     silently but still return the password so the reset still works.
 */
final class ResetUserPasswordAction
{
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly ?LoggerInterface $logger = null,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->em->find(User::class, $args['id'] ?? '');
        if (!$user) return $this->notFound('User not found');

        // Generate a random password. Character set excludes visually
        // ambiguous chars (0/O, 1/l/I) to make phone readout less error-
        // prone. 10 alphanumeric + 1 special + 2 digits = 13 chars total.
        $chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $newPassword = '';
        for ($i = 0; $i < 10; $i++) {
            $newPassword .= $chars[random_int(0, strlen($chars) - 1)];
        }
        $newPassword .= '!@#'[random_int(0, 2)] . random_int(10, 99);

        $user->setPasswordHash(password_hash($newPassword, PASSWORD_BCRYPT));
        $this->em->flush();

        // Attempt to send the email. Non-fatal: if it fails, the admin
        // still gets the password in the response and can deliver it
        // some other way. We log delivery status either way.
        $emailSent = $this->sendResetEmail($user, $newPassword);

        return $this->success([
            'password' => $newPassword,
            'user_name' => $user->getFullName(),
            'email' => $user->getEmail(),
            'email_sent' => $emailSent,
        ], $emailSent
            ? 'Password reset and emailed to user'
            : 'Password reset successfully (email delivery unavailable)');
    }

    /**
     * Send the new password to the user via ZeptoMail. Returns true on
     * successful HTTP 2xx from ZeptoMail, false otherwise (including
     * the "API key not configured" case).
     */
    private function sendResetEmail(User $user, string $newPassword): bool
    {
        $apiKey = $_ENV['ZEPTOMAIL_API_KEY'] ?? '';
        $email = $user->getEmail();
        $firstName = $user->getFirstName();

        if ($apiKey === '' || $email === '') {
            $this->logger?->info('Password reset email skipped (no API key or no recipient)', [
                'user_id' => $user->getId(),
                'has_api_key' => $apiKey !== '',
                'has_email' => $email !== '',
            ]);
            return false;
        }

        $fromEmail = $_ENV['ZEPTOMAIL_FROM_EMAIL'] ?? 'noreply@dostsuite.com';
        $fromName = $_ENV['ZEPTOMAIL_FROM_NAME'] ?? 'CreditX';

        $subject = 'CreditX — Your password was reset';
        $htmlBody = $this->buildEmailHtml($firstName, $newPassword);
        $textBody = $this->buildEmailText($firstName, $newPassword);

        $payload = [
            'from' => ['address' => $fromEmail, 'name' => $fromName],
            'to' => [['email_address' => ['address' => $email, 'name' => $user->getFullName()]]],
            'subject' => $subject,
            'htmlbody' => $htmlBody,
            'textbody' => $textBody,
        ];

        $ch = curl_init('https://api.zeptomail.com/v1.1/email');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Zoho-enczapikey ' . $apiKey,
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        $success = is_int($httpCode) && $httpCode >= 200 && $httpCode < 300;

        if ($success) {
            $this->logger?->info('Password reset email sent', [
                'user_id' => $user->getId(),
                'email' => $email,
                'http_code' => $httpCode,
            ]);
        } else {
            $this->logger?->warning('Password reset email failed', [
                'user_id' => $user->getId(),
                'email' => $email,
                'http_code' => $httpCode,
                'curl_error' => $curlError,
                // Response body can help debug ZeptoMail errors (invalid
                // API key, unverified sender domain, etc.) Never log the
                // password itself — neither plain nor hashed.
                'response' => is_string($response) ? substr($response, 0, 500) : null,
            ]);
        }

        return $success;
    }

    private function buildEmailHtml(string $firstName, string $newPassword): string
    {
        $firstName = htmlspecialchars($firstName, ENT_QUOTES, 'UTF-8');
        $pw = htmlspecialchars($newPassword, ENT_QUOTES, 'UTF-8');
        $year = date('Y');

        return <<<HTML
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#f8f9fa">
  <div style="background:linear-gradient(135deg,#0A4F2A 0%,#0d6b3a 100%);padding:24px;text-align:center;border-radius:0 0 20px 20px">
    <h1 style="color:#fff;font-size:24px;margin:0;font-weight:800">Credit<span style="color:#C9A227">X</span></h1>
    <p style="color:rgba(255,255,255,0.65);font-size:11px;margin:6px 0 0;text-transform:uppercase;letter-spacing:2px">Loan Management System</p>
  </div>
  <div style="padding:28px 24px">
    <h2 style="color:#1a1a2e;font-size:16px;margin:0 0 12px;font-weight:700">Your password was reset</h2>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px">Hi {$firstName},</p>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px">Your CreditX password has been reset by an administrator. Use the credentials below to sign in:</p>
    <div style="background:#0A4F2A08;border:1px solid #0A4F2A22;border-radius:8px;padding:14px 16px;margin:16px 0;text-align:center">
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">New Password</div>
      <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:18px;font-weight:700;color:#0A4F2A;letter-spacing:1px">{$pw}</div>
    </div>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px">Please change this password after signing in.</p>
  </div>
  <div style="padding:16px 24px;border-top:1px solid #e5e7eb;text-align:center">
    <p style="color:#9ca3af;font-size:11px;margin:0">&copy; {$year} DOST HQ LIMITED &bull; CreditX</p>
  </div>
</div>
HTML;
    }

    private function buildEmailText(string $firstName, string $newPassword): string
    {
        // Plain-text alternative for mail clients that don't render HTML.
        return "Hi {$firstName},\n\n"
             . "Your CreditX password has been reset by an administrator.\n\n"
             . "New password: {$newPassword}\n\n"
             . "Please change this password after signing in.\n\n"
             . "— CreditX";
    }
}
