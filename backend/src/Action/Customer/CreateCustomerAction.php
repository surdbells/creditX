<?php
declare(strict_types=1);
namespace App\Action\Customer;

use App\Domain\Entity\Customer;
use App\Domain\Entity\NextOfKin;
use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateCustomerAction
{
    use ApiResponse;
    public function __construct(
        private readonly CustomerRepository $repo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'staff_id'       => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 50],
            'full_name'      => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 200],
            'phone'          => ['required' => false, 'type' => 'string', 'max' => 30],
            'alt_phone'      => ['required' => false, 'type' => 'string', 'max' => 30],
            'email'          => ['required' => false, 'type' => 'email'],
            'home_address'   => ['required' => false, 'type' => 'string', 'max' => 500],
            'permanent_address' => ['required' => false, 'type' => 'string', 'max' => 500],
            'state_of_origin' => ['required' => false, 'type' => 'string', 'max' => 100],
            'lga'             => ['required' => false, 'type' => 'string', 'max' => 100],
            'hometown'        => ['required' => false, 'type' => 'string', 'max' => 100],
            'mothers_maiden_name' => ['required' => false, 'type' => 'string', 'max' => 100],
            'religion'        => ['required' => false, 'type' => 'string', 'max' => 50],
            'marital_status'  => ['required' => false, 'type' => 'string', 'max' => 20],
            'gender'          => ['required' => false, 'type' => 'string', 'max' => 10],
            'dob'             => ['required' => false, 'type' => 'string'],
            'bvn'             => ['required' => false, 'type' => 'string', 'max' => 20],
            'number_of_children' => ['required' => false, 'type' => 'int', 'min' => 0],
            'bank_name'       => ['required' => false, 'type' => 'string', 'max' => 100],
            'account_number'  => ['required' => false, 'type' => 'string', 'max' => 20],
            'alt_bank_name'   => ['required' => false, 'type' => 'string', 'max' => 100],
            'alt_account_number' => ['required' => false, 'type' => 'string', 'max' => 20],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);

        if ($this->repo->staffIdExists($v['clean']['staff_id'])) {
            return $this->validationError(['staff_id' => 'Customer with this Staff ID already exists']);
        }

        $customer = new Customer();
        $customer->fillFromArray($v['clean']);

        // Handle next_of_kin array
        if (isset($data['next_of_kin']) && is_array($data['next_of_kin'])) {
            foreach ($data['next_of_kin'] as $i => $nokData) {
                if (empty($nokData['full_name'])) continue;
                $nok = new NextOfKin();
                $nok->setCustomer($customer);
                $nok->setFullName($nokData['full_name'] ?? '');
                $nok->setPhone($nokData['phone'] ?? null);
                $nok->setAddress($nokData['address'] ?? null);
                $nok->setRelationship($nokData['relationship'] ?? null);
                $nok->setIsPrimary($i === 0);
                $customer->addNextOfKin($nok);
            }
        }

        $this->repo->save($customer);
        $this->audit->logCreate($request->getAttribute('user_id'), 'Customer', $customer->getId(), $customer->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($customer->toArray(true), 'Customer created successfully');
    }
}
