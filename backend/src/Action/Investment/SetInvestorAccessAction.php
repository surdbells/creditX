<?php
declare(strict_types=1);
namespace App\Action\Investment;

use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * PUT /api/investments/investors/{customerId} — grant or revoke a customer's
 * access to the investor portal.
 *
 * There is no investor self-registration: staff onboard the person, then flip
 * this. Revoking blocks new sign-ins immediately and ends any live session at
 * its next token refresh (RefreshAction re-checks eligibility).
 *
 * Body: is_investor (bool).
 *
 * Gated by investments.transact — granting someone access to see money is a
 * transactional act, not a read.
 */
final class SetInvestorAccessAction
{
    use ApiResponse;

    public function __construct(
        private readonly CustomerRepository $customerRepo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $customer = $this->customerRepo->find($args['customerId'] ?? '');
        if ($customer === null) {
            return $this->notFound('Customer not found');
        }

        $data = (array) ($request->getParsedBody() ?? []);
        if (!array_key_exists('is_investor', $data)) {
            return $this->validationError(['is_investor' => 'Required.']);
        }
        $grant = filter_var($data['is_investor'], FILTER_VALIDATE_BOOLEAN);

        // An investor signs in with an emailed code, so without an address they
        // could never actually get in — say so rather than granting dead access.
        if ($grant && !$customer->getEmail()) {
            return $this->validationError([
                'is_investor' => 'This customer has no email address, so they could not receive a sign-in code. Add one first.',
            ]);
        }

        $before = ['is_investor' => $customer->isInvestor()];
        $customer->setIsInvestor($grant);
        $customer->setUpdatedBy($request->getAttribute('user_id'));
        $this->customerRepo->flush();

        $this->audit->logUpdate(
            $request->getAttribute('user_id'), 'Customer', $customer->getId(),
            $before, ['is_investor' => $grant],
            $this->getClientIp($request), $this->getUserAgent($request),
        );

        return $this->success(
            ['id' => $customer->getId(), 'full_name' => $customer->getFullName(), 'is_investor' => $grant],
            $grant ? 'Investor portal access granted' : 'Investor portal access revoked',
        );
    }
}
