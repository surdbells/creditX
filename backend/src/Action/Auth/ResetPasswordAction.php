<?php
declare(strict_types=1);
namespace App\Action\Auth;

use App\Domain\Repository\UserRepository;
use App\Infrastructure\Service\{ApiResponse, InputValidator};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ResetPasswordAction
{
    use ApiResponse;
    public function __construct(private readonly UserRepository $userRepo, private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $token = trim($data['token'] ?? '');
        $password = $data['password'] ?? '';

        if ($token === '') return $this->validationError(['token' => 'Reset token is required']);
        if (strlen($password) < 8) return $this->validationError(['password' => 'Password must be at least 8 characters']);

        $user = $this->userRepo->findByResetToken($token);
        if ($user === null) return $this->error('Invalid or expired reset token', 400);

        // Check expiry
        $expiresAt = $user->getResetTokenExpiresAt();
        if ($expiresAt && new \DateTimeImmutable() > new \DateTimeImmutable($expiresAt)) {
            return $this->error('Reset token has expired', 400);
        }

        $user->setPasswordHash(password_hash($password, PASSWORD_BCRYPT));
        $user->setResetToken(null);
        $user->setResetTokenExpiresAt(null);
        $this->em->flush();

        return $this->success(null, 'Password reset successfully');
    }
}
