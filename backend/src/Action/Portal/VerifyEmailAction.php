<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, CustomerOtpService, InputValidator, JwtService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Confirm a registration code, activate the portal account, and sign the
 * customer in immediately (tokens issued on success).
 */
final class VerifyEmailAction
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
        if ($customer === null || $customer->getPasswordHash() === null) {
            return $this->error('No pending registration found for this email.', 404);
        }

        if (!$this->otpService->verify($clean['email'], $clean['code'], 'verify')) {
            return $this->error('Invalid or expired verification code.', 400);
        }

        $customer->markEmailVerified();
        $customer->recordPortalLogin($this->clientIp($request));
        $this->customerRepo->flush();

        return $this->success([
            'customer' => $customer->toArray(),
            'tokens'   => $this->issuePortalTokens($this->jwtService, $customer),
        ], 'Email verified. Welcome to CreditX.');
    }
}
