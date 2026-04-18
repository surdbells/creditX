<?php
declare(strict_types=1);
namespace App\Action\Auth;

use App\Domain\Enum\{UserStatus, AuditAction};
use App\Domain\Repository\UserRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator, JwtService, PasswordService, OtpService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class LoginAction
{
    use ApiResponse;

    public function __construct(
        private readonly UserRepository $userRepo,
        private readonly JwtService $jwtService,
        private readonly AuditService $auditService,
        private readonly OtpService $otpService,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);

        $validation = InputValidator::validate($data, [
            'email'    => ['required' => true, 'type' => 'email'],
            'password' => ['required' => true, 'type' => 'string', 'min' => 1],
        ]);

        if (!empty($validation['errors'])) return $this->validationError($validation['errors']);

        $user = $this->userRepo->findByEmail($validation['clean']['email']);

        if ($user === null || !PasswordService::verify($validation['clean']['password'], $user->getPasswordHash())) {
            return $this->error('Invalid email or password', 401);
        }

        if ($user->getStatus() !== UserStatus::ACTIVE) {
            return $this->error('Your account is ' . $user->getStatus()->value . '. Contact administrator.', 403);
        }

        // Check if 2FA is enforced
        if ($this->otpService->isEnforced()) {
            // Generate and send OTP
            $this->otpService->generateAndSend($user, 'login');

            return $this->success([
                'requires_2fa' => true,
                'email' => $user->getEmail(),
                'user_id' => $user->getId(),
            ], 'Verification code sent to your email');
        }

        // No 2FA — issue tokens directly
        return $this->issueTokens($user, $request);
    }

    private function issueTokens($user, ServerRequestInterface $request): ResponseInterface
    {
        $roles = $user->getRoles()->map(fn($r) => $r->getSlug())->toArray();
        $permissions = $user->getAllPermissionSlugs();

        $tokens = $this->jwtService->issueTokens(
            $user->getId(), $user->getEmail(), array_values($roles), $permissions,
        );

        $ip = $this->getClientIp($request);
        $user->recordLogin($ip);
        $this->userRepo->flush();

        $this->auditService->log(
            $user->getId(), 'User', $user->getId(), AuditAction::LOGIN,
            null, null, $ip, $this->getUserAgent($request)
        );

        return $this->success([
            'user'   => $user->toArray(true),
            'tokens' => $tokens,
        ], 'Login successful');
    }
}
