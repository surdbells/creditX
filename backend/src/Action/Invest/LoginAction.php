<?php

declare(strict_types=1);

namespace App\Action\Invest;

use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, CustomerOtpService, InputValidator, JwtService, OtpService, PasswordService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/invest/auth/login — password sign-in for investors who have one.
 *
 * Investors are onboarded by staff and normally sign in with an emailed code
 * (request-otp / verify-otp). This path exists for those who also hold a
 * customer-portal password: the same credential works, but the token issued is
 * scope='investor' and only reaches investor endpoints.
 *
 * When 2FA is enforced for customer-facing apps, a correct password issues NO
 * tokens — it emails a code, and the client finishes at
 * /api/invest/auth/verify-otp.
 */
final class LoginAction
{
    use ApiResponse;
    use IssuesInvestorTokens;

    public function __construct(
        private readonly CustomerRepository $customerRepo,
        private readonly JwtService $jwtService,
        private readonly CustomerOtpService $customerOtp,
        // Consulted for its per-app 2FA policy only. Investors are customer-
        // facing, so they follow the same 'portal' policy rather than
        // introducing a fourth toggle operators would have to discover.
        private readonly OtpService $otpPolicy,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'email'    => ['required' => true, 'type' => 'email'],
            'password' => ['required' => true, 'type' => 'string', 'min' => 1],
        ]);
        if (!empty($v['errors'])) {
            return $this->validationError($v['errors']);
        }

        $clean = $v['clean'];
        $customer = $this->customerRepo->findByEmail($clean['email']);

        if ($customer === null
            || $customer->getPasswordHash() === null
            || !PasswordService::verify($clean['password'], $customer->getPasswordHash())
        ) {
            return $this->error('Invalid email or password.', 401);
        }

        // Correct credentials, but not an investor with us. Deliberately the
        // same message as a bad password: a loan customer probing this endpoint
        // learns nothing about who holds investments.
        if (!$this->canSignIn($customer)) {
            return $this->error('Invalid email or password.', 401);
        }

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
            'investor' => $customer->toArray(),
            'tokens'   => $this->issueInvestorTokens($this->jwtService, $customer),
        ], 'Signed in.');
    }
}
