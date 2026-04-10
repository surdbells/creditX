<?php
declare(strict_types=1);
namespace App\Action\Customer;

use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateCustomerAction
{
    use ApiResponse;
    public function __construct(
        private readonly CustomerRepository $repo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $customer = $this->repo->find($args['id'] ?? '');
        if ($customer === null) return $this->notFound('Customer not found');

        $old = $customer->toArray();
        $data = (array) ($request->getParsedBody() ?? []);

        // Staff ID uniqueness check
        if (isset($data['staff_id']) && trim($data['staff_id']) !== '' && $data['staff_id'] !== $customer->getStaffId()) {
            if ($this->repo->staffIdExists($data['staff_id'], $customer->getId())) {
                return $this->validationError(['staff_id' => 'Staff ID already in use']);
            }
        }

        $customer->fillFromArray($data);
        $this->repo->flush();

        $this->audit->logUpdate($request->getAttribute('user_id'), 'Customer', $customer->getId(), $old, $customer->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($customer->toArray(true), 'Customer updated successfully');
    }
}
