<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\LoanProduct;
use App\Domain\Entity\ProductFee;
use App\Domain\Enum\FeeEffect;
use App\Domain\Enum\InterestMethod;

final class LoanCalculationService
{
    /**
     * Calculate full loan breakdown for a product.
     *
     * Matches the legacy CreditX math exactly:
     *
     *   gross_loan    = app_amount + SUM(fees where effect = ADDS_TO_GROSS)
     *   net_disbursed = app_amount - SUM(fees where effect = DEDUCTED_FROM_DISBURSEMENT)
     *                               - old_loan_balance
     *   mr_interest   = rate × gross_loan          (rate is monthly, not annual)
     *   mr_principal  = ceil(gross_loan / tenure)
     *   tr_*          = mr_* × tenure
     *
     * The two independent ProductFee properties that drive the math:
     *
     *   effect      — ADDS_TO_GROSS vs DEDUCTED_FROM_DISBURSEMENT
     *                 (what does this fee do to the loan numbers?)
     *   applies_to  — PRINCIPAL vs GROSS_LOAN
     *                 (what's the base for percentage calculation?)
     *
     * All four combinations are valid. The one that requires care is
     * ADDS_TO_GROSS with applies_to=GROSS_LOAN: the fee is a percentage of
     * the gross that it's being added to — circular. We solve with a
     * single fixed-point pass (legacy never uses this, but we support it).
     *
     * @return array{
     *   gross_loan: string, total_fees: string, fee_details: array,
     *   mr_principal: string, mr_interest: string,
     *   tr_principal: string, tr_interest: string,
     *   mr_principal_interest: string, tr_principal_interest: string,
     *   net_disbursed: string, schedule_preview: array
     * }
     */
    public function calculate(
        LoanProduct $product,
        string $appAmount,
        int $tenure,
        ?string $bankStatementMode = null,
        string $oldLoanBalance = '0',
    ): array {
        $interestRate = (float) $product->getInterestRate();
        $method = $product->getInterestCalculationMethod();

        // Collect active fees that apply to this loan. Filter out the
        // bank statement fee when the customer provided their own statement
        // (legacy check: $bs_fee = 500 only if Generated_by_FTI).
        $applicableFees = [];
        /** @var ProductFee $productFee */
        foreach ($product->getFees() as $productFee) {
            if (!$productFee->isActive()) continue;

            $feeCode = $productFee->getFeeType()->getCode();
            if ($feeCode === 'BSF'
                && $bankStatementMode !== 'generated_by_company'
                && $bankStatementMode !== 'Generated_by_FTI') {
                continue;
            }

            $applicableFees[] = $productFee;
        }

        // ─── Pass 1: compute each applicable fee against app_amount ───
        // First estimate every fee using app_amount as the percentage base.
        // This is exactly correct for fees with applies_to=PRINCIPAL, and
        // is the first iterate for fees with applies_to=GROSS_LOAN.
        $feeAmounts = [];
        foreach ($applicableFees as $i => $pf) {
            $feeAmounts[$i] = $pf->computeAmount($appAmount, $appAmount);
        }

        // Provisional gross: app_amount + fees that ADD_TO_GROSS
        $provisionalGross = $appAmount;
        foreach ($applicableFees as $i => $pf) {
            if ($pf->getEffect() === FeeEffect::ADDS_TO_GROSS) {
                $provisionalGross = bcadd($provisionalGross, $feeAmounts[$i], 2);
            }
        }

        // ─── Pass 2: recompute only ADDS_TO_GROSS fees whose base is GROSS_LOAN ───
        // For those, amount depends on gross, which depends on them — one
        // extra pass is enough to get a stable value for linear cases.
        $needsRecalc = false;
        foreach ($applicableFees as $i => $pf) {
            if ($pf->getEffect() === FeeEffect::ADDS_TO_GROSS
                && $pf->getAppliesTo()->value === 'gross_loan') {
                $feeAmounts[$i] = $pf->computeAmount($appAmount, $provisionalGross);
                $needsRecalc = true;
            }
        }
        // If any fee was recomputed, rebuild the gross with new amounts
        if ($needsRecalc) {
            $provisionalGross = $appAmount;
            foreach ($applicableFees as $i => $pf) {
                if ($pf->getEffect() === FeeEffect::ADDS_TO_GROSS) {
                    $provisionalGross = bcadd($provisionalGross, $feeAmounts[$i], 2);
                }
            }
        }

        // Also recompute DEDUCTED fees with applies_to=GROSS_LOAN against the
        // now-final gross. Doesn't affect gross itself, only net.
        foreach ($applicableFees as $i => $pf) {
            if ($pf->getEffect() === FeeEffect::DEDUCTED_FROM_DISBURSEMENT
                && $pf->getAppliesTo()->value === 'gross_loan') {
                $feeAmounts[$i] = $pf->computeAmount($appAmount, $provisionalGross);
            }
        }

        $grossLoan = $provisionalGross;

        // ─── Assemble fee_details for the response ───
        $feeDetails = [];
        $totalFees = '0.00';
        $deductedFees = '0.00';
        foreach ($applicableFees as $i => $pf) {
            $amount = $feeAmounts[$i];
            $feeDetails[] = [
                'fee_type_id'      => $pf->getFeeType()->getId(),
                'fee_type_code'    => $pf->getFeeType()->getCode(),
                'fee_type_name'    => $pf->getFeeType()->getName(),
                'calculation_type' => $pf->getCalculationType()->value,
                'base_value'       => $pf->getValue(),
                'amount'           => $amount,
                'effect'           => $pf->getEffect()->value,
                'applies_to'       => $pf->getAppliesTo()->value,
                // Kept for backward-compat with any consumer that reads it;
                // effect is the canonical field going forward.
                'is_deducted'      => $pf->getEffect() === FeeEffect::DEDUCTED_FROM_DISBURSEMENT,
            ];
            $totalFees = bcadd($totalFees, $amount, 2);
            if ($pf->getEffect() === FeeEffect::DEDUCTED_FROM_DISBURSEMENT) {
                $deductedFees = bcadd($deductedFees, $amount, 2);
            }
        }

        // ─── Interest + principal schedule ───
        switch ($method) {
            case InterestMethod::FLAT_RATE:
                $result = $this->calculateFlatRate($grossLoan, $interestRate, $tenure);
                break;
            case InterestMethod::REDUCING_BALANCE:
                $result = $this->calculateReducingBalance($grossLoan, $interestRate, $tenure);
                break;
            case InterestMethod::AMORTIZED:
                $result = $this->calculateAmortized($grossLoan, $interestRate, $tenure);
                break;
            default:
                $result = $this->calculateFlatRate($grossLoan, $interestRate, $tenure);
        }

        // ─── Net disbursed ───
        // Legacy: $net_disbursed = $app_amount - $mgt_fee - $bs_fee - $old_loan_balance
        // Equivalent: start at app_amount, subtract all DEDUCTED_FROM_DISBURSEMENT
        // fees, subtract old loan balance. Note that ADDS_TO_GROSS fees do NOT
        // appear here — they're paid by the customer over the schedule.
        $netDisbursed = bcsub($appAmount, $deductedFees, 2);
        $netDisbursed = bcsub($netDisbursed, $oldLoanBalance, 2);

        return [
            'app_amount'           => $appAmount,
            'gross_loan'           => $grossLoan,
            'total_fees'           => $totalFees,
            'fee_details'          => $feeDetails,
            'mr_principal'         => $result['mr_principal'],
            'mr_interest'          => $result['mr_interest'],
            'tr_principal'         => $result['tr_principal'],
            'tr_interest'          => $result['tr_interest'],
            'mr_principal_interest' => $result['mr_principal_interest'],
            'tr_principal_interest' => $result['tr_principal_interest'],
            'net_disbursed'        => $netDisbursed,
            'old_loan_balance'     => $oldLoanBalance,
            'interest_rate'        => $product->getInterestRate(),
            'calculation_method'   => $method->value,
            'tenure'               => $tenure,
            'schedule_preview'     => $result['schedule'] ?? [],
        ];
    }

