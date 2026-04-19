<?php
declare(strict_types=1);
namespace App\Action\GovRecord;

use App\Domain\Repository\{GovernmentRecordRepository, LoanRepository};
use App\Infrastructure\Service\{ApiResponse, SettingsCacheService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /government-records/{id}/eligibility
 *
 * Returns eligibility metadata for a government staff record so the
 * loan capture form can decide if an application may proceed:
 *   - current age (years)
 *   - years of service
 *   - max tenure remaining before retirement (assumes 60y default)
 *   - current active/disbursed loan balance (for top-up calc)
 *   - computed flags: is_eligible, reasons[]
 */
final class GetEligibilityAction
{
    use ApiResponse;

    public function __construct(
        private readonly GovernmentRecordRepository $govRepo,
        private readonly LoanRepository $loanRepo,
        private readonly SettingsCacheService $settings,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $record = $this->govRepo->find($args['id'] ?? '');
        if ($record === null) return $this->notFound('Government record not found');

        $today = new \DateTimeImmutable();
        $retirementAge = (int) ($this->settings->get('eligibility.retirement_age', '60'));
        $maxServiceYears = (int) ($this->settings->get('eligibility.max_service_years', '35'));

        // Age calc
        $age = null;
        if ($record->getDateOfBirth() !== null) {
            $age = (int) $record->getDateOfBirth()->diff($today)->y;
        }

        // Service years calc
        $serviceYears = null;
        $yearsToRetirement = null;
        if ($record->getHireDate() !== null) {
            $serviceYears = (int) $record->getHireDate()->diff($today)->y;
        }

        // Years until retirement (used for max tenure)
        if ($age !== null && $retirementAge > $age) {
            $yearsToRetirement = $retirementAge - $age;
        }
        $maxTenureMonths = $yearsToRetirement !== null ? max(0, $yearsToRetirement * 12) : null;

        // Active/disbursed loan balance (for top-up)
        $activeLoans = $this->loanRepo->findDisbursedByStaffId($record->getStaffId());
        $activeLoan = $activeLoans[0] ?? null;
        $activeBalance = 0.0;
        if ($activeLoan !== null) {
            // Use top_up_balance if set, else gross_loan as proxy
            $activeBalance = (float) ($activeLoan->getTopUpBalance() ?? $activeLoan->getGrossLoan() ?? 0);
        }

        // Eligibility checks
        $reasons = [];
        $eligible = true;

        if (!$record->isActive()) { $eligible = false; $reasons[] = 'Staff record is inactive'; }
        if ($age !== null && $age >= $retirementAge) { $eligible = false; $reasons[] = 'Staff has reached retirement age'; }
        if ($serviceYears !== null && $serviceYears >= $maxServiceYears) { $eligible = false; $reasons[] = 'Staff has exceeded maximum service years'; }
        if ($yearsToRetirement !== null && $yearsToRetirement < 1) { $eligible = false; $reasons[] = 'Less than 12 months to retirement'; }

        return $this->success([
            'record_id'            => $record->getId(),
            'staff_id'             => $record->getStaffId(),
            'employee_name'        => $record->getEmployeeName(),
            'age'                  => $age,
            'retirement_age'       => $retirementAge,
            'service_years'        => $serviceYears,
            'max_service_years'    => $maxServiceYears,
            'years_to_retirement'  => $yearsToRetirement,
            'max_tenure_months'    => $maxTenureMonths,
            'net_pay'              => $record->getNetPay() !== null ? (float) $record->getNetPay() : null,
            'is_active'            => $record->isActive(),
            'has_active_loan'      => $activeLoan !== null,
            'active_loan_balance'  => $activeBalance,
            'is_eligible'          => $eligible,
            'reasons'              => $reasons,
        ]);
    }
}
