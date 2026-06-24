<?php

declare(strict_types=1);

namespace App\Action\Portal;

use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Let a customer update a limited set of their own contact / personal fields
 * from the portal. Identity and KYC fields (BVN, NIN, staff_id, insider flags,
 * banking) are intentionally NOT editable here — those are managed by staff.
 */
final class UpdateProfileAction
{
    use ApiResponse;

    /** Fields a customer is permitted to self-edit via the portal. */
    private const EDITABLE = [
        'phone', 'alt_phone', 'home_address', 'permanent_address',
        'state_of_origin', 'lga', 'hometown', 'marital_status', 'gender',
    ];

    public function __construct(
        private readonly CustomerRepository $customerRepo,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $customerId = (string) $request->getAttribute('customer_id');
        $customer = $this->customerRepo->find($customerId);

        if ($customer === null) {
            return $this->notFound('Account not found');
        }

        $data = (array) ($request->getParsedBody() ?? []);

        $validation = InputValidator::validate($data, [
            'phone'      => ['type' => 'string', 'min' => 7, 'max' => 30],
            'alt_phone'  => ['type' => 'string', 'min' => 7, 'max' => 30],
        ]);

        if (!empty($validation['errors'])) {
            return $this->validationError($validation['errors']);
        }

        // Only forward whitelisted keys to the entity's fillFromArray.
        $allowed = array_intersect_key($data, array_flip(self::EDITABLE));
        if (!empty($allowed)) {
            $customer->fillFromArray($allowed);
            $this->customerRepo->flush();
        }

        return $this->success($customer->toArray(), 'Profile updated');
    }
}
