<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Enum\CustomerPortalStatus;
use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, CustomerOtpService, InputValidator, JwtService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Passwordless login — step 2. Verifies the emailed login code and issues
 * tokens. Only ACTIVE, portal-enabled accounts can complete this flow.
 */
final class VerifyOtpLoginAction
{
    use ApiResponse;
    use IssuesPortalTokens;

    public function __construct(
        private readonly CustomerRepository $customerRepo,
        private readonly CustomerOtpService $otpService,
        private readonly JwtService $jwtService,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);

        $validation = InputValidator::validate($data, [
            'email' => ['required' => true, 'type' => 'email'],
            'code'  => ['required' => true, 'type' => 'string', 'min' => 6, 'max' => 6],
        ]);

        if (!empty($validation['errors'])) {
            return $this->validationError($validation['errors']);
        }

        $clean = $validation['clean'];
        $customer = $this->customerRepo->findByEmail($clean['email']);

        if ($customer === null
            || !$customer->isPortalEnabled()
            || $customer->getPortalStatus() !== CustomerPortalStatus::ACTIVE
        ) {
            return $this->error('Invalid or expired login code.', 400);
        }

        if (!$this->otpService->verify($clean['email'], $clean['code'], 'login')) {
            return $this->error('Invalid or expired login code.', 400);
        }

        $customer->recordPortalLogin($this->clientIp($request));
        $this->customerRepo->flush();

        return $this->success([
            'customer' => $customer->toArray(),
            'tokens'   => $this->issuePortalTokens($this->jwtService, $customer),
        ], 'Login successful.');
    }
}
