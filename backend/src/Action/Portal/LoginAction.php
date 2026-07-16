<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Enum\CustomerPortalStatus;
use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, CustomerOtpService, InputValidator, JwtService, OtpService, PasswordService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Password login for the customer portal. Passwordless email-OTP login is
 * handled separately (RequestOtp + VerifyOtpLogin); this is the classic
 * email + password path.
 *
 * When 2FA is enforced for the portal (2fa.portal_enabled) a correct password
 * does NOT issue tokens — it emails a code and returns requires_2fa. The client
 * then completes login through the existing /portal/auth/verify-otp endpoint,
 * which is the same verification the passwordless flow uses.
 */
final class LoginAction
{
    use ApiResponse;
    use IssuesPortalTokens;

    public function __construct(
        private readonly CustomerRepository $customerRepo,
        private readonly JwtService $jwtService,
        private readonly CustomerOtpService $customerOtp,
        // Injected for its per-app 2FA policy only (isEnforced); the staff OTP
        // send/verify methods are not used here.
        private readonly OtpService $otpPolicy,
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

        // 2FA — password verified, but the portal requires a second factor.
        // Issue no tokens; the client finishes at /portal/auth/verify-otp.
        if ($this->otpPolicy->isEnforced('portal')) {
            $this->customerOtp->generateAndSend($customer->getEmail(), $customer->getFullName(), 'login');

            return $this->success([
                'requires_2fa' => true,
                'email'        => $customer->getEmail(),
            ], 'Verification code sent to your email.');
        }

        $customer->recordPortalLogin($this->clientIp($request));
        $this->customerRepo->flush();

        return $this->success([
            'customer' => $customer->toArray(),
            'tokens'   => $this->issuePortalTokens($this->jwtService, $customer),
        ], 'Login successful.');
    }
}
