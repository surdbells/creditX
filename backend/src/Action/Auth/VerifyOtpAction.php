<?php
declare(strict_types=1);
namespace App\Action\Auth;

use App\Domain\Enum\{UserStatus, AuditAction};
use App\Domain\Repository\UserRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, JwtService, OtpService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class VerifyOtpAction
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
        $userId = $data['user_id'] ?? '';
        $code = $data['code'] ?? '';

        if (empty($userId) || empty($code)) {
            return $this->validationError(['code' => 'User ID and OTP code are required']);
        }

        $user = $this->userRepo->find($userId);
        if (!$user) return $this->error('User not found', 404);
        if ($user->getStatus() !== UserStatus::ACTIVE) return $this->error('Account not active', 403);

        if (!$this->otpService->verify($user, $code, 'login')) {
            return $this->error('Invalid or expired verification code', 401);
        }

        // OTP verified — issue tokens
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
            null, ['2fa' => true], $ip, $this->getUserAgent($request)
        );

        return $this->success([
            'user'   => $user->toArray(true),
            'tokens' => $tokens,
        ], 'Login successful');
    }
}
