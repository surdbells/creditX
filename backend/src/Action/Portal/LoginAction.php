<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Enum\CustomerPortalStatus;
use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, InputValidator, JwtService, PasswordService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Password login for the customer portal. Passwordless email-OTP login is
 * handled separately (RequestOtp + VerifyOtpLogin); this is the classic
 * email + password path.
 */
final class LoginAction
{
    use ApiResponse;
    use IssuesPortalTokens;

    public function __construct(
        private readonly CustomerRepository $customerRepo,
        private readonly JwtService $jwtService,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);

        $validation = InputValidator::validate($data, [
            'email'    => ['required' => true, 'type' => 'email'],
            'password' => ['required' => true, 'type' => 'string', 'min' => 1],
        ]);

        if (!empty($validation['errors'])) {
            return $this->validationError($validation['errors']);
        }

        $clean = $validation['clean'];
        $customer = $this->customerRepo->findByEmail($clean['email']);

        if ($customer === null
            || $customer->getPasswordHash() === null
            || !PasswordService::verify($clean['password'], $customer->getPasswordHash())
        ) {
            return $this->error('Invalid email or password.', 401);
        }

        if (!$customer->isEmailVerified() || $customer->getPortalStatus() === CustomerPortalStatus::PENDING) {
            return $this->error('Please verify your email before signing in.', 403, ['requires_verification' => true]);
        }

        if ($customer->getPortalStatus() === CustomerPortalStatus::AWAITING_APPROVAL) {
            return $this->error('Your account is awaiting staff approval. You will be notified once it is activated.', 403, ['awaiting_approval' => true]);
        }

        if ($customer->getPortalStatus() === CustomerPortalStatus::REJECTED) {
            return $this->error('Your registration was not approved. Please contact support.', 403);
        }

        if ($customer->getPortalStatus() === CustomerPortalStatus::SUSPENDED || !$customer->isPortalEnabled()) {
            return $this->error('Your account access has been suspended. Please contact support.', 403);
        }

        $customer->recordPortalLogin($this->clientIp($request));
        $this->customerRepo->flush();

        return $this->success([
            'customer' => $customer->toArray(),
            'tokens'   => $this->issuePortalTokens($this->jwtService, $customer),
        ], 'Login successful.');
    }
}
