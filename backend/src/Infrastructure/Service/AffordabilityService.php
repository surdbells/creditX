<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

/**
 * Computes a customer's debt-service ratio (DSR) for a proposed loan and
 * decides whether it sits within the institution's affordability limit.
 *
 * DSR = monthly loan instalment / monthly income.
 *
 * This is the affordability basis for self-service portal applicants who are
 * not matched against a GovernmentRecord (employees of any institution, the
 * self-employed, business owners, etc.). The result is advisory — the portal
 * SOFT-FLAGS a breach (the application still submits) so the snapshot reaches
 * a human reviewer rather than being auto-declined.
 */
final class AffordabilityService
{
    /** Fallback maximum DSR (40%) when no system setting is configured. */
    private const DEFAULT_MAX_DSR = 0.40;

    public function __construct(
        private readonly SettingsCacheService $settings,
    ) {
    }

    /**
     * Assess affordability of a proposed monthly instalment against income.
     *
     * @return array{
     *     monthly_income: float,
     *     monthly_installment: float,
     *     dsr: float|null,
     *     max_dsr: float,
     *     within_limit: bool,
     *     disposable_income: float|null,
     *     has_income: bool
     * }
     */
    public function assess(string|float|int|null $monthlyIncome, string|float|int|null $monthlyInstallment): array
    {
        $income = max(0.0, (float) ($monthlyIncome ?? 0));
        $installment = max(0.0, (float) ($monthlyInstallment ?? 0));
        $maxDsr = $this->maxDsr();

        $hasIncome = $income > 0.0;
        $dsr = $hasIncome ? round($installment / $income, 6) : null;
        $disposable = $hasIncome ? round($income - $installment, 2) : null;

        // With no income we cannot affirm affordability, so it is NOT within
        // limit — that routes the application to a reviewer rather than
        // silently passing.
        $withinLimit = $hasIncome && $dsr !== null && $dsr <= $maxDsr;

        return [
            'monthly_income'      => round($income, 2),
            'monthly_installment' => round($installment, 2),
            'dsr'                 => $dsr,
            'max_dsr'             => $maxDsr,
            'within_limit'        => $withinLimit,
            'disposable_income'   => $disposable,
            'has_income'          => $hasIncome,
        ];
    }

    /** The configured maximum acceptable DSR, falling back to the default. */
    public function maxDsr(): float
    {
        $configured = (float) $this->settings->get('affordability.max_dsr', self::DEFAULT_MAX_DSR);

        return $configured > 0.0 ? $configured : self::DEFAULT_MAX_DSR;
    }
}
