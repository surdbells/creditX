<?php
declare(strict_types=1);
namespace App\Action\Customer;

use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/customers/by-ippis/{ippis}
 *
 * Look up a customer by their IPPIS (staff_id) number. Used by the agent
 * loan-capture wizard to prefill the form if the customer already exists.
 *
 * Response:
 *   200 { status:success, data: { found: true,  customer: {...} } }
 *   200 { status:success, data: { found: false, customer: null  } }
 *
 * Note: always returns 200, never 404. The "not found" case is expected
 * flow (new customer, agent will fill the form from scratch) and a 404
 * would trigger error UI in the client. The `found` boolean is how the
 * client decides whether to prefill or start blank.
 *
 * Permission: any authenticated agent/admin can call this — it only
 * returns existing customer records, which are already accessible via
 * the customers list endpoint. No enumeration risk since the IPPIS
 * number isn't a secret.
 */
final class FindByIppisAction
{
    use ApiResponse;

    public function __construct(
        private readonly CustomerRepository $repo,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $ippis = trim((string) ($args['ippis'] ?? ''));
        if ($ippis === '') {
            return $this->validationError(['ippis' => 'IPPIS number is required']);
        }

        $customer = $this->repo->findByStaffId($ippis);

        return $this->success([
            'found'    => $customer !== null,
            'customer' => $customer?->toArray(true),
        ]);
    }
}
