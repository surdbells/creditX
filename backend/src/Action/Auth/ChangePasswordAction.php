<?php

declare(strict_types=1);

namespace App\Action\Auth;

use App\Domain\Enum\AuditAction;
use App\Domain\Repository\UserRepository;
use App\Infrastructure\Service\ApiResponse;
use App\Infrastructure\Service\AuditService;
use App\Infrastructure\Service\InputValidator;
use App\Infrastructure\Service\PasswordService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class ChangePasswordAction
{
    use ApiResponse;

    public function __construct(
        private readonly UserRepository $userRepo,
        private readonly AuditService $auditService,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        $user = $this->userRepo->find($userId);

        if ($user === null) {
            return $this->notFound('User not found');
        }

        $data = (array) ($request->getParsedBody() ?? []);

        $validation = InputValidator::validate($data, [
            'current_password' => ['required' => true, 'type' => 'string'],
            'new_password'     => ['required' => true, 'type' => 'string', 'min' => 8, 'max' => 72],
            'confirm_password' => ['required' => true, 'type' => 'string'],
        ]);

        if (!empty($validation['errors'])) {
            return $this->validationError($validation['errors']);
        }

        $clean = $validation['clean'];

        // Verify current password
        if (!PasswordService::verify($clean['current_password'], $user->getPasswordHash())) {
            return $this->error('Current password is incorrect', 400);
        }

        // Validate new password strength
        $pwErrors = PasswordService::validate($clean['new_password']);
        if (!empty($pwErrors)) {
            return $this->validationError(['new_password' => implode('. ', $pwErrors)]);
        }

        // Confirm match
        if ($clean['new_password'] !== $clean['confirm_password']) {
            return $this->validationError(['confirm_password' => 'Passwords do not match']);
        }

        $user->setPasswordHash(PasswordService::hash($clean['new_password']));
        $this->userRepo->flush();

        $this->auditService->log(
            $userId, 'User', $userId, AuditAction::UPDATE,
            null, ['field' => 'password'],
            $this->getClientIp($request), $this->getUserAgent($request)
        );

        return $this->success(null, 'Password changed successfully');
    }
}
