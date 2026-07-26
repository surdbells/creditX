<?php

declare(strict_types=1);

namespace App\Action\Invest;

use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, CustomerOtpService, InputValidator, JwtService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/invest/auth/verify-otp — investor sign-in, step 2.
 *
 * Verifies the emailed code and issues scope='investor' tokens. Also completes
 * the password path when 2FA is enforced.
 */
final class VerifyOtpAction
{
    use ApiResponse;
    use IssuesInvestorTokens;

    public function __construct(
        private readonly CustomerRepository $customerRepo,
        private readonly CustomerOtpService $otpService,
        private readonly JwtService $jwtService,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'email' => ['required' => true, 'type' => 'email'],
            'code'  => ['required' => true, 'type' => 'string', 'min' => 6, 'max' => 6],
        ]);
        if (!empty($v['errors'])) {
            return $this->validationError($v['errors']);
        }

        $clean = $v['clean'];
        $customer = $this->customerRepo->findByEmail($clean['email']);

        // Same generic failure whether the account is unknown, not an investor,
        // or the code is wrong — never confirm who holds an investment account.
        if (!$this->canSignIn($customer) || !$this->otpService->verify($clean['email'], $clean['code'], 'login')) {
            return $this->error('Invalid or expired sign-in code.', 400);
        }

        $customer->recordPortalLogin($this->clientIp($request));
        $this->customerRepo->flush();

        return $this->success([
            'investor' => $customer->toArray(),
            'tokens'   => $this->issueInvestorTokens($this->jwtService, $customer),
        ], 'Signed in.');
    }
}
