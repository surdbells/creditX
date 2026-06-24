<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Enum\CustomerPortalStatus;
use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, CustomerOtpService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Passwordless login — step 1. Emails a one-time login code to an active
 * portal account. Returns a generic success regardless of account state so
 * the endpoint cannot be used to enumerate registered emails.
 */
final class RequestOtpAction
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

        if ($customer !== null
            && $customer->isPortalEnabled()
            && $customer->getPortalStatus() === CustomerPortalStatus::ACTIVE
        ) {
            $this->otpService->generateAndSend($email, $customer->getFullName(), 'login');
        }

        return $this->success(null, 'If an account exists for this email, a login code has been sent.');
    }
}
