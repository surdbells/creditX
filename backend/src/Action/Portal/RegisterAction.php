<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Entity\Customer;
use App\Domain\Enum\CustomerPortalStatus;
use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, CustomerOtpService, InputValidator, PasswordService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Customer self-registration for the portal.
 *
 * Two cases are handled:
 *  - A brand-new customer: a Customer row is created with portal credentials.
 *  - An existing agent-captured customer (same email) who has never enabled
 *    the portal: portal credentials are attached to that existing record so
 *    their history (loans, etc.) stays linked to one customer.
 *
 * In both cases the account starts PENDING and a verification code is emailed.
 * Tokens are NOT issued here — the customer must verify their email first.
 *
 * To avoid leaking which emails already have an active portal account, an
 * already-registered+enabled email returns a generic conflict message.
 */
final class RegisterAction
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
            'full_name' => ['required' => true, 'type' => 'string', 'min' => 2, 'max' => 200],
            'email'     => ['required' => true, 'type' => 'email'],
            'phone'     => ['required' => true, 'type' => 'string', 'min' => 7, 'max' => 30],
            'password'  => ['required' => true, 'type' => 'string', 'min' => 8, 'max' => 72],
        ]);

        if (!empty($validation['errors'])) {
            return $this->validationError($validation['errors']);
        }

        $clean = $validation['clean'];

        $passwordErrors = PasswordService::validate($clean['password']);
        if (!empty($passwordErrors)) {
            return $this->validationError(['password' => $passwordErrors[0]]);
        }

        $existing = $this->customerRepo->findByEmail($clean['email']);

        if ($existing !== null && $existing->isPortalEnabled()) {
            return $this->error('An account with this email already exists. Please sign in instead.', 409);
        }

        $customer = $existing ?? new Customer();
        if ($existing === null) {
            $customer->setFullName($clean['full_name']);
            $customer->setEmail($clean['email']);
            $customer->setPhone($clean['phone']);
        }

        $customer->setPasswordHash(PasswordService::hash($clean['password']));
        $customer->setPortalStatus(CustomerPortalStatus::PENDING);
        // Portal access stays disabled until the email is verified.
        $customer->setIsPortalEnabled(false);

        $this->customerRepo->save($customer);

        $this->otpService->generateAndSend($clean['email'], $customer->getFullName(), 'verify');

        return $this->created([
            'email' => $clean['email'],
        ], 'Registration successful. A verification code has been sent to your email.');
    }
}
