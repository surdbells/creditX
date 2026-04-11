<?php
declare(strict_types=1);
namespace App\Action\Auth;

use App\Domain\Repository\UserRepository;
use App\Infrastructure\Service\{ApiResponse, SettingsCacheService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ForgotPasswordAction
{
    use ApiResponse;
    public function __construct(
        private readonly UserRepository $userRepo,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $email = trim($data['email'] ?? '');
        if ($email === '') return $this->validationError(['email' => 'Email is required']);

        $user = $this->userRepo->findByEmail($email);
        // Always return success to prevent email enumeration
        if ($user === null) return $this->success(null, 'If the email exists, a reset link has been sent.');

        // Generate time-limited token (1 hour)
        $token = bin2hex(random_bytes(32));
        $expiresAt = (new \DateTimeImmutable('+1 hour'))->format('Y-m-d H:i:s');
        $user->setResetToken($token);
        $user->setResetTokenExpiresAt($expiresAt);
        $this->em->flush();

        // Send email via ZeptoMail (if configured)
        $resetUrl = ($_ENV['FRONTEND_URL'] ?? 'https://admin.creditx.com') . '/auth/reset-password?token=' . $token;
        $apiKey = $_ENV['ZEPTOMAIL_API_KEY'] ?? '';
        if ($apiKey !== '') {
            $payload = [
                'from' => ['address' => $_ENV['ZEPTOMAIL_FROM_EMAIL'] ?? 'noreply@creditx.com', 'name' => 'CreditX'],
                'to' => [['email_address' => ['address' => $email]]],
                'subject' => 'CreditX — Password Reset Request',
                'htmlbody' => '<html><body><p>Hi ' . htmlspecialchars($user->getFirstName()) . ',</p><p>You requested a password reset. Click the link below to reset your password (valid for 1 hour):</p><p><a href="' . $resetUrl . '">' . $resetUrl . '</a></p><p>If you did not request this, please ignore this email.</p></body></html>',
            ];
            $ch = curl_init('https://api.zeptomail.com/v1.1/email');
            curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($payload), CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Zoho-enczapikey ' . $apiKey], CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15]);
            curl_exec($ch); curl_close($ch);
        }

        return $this->success(null, 'If the email exists, a reset link has been sent.');
    }
}
