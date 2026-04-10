<?php
declare(strict_types=1);
namespace App\Action\LoanProduct;

use App\Domain\Entity\{LoanProduct, ProductFee};
use App\Domain\Enum\{FeeAppliesTo, FeeCalculationType, InterestMethod};
use App\Domain\Repository\{FeeTypeRepository, LoanProductRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateProductAction
{
    use ApiResponse;
    public function __construct(
        private readonly LoanProductRepository $productRepo,
        private readonly FeeTypeRepository $feeTypeRepo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'name'        => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 150],
            'code'        => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 30],
            'description' => ['required' => false, 'type' => 'string', 'max' => 1000],
            'min_amount'  => ['required' => true, 'type' => 'string'],
            'max_amount'  => ['required' => true, 'type' => 'string'],
            'min_tenure'  => ['required' => true, 'type' => 'int', 'min' => 1],
            'max_tenure'  => ['required' => true, 'type' => 'int', 'min' => 1],
            'interest_calculation_method' => ['required' => true, 'type' => 'string', 'in' => array_column(InterestMethod::cases(), 'value')],
            'interest_rate' => ['required' => true, 'type' => 'string'],
            'max_customer_age' => ['required' => false, 'type' => 'int'],
            'max_service_years' => ['required' => false, 'type' => 'int'],
            'allows_top_up' => ['required' => false, 'type' => 'bool', 'default' => true],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);

        if ($this->productRepo->codeExists($v['clean']['code'])) {
            return $this->validationError(['code' => 'Product code already exists']);
        }

        $p = new LoanProduct();
        $p->setName($v['clean']['name']);
        $p->setCode($v['clean']['code']);
        $p->setDescription($v['clean']['description'] ?? null);
        $p->setMinAmount($v['clean']['min_amount']);
        $p->setMaxAmount($v['clean']['max_amount']);
        $p->setMinTenure($v['clean']['min_tenure']);
        $p->setMaxTenure($v['clean']['max_tenure']);
        $p->setInterestCalculationMethod(InterestMethod::from($v['clean']['interest_calculation_method']));
        $p->setInterestRate($v['clean']['interest_rate']);
        $p->setMaxCustomerAge($v['clean']['max_customer_age'] ?? null);
        $p->setMaxServiceYears($v['clean']['max_service_years'] ?? null);
        $p->setAllowsTopUp($v['clean']['allows_top_up']);

        // Attach fees
        if (isset($data['fees']) && is_array($data['fees'])) {
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

        $this->productRepo->save($p);
        $this->audit->logCreate($request->getAttribute('user_id'), 'LoanProduct', $p->getId(), $p->toArray(true), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($p->toArray(true), 'Loan product created successfully');
    }
}
