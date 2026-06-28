<?php
declare(strict_types=1);
namespace App\Action\Customer;

use App\Domain\Entity\Customer;
use App\Domain\Enum\CustomerPortalStatus;
use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Two-level approval of self-service portal registrations:
 *   GET  /api/customers/registrations/pending
 *   POST /api/customers/{id}/registration/approve   { comment? }
 *   POST /api/customers/{id}/registration/reject     { reason? }
 *
 * The first approve records level-1; a second approve by a DIFFERENT staff
 * user activates the account (verified + portal enabled). Gated by
 * customers.edit.
 */
final class RegistrationApprovalAction
{
    use ApiResponse;

    public function __construct(
        private readonly CustomerRepository $customerRepo,
        private readonly EntityManagerInterface $em,
        private readonly AuditService $audit,
    ) {}

    public function pending(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $rows = $this->em->createQueryBuilder()
            ->select('c')->from(Customer::class, 'c')
            ->where('c.portalStatus = :s')->setParameter('s', CustomerPortalStatus::AWAITING_APPROVAL)
            ->orderBy('c.updatedAt', 'DESC')
            ->setMaxResults(200)
            ->getQuery()->getResult();

        return $this->success([
            'registrations' => array_map(fn(Customer $c) => [
                'id'               => $c->getId(),
                'full_name'        => $c->getFullName(),
                'email'            => $c->getEmail(),
                'phone'            => $c->getPhone(),
                'email_verified_at'=> $c->getEmailVerifiedAt()?->format('Y-m-d H:i:s'),
                'reg_approver1_id' => $c->getRegApprover1Id(),
                'approvals'        => $c->getRegApprover1Id() !== null ? 1 : 0,
            ], $rows),
        ]);
    }

    public function approve(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();

        $customer = $this->customerRepo->find($args['id'] ?? '');
        if ($customer === null) return $this->notFound('Customer not found');
        if ($customer->getPortalStatus() !== CustomerPortalStatus::AWAITING_APPROVAL) {
            return $this->error('This registration is not awaiting approval.', 400);
        }

        try {
            $outcome = $customer->approveRegistration((string) $userId);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        $this->customerRepo->flush();

        $this->audit->logUpdate($userId, 'CustomerRegistration', $customer->getId(), [], ['outcome' => $outcome], $this->getClientIp($request), $this->getUserAgent($request));

        return $this->success(
            ['id' => $customer->getId(), 'outcome' => $outcome, 'portal_status' => $customer->getPortalStatus()?->value],
            $outcome === 'approved' ? 'Registration fully approved — account activated' : 'First approval recorded — one more approval needed',
        );
    }

    public function reject(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();

        $customer = $this->customerRepo->find($args['id'] ?? '');
        if ($customer === null) return $this->notFound('Customer not found');
        if ($customer->getPortalStatus() !== CustomerPortalStatus::AWAITING_APPROVAL) {
            return $this->error('This registration is not awaiting approval.', 400);
        }

        $reason = (string) (((array) ($request->getParsedBody() ?? []))['reason'] ?? '');
        $customer->rejectRegistration((string) $userId, $reason !== '' ? $reason : null);
        $this->customerRepo->flush();

        $this->audit->logUpdate($userId, 'CustomerRegistration', $customer->getId(), [], ['rejected' => true, 'reason' => $reason], $this->getClientIp($request), $this->getUserAgent($request));

        return $this->success(['id' => $customer->getId()], 'Registration rejected');
    }
}
