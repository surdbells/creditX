<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\LoanProduct;
use App\Domain\Entity\ProductFee;
use App\Domain\Enum\InterestMethod;

final class LoanCalculationService
{
    /**
     * Calculate full loan breakdown for a product.
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

        // ─── 1. Compute fees ───
        $feeDetails = [];
        $totalFees = '0.00';

        /** @var ProductFee $productFee */
        foreach ($product->getFees() as $productFee) {
            if (!$productFee->isActive()) {
                continue;
            }

            // For gross_loan-based fees, we need gross_loan. Initially use appAmount + fees as estimate.
            // We'll do a two-pass: first pass with principal-based, then compute gross, then recompute gross-based.
            $feeAmount = $productFee->computeAmount($appAmount, $appAmount);

            $feeDetails[] = [
                'fee_type_id'      => $productFee->getFeeType()->getId(),
                'fee_type_code'    => $productFee->getFeeType()->getCode(),
                'fee_type_name'    => $productFee->getFeeType()->getName(),
                'calculation_type' => $productFee->getCalculationType()->value,
                'base_value'       => $productFee->getValue(),
                'amount'           => $feeAmount,
                'is_deducted'      => $productFee->isDeductedAtSource(),
                'applies_to'       => $productFee->getAppliesTo()->value,
            ];

            $totalFees = bcadd($totalFees, $feeAmount, 2);
        }

        // ─── 2. Gross loan = principal + fees deducted at source ───
        $grossLoan = bcadd($appAmount, $totalFees, 2);

        // Recompute any fees that apply to gross_loan (second pass)
        $recalcNeeded = false;
        foreach ($feeDetails as &$fd) {
            if ($fd['applies_to'] === 'gross_loan') {
                $recalcNeeded = true;
                // Find the matching ProductFee
                foreach ($product->getFees() as $pf) {
                    if ($pf->getFeeType()->getId() === $fd['fee_type_id'] && $pf->isActive()) {
                        $newAmount = $pf->computeAmount($appAmount, $grossLoan);
                        $totalFees = bcsub($totalFees, $fd['amount'], 2);
                        $totalFees = bcadd($totalFees, $newAmount, 2);
                        $fd['amount'] = $newAmount;
                        break;
                    }
                }
            }
        }
        unset($fd);

        if ($recalcNeeded) {
            $grossLoan = bcadd($appAmount, $totalFees, 2);
        }

        // ─── 3. Calculate repayment based on method ───
        $schedule = [];

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

        // ─── 4. Net disbursed ───
        $deductedFees = '0.00';
        foreach ($feeDetails as $fd) {
            if ($fd['is_deducted']) {
                $deductedFees = bcadd($deductedFees, $fd['amount'], 2);
            }
        }

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
     * Matches existing CreditX behavior exactly.
     */
    private function calculateFlatRate(string $grossLoan, float $rate, int $tenure): array
    {
        $mrPrincipal = (string) ceil((float) bcdiv($grossLoan, (string) $tenure, 6));
        $mrInterest = (string) ceil((float) bcmul($grossLoan, (string) $rate, 6));

        $trPrincipal = (string) ceil((float) bcmul($mrPrincipal, (string) $tenure, 2));
        $trInterest = (string) ceil((float) bcmul($mrInterest, (string) $tenure, 2));

        $mrTotal = bcadd($mrPrincipal, $mrInterest, 2);
        $trTotal = bcadd($trPrincipal, $trInterest, 2);

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
