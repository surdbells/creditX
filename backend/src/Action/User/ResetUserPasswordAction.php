<?php
declare(strict_types=1);
namespace App\Action\User;

use App\Domain\Entity\User;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ResetUserPasswordAction
{
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $user = $this->em->find(User::class, $args['id'] ?? '');
        if (!$user) return $this->notFound('User not found');

        // Generate random password
        $chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $newPassword = '';
        for ($i = 0; $i < 10; $i++) $newPassword .= $chars[random_int(0, strlen($chars) - 1)];
        $newPassword .= '!@#'[random_int(0, 2)] . random_int(10, 99);

        $user->setPasswordHash(password_hash($newPassword, PASSWORD_BCRYPT));
        $this->em->flush();

        return $this->success([
            'password' => $newPassword,
            'user_name' => $user->getFullName(),
            'email' => $user->getEmail(),
        ], 'Password reset successfully');
    }
}
