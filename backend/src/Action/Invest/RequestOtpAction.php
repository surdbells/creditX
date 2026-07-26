<?php

declare(strict_types=1);

namespace App\Action\Invest;

use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, CustomerOtpService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/invest/auth/request-otp — investor sign-in, step 1.
 *
 * Investor accounts are created by staff, not self-registered, so the primary
 * sign-in path is passwordless: we email a one-time code to a flagged investor.
 *
 * Returns the same generic message whatever the account state, so the endpoint
 * cannot be used to discover who is an investor with us.
 */
final class RequestOtpAction
{
    use ApiResponse;
    use IssuesInvestorTokens;

    public function __construct(
        private readonly CustomerRepository $customerRepo,
        private readonly CustomerOtpService $otpService,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, ['email' => ['required' => true, 'type' => 'email']]);
        if (!empty($v['errors'])) {
            return $this->validationError($v['errors']);
        }

        $email = $v['clean']['email'];
        $customer = $this->customerRepo->findByEmail($email);

        if ($this->canSignIn($customer)) {
            $this->otpService->generateAndSend($email, $customer->getFullName(), 'login');
        }

        return $this->success(null, 'If an investment account exists for this email, a sign-in code has been sent.');
    }
}
