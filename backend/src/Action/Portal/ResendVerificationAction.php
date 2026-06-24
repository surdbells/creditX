<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, CustomerOtpService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Re-send the email-verification code for a pending registration.
 *
 * Always returns a generic success regardless of whether the email exists or
 * is already verified, so the endpoint cannot be used to enumerate accounts.
 * The OTP service enforces its own resend cooldown.
 */
final class ResendVerificationAction
{
    use ApiResponse;

    public function __construct(
        private readonly CustomerRepository $customerRepo,
        private readonly CustomerOtpService $otpService,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);

        $validation = InputValidator::validate($data, [
            'email' => ['required' => true, 'type' => 'email'],
        ]);

        if (!empty($validation['errors'])) {
            return $this->validationError($validation['errors']);
        }

        $email = $validation['clean']['email'];
        $customer = $this->customerRepo->findByEmail($email);

        if ($customer !== null && $customer->getPasswordHash() !== null && !$customer->isEmailVerified()) {
            $this->otpService->generateAndSend($email, $customer->getFullName(), 'verify');
        }

        return $this->success(null, 'If an unverified account exists for this email, a new code has been sent.');
    }
}
