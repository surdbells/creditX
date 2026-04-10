<?php
declare(strict_types=1);
namespace App\Action\LoanProduct;

use App\Domain\Entity\ProductFee;
use App\Domain\Enum\{FeeAppliesTo, FeeCalculationType, InterestMethod};
use App\Domain\Repository\{FeeTypeRepository, LoanProductRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateProductAction
{
    use ApiResponse;
    public function __construct(
        private readonly LoanProductRepository $productRepo,
        private readonly FeeTypeRepository $feeTypeRepo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $p = $this->productRepo->find($args['id'] ?? '');
        if ($p === null) return $this->notFound('Loan product not found');

        $old = $p->toArray(true);
        $data = (array) ($request->getParsedBody() ?? []);

        if (isset($data['name']) && $data['name'] !== '') $p->setName($data['name']);
        if (isset($data['description'])) $p->setDescription($data['description']);
        if (isset($data['min_amount'])) $p->setMinAmount($data['min_amount']);
        if (isset($data['max_amount'])) $p->setMaxAmount($data['max_amount']);
        if (isset($data['min_tenure'])) $p->setMinTenure((int) $data['min_tenure']);
        if (isset($data['max_tenure'])) $p->setMaxTenure((int) $data['max_tenure']);
        if (isset($data['interest_calculation_method'])) $p->setInterestCalculationMethod(InterestMethod::from($data['interest_calculation_method']));
        if (isset($data['interest_rate'])) $p->setInterestRate($data['interest_rate']);
        if (isset($data['max_customer_age'])) $p->setMaxCustomerAge((int) $data['max_customer_age']);
        if (isset($data['max_service_years'])) $p->setMaxServiceYears((int) $data['max_service_years']);
        if (isset($data['allows_top_up'])) $p->setAllowsTopUp(filter_var($data['allows_top_up'], FILTER_VALIDATE_BOOLEAN));
        if (isset($data['is_active'])) $p->setIsActive(filter_var($data['is_active'], FILTER_VALIDATE_BOOLEAN));

        // Replace fees if provided
        if (isset($data['fees']) && is_array($data['fees'])) {
            $p->clearFees();
            foreach ($data['fees'] as $feeData) {
                $feeType = $this->feeTypeRepo->find($feeData['fee_type_id'] ?? '');
                if ($feeType === null) continue;
                $pf = new ProductFee();
                $pf->setFeeType($feeType);
                $pf->setCalculationType(FeeCalculationType::from($feeData['calculation_type'] ?? 'flat'));
                $pf->setValue($feeData['value'] ?? '0');
                $pf->setIsDeductedAtSource(filter_var($feeData['is_deducted_at_source'] ?? true, FILTER_VALIDATE_BOOLEAN));
                $pf->setAppliesTo(FeeAppliesTo::from($feeData['applies_to'] ?? 'principal'));
                $p->addFee($pf);
            }
        }

        $this->productRepo->flush();
        $this->audit->logUpdate($request->getAttribute('user_id'), 'LoanProduct', $p->getId(), $old, $p->toArray(true), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($p->toArray(true), 'Loan product updated successfully');
    }
}
