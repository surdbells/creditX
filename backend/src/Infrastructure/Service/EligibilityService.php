<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\GovernmentRecord;
use App\Domain\Entity\RecordType;

final class EligibilityService
{
    /**
     * Check if a government record is eligible for a loan.
     *
     * @return array{eligible: bool, reasons: string[], details: array}
     */
    public function check(GovernmentRecord $record, ?int $maxAgeOverride = null, ?int $maxServiceYearsOverride = null): array
    {
        $reasons = [];
        $details = [];

        $recordType = $record->getRecordType();
        $rules = $recordType->getEligibilityRules() ?? [];

        $maxAge = $maxAgeOverride ?? ($rules['max_age'] ?? (int) ($_ENV['GENERAL_MAX_CUSTOMER_AGE'] ?? 57));
        $maxServiceYears = $maxServiceYearsOverride ?? ($rules['max_service_years'] ?? (int) ($_ENV['GENERAL_MAX_SERVICE_YEARS'] ?? 33));

        // Age check
        $age = $record->getAge();
        $details['age'] = $age;
        $details['max_age'] = $maxAge;
        if ($age !== null && $age >= $maxAge) {
            $reasons[] = "Employee is {$age} years old (maximum: {$maxAge})";
        }

        // Years of service check
        $yearsOfService = $record->getYearsOfService();
        $details['years_of_service'] = $yearsOfService;
        $details['max_service_years'] = $maxServiceYears;
        if ($yearsOfService !== null && $yearsOfService >= $maxServiceYears) {
            $reasons[] = "Employee has served {$yearsOfService} years (maximum: {$maxServiceYears})";
        }

        // Retirement date check
        $retirementDate = $record->getRetirementDate();
        $details['retirement_date'] = $retirementDate?->format('Y-m-d');
        if ($retirementDate !== null && $retirementDate <= new \DateTime()) {
            $reasons[] = 'Employee has passed retirement date';
        }

        // Active check
        if (!$record->isActive()) {
            $reasons[] = 'Employee record is inactive';
        }

        $details['record_type'] = $recordType->getName();
        $details['staff_id'] = $record->getStaffId();
        $details['employee_name'] = $record->getEmployeeName();

        return [
            'eligible' => empty($reasons),
            'reasons'  => $reasons,
            'details'  => $details,
        ];
    }

    /**
     * Check if there are existing active/pending/approved loans for this staff ID.
     * This requires the loan repository which will be added in Phase 3.
     * For now, returns a placeholder structure.
     *
     * @return array{has_active_loan: bool, active_loan_id: string|null, active_loan_status: string|null}
     */
    public function checkExistingLoans(string $staffId): array
    {
        // Will be implemented in Phase 3 when Loan entity exists
        return [
            'has_active_loan'    => false,
            'active_loan_id'     => null,
            'active_loan_status' => null,
        ];
    }
}
