<?php
declare(strict_types=1);
namespace App\Action\Customer;

use App\Domain\Entity\NextOfKin;
use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateCustomerAction
{
    use ApiResponse;
    public function __construct(
        private readonly CustomerRepository $repo,
        private readonly AuditService $audit,
        private readonly EntityManagerInterface $em,
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

        // Handle next_of_kins — replace all
        $nokArray = $data['next_of_kins'] ?? $data['next_of_kin'] ?? null;
        if (is_array($nokArray)) {
            // Remove existing NOKs (orphanRemoval will delete them)
            foreach ($customer->getNextOfKins()->toArray() as $old_nok) {
                $customer->removeNextOfKin($old_nok);
            }
            // Add new NOKs
            foreach ($nokArray as $nokData) {
                if (empty($nokData['full_name'])) continue;
                $nok = new NextOfKin();
                $nok->setCustomer($customer);
                $nok->setFullName($nokData['full_name']);
                $nok->setPhone($nokData['phone'] ?? null);
                $nok->setRelationship($nokData['relationship'] ?? null);
                $nok->setAddress($nokData['address'] ?? null);
                $customer->addNextOfKin($nok);
            }
        }

        $this->em->flush();

        $this->audit->logUpdate($request->getAttribute('user_id'), 'Customer', $customer->getId(), $old, $customer->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($customer->toArray(true), 'Customer updated successfully');
    }
}