    /**
     * Flat rate: principal and interest split evenly across tenure.
     * Matches legacy CreditX exactly:
     *
     *   mr_principal          = ceil(gross_loan / tenure)
     *   mr_interest           = ceil(rate × gross_loan)         (rate is monthly)
     *   tr_principal          = ceil(mr_principal × tenure)     (small ceiling drift OK)
     *   tr_interest           = ceil(mr_interest × tenure)
     *   mr_principal_interest = ceil(mr_principal + mr_interest)
     *   tr_principal_interest = ceil(mr_principal_interest × tenure)
     *
     * The last line matters — legacy computes tr_pi from mr_pi × tenure, not
     * tr_principal + tr_interest. These coincide in normal cases but can differ
     * by ₦0–2 due to ceiling rounding; keep the legacy formula for byte-level
     * parity with the old system.
     */
    private function calculateFlatRate(string $grossLoan, float $rate, int $tenure): array
    {
        $mrPrincipal = (string) ceil((float) bcdiv($grossLoan, (string) $tenure, 6));
        $mrInterest = (string) ceil((float) bcmul($grossLoan, (string) $rate, 6));

        $trPrincipal = (string) ceil((float) bcmul($mrPrincipal, (string) $tenure, 2));
        $trInterest = (string) ceil((float) bcmul($mrInterest, (string) $tenure, 2));

        $mrTotal = (string) ceil((float) bcadd($mrPrincipal, $mrInterest, 2));
        // Legacy formula — keep as mr_total × tenure rather than tr_principal + tr_interest
        $trTotal = (string) ceil((float) bcmul($mrTotal, (string) $tenure, 2));

        $schedule = [];
        for ($i = 1; $i <= $tenure; $i++) {
            $schedule[] = [
                'installment' => $i,
                'principal'   => $mrPrincipal,
                'interest'    => $mrInterest,
                'total'       => $mrTotal,
                'balance'     => bcsub($trPrincipal, bcmul($mrPrincipal, (string) $i, 2), 2),
            ];
        }

        return [
            'mr_principal' => $mrPrincipal, 'mr_interest' => $mrInterest,
            'tr_principal' => $trPrincipal, 'tr_interest' => $trInterest,
            'mr_principal_interest' => $mrTotal, 'tr_principal_interest' => $trTotal,
            'schedule' => $schedule,
        ];
    }

