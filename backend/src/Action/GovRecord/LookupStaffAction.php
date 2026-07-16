<?php
declare(strict_types=1);
namespace App\Action\GovRecord;

use App\Domain\Repository\{CustomerRepository, GovernmentRecordRepository, LoanRepository};
use App\Infrastructure\Service\{ApiResponse, EligibilityService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /government-records/lookup/{staffId}
 *
 * Exact Staff ID lookup used by the agent capture wizard's step 2. Returns the
 * matching government record(s) with:
 *   - eligibility  — age / service / retirement / active checks
 *   - loan_block   — the SAME duplicate-loan rules enforced at submit
 *                    (in-progress application, pending decision, running loan),
 *                    computed here so the agent is blocked BEFORE filling the
 *                    whole form rather than after.
 */
final class LookupStaffAction
{
    use ApiResponse;
    public function __construct(
        private readonly GovernmentRecordRepository $repo,
        private readonly EligibilityService $eligibility,
        private readonly LoanRepository $loanRepo,
        private readonly CustomerRepository $customerRepo,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $staffId = $args['staffId'] ?? '';
        if ($staffId === '') return $this->validationError(['staff_id' => 'Staff ID is required']);

        $records = $this->repo->findByStaffId($staffId);
        if (empty($records)) return $this->notFound('No records found for staff ID: ' . $staffId);

        $results = [];
        foreach ($records as $record) {
            $eligibility = $this->eligibility->check($record);
            $results[] = array_merge($record->toArray(), [
                'eligibility' => $eligibility,
                'loan_block'  => $this->loanBlock($record->getStaffId()),
            ]);
        }

        return $this->success($results, 'Records found');
    }

    /**
     * Mirror CreateLoanAction's pre-submit duplicate rules so the agent app can
     * halt at the Staff ID step. A running (owing) loan is NOT a block — it just
     * means the next application will be a top-up — so it is surfaced as info.
     *
     * @return array{blocked: bool, reason: ?string, is_top_up: bool}
     */
    private function loanBlock(string $staffId): array
    {
        if ($this->loanRepo->hasInProgressLoanForStaffId($staffId)) {
            return ['blocked' => true, 'reason' => 'This customer already has a loan application in progress.', 'is_top_up' => false];
        }

        $customer = $this->customerRepo->findByStaffId($staffId);
        if ($customer !== null) {
            $pending = $this->loanRepo->findPendingDecisionByCustomer($customer->getId());
            if (!empty($pending)) {
                return [
                    'blocked'   => true,
                    'reason'    => 'This customer already has a loan pending a decision (' . $pending[0]->getApplicationId() . ', ' . $pending[0]->getStatus()->value . ').',
                    'is_top_up' => false,
                ];
            }
            $owing = $this->loanRepo->findOwingByCustomer($customer->getId());
            if (!empty($owing)) {
                return [
                    'blocked'   => false,
                    'reason'    => 'This customer has a running loan (' . $owing[0]->getApplicationId() . '). A new application will be treated as a top-up.',
                    'is_top_up' => true,
                ];
            }
        }

        return ['blocked' => false, 'reason' => null, 'is_top_up' => false];
    }
}