    /**
     * Reducing balance: interest calculated on declining principal each month.
     */
    private function calculateReducingBalance(string $grossLoan, float $rate, int $tenure): array
    {
        $mrPrincipal = (string) ceil((float) bcdiv($grossLoan, (string) $tenure, 6));
        $balance = $grossLoan;
        $trInterest = '0.00';
        $schedule = [];

        for ($i = 1; $i <= $tenure; $i++) {
            $monthlyInterest = (string) ceil((float) bcmul($balance, (string) $rate, 6));
            $monthlyTotal = bcadd($mrPrincipal, $monthlyInterest, 2);
            $balance = bcsub($balance, $mrPrincipal, 2);
            if ((float) $balance < 0) $balance = '0.00';
            $trInterest = bcadd($trInterest, $monthlyInterest, 2);

            $schedule[] = [
                'installment' => $i,
                'principal'   => $mrPrincipal,
                'interest'    => $monthlyInterest,
                'total'       => $monthlyTotal,
                'balance'     => $balance,
            ];
        }

        $trPrincipal = $grossLoan;
        $trTotal = bcadd($trPrincipal, $trInterest, 2);

        // Average monthly interest for summary
        $avgInterest = (string) ceil((float) bcdiv($trInterest, (string) $tenure, 6));

        return [
            'mr_principal' => $mrPrincipal, 'mr_interest' => $avgInterest,
            'tr_principal' => $trPrincipal, 'tr_interest' => $trInterest,
            'mr_principal_interest' => bcadd($mrPrincipal, $avgInterest, 2),
            'tr_principal_interest' => $trTotal,
            'schedule' => $schedule,
        ];
    }

    /**
     * Amortized (EMI): fixed monthly payment calculated using standard amortization formula.
     * EMI = P * r * (1+r)^n / ((1+r)^n - 1)
     */
    private function calculateAmortized(string $grossLoan, float $rate, int $tenure): array
    {
        $P = (float) $grossLoan;
        $r = $rate;
        $n = $tenure;

        if ($r <= 0) {
            // Zero interest — simple division
            $emi = ceil($P / $n);
        } else {
            $compoundFactor = pow(1 + $r, $n);
            $emi = ceil($P * $r * $compoundFactor / ($compoundFactor - 1));
        }

        $balance = $P;
        $trPrincipal = 0;
        $trInterest = 0;
        $schedule = [];

        for ($i = 1; $i <= $n; $i++) {
            $monthlyInterest = ceil($balance * $r);
            $monthlyPrincipal = $emi - $monthlyInterest;

            // Last installment adjustment
            if ($i === $n) {
                $monthlyPrincipal = ceil($balance);
                $emi = $monthlyPrincipal + $monthlyInterest;
            }

            $balance -= $monthlyPrincipal;
            if ($balance < 0) $balance = 0;
            $trPrincipal += $monthlyPrincipal;
            $trInterest += $monthlyInterest;

            $schedule[] = [
                'installment' => $i,
                'principal'   => number_format($monthlyPrincipal, 2, '.', ''),
                'interest'    => number_format($monthlyInterest, 2, '.', ''),
                'total'       => number_format($monthlyPrincipal + $monthlyInterest, 2, '.', ''),
                'balance'     => number_format($balance, 2, '.', ''),
            ];
        }

        $avgPrincipal = (string) ceil($trPrincipal / $n);
        $avgInterest = (string) ceil($trInterest / $n);

        return [
            'mr_principal' => $avgPrincipal, 'mr_interest' => $avgInterest,
            'tr_principal' => number_format($trPrincipal, 2, '.', ''),
            'tr_interest' => number_format($trInterest, 2, '.', ''),
            'mr_principal_interest' => (string) ceil(($trPrincipal + $trInterest) / $n),
            'tr_principal_interest' => number_format($trPrincipal + $trInterest, 2, '.', ''),
            'schedule' => $schedule,
        ];
    }
}
