<?php
declare(strict_types=1);
namespace App\Action\Investment;

use App\Domain\Entity\InvestmentProduct;
use App\Domain\Enum\{InvestmentPayoutFrequency, InvestmentPayoutMode, InvestmentType};
use App\Domain\Repository\InvestmentProductRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/investments/products — create an investment product.
 * Gated by investments.create.
 */
final class CreateInvestmentProductAction
{
    use ApiResponse;

    public function __construct(
        private readonly InvestmentProductRepository $repo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'name'             => ['required' => true,  'type' => 'string', 'min' => 1, 'max' => 150],
            'code'             => ['required' => true,  'type' => 'string', 'min' => 1, 'max' => 30],
            'description'      => ['required' => false, 'type' => 'string', 'max' => 1000],
            'type'             => ['required' => true,  'type' => 'string', 'in' => array_column(InvestmentType::cases(), 'value')],
            'interest_rate'    => ['required' => true,  'type' => 'string'],
            'payout_mode'      => ['required' => true,  'type' => 'string', 'in' => array_column(InvestmentPayoutMode::cases(), 'value')],
            'payout_frequency' => ['required' => false, 'type' => 'string', 'in' => array_column(InvestmentPayoutFrequency::cases(), 'value'), 'default' => 'monthly'],
            'min_tenor_days'   => ['required' => false, 'type' => 'int'],
            'max_tenor_days'   => ['required' => false, 'type' => 'int'],
            'min_amount'       => ['required' => false, 'type' => 'string', 'default' => '0.00'],
            'top_up_allowed'   => ['required' => false, 'type' => 'bool',   'default' => false],
            'early_liquidation_penalty_rate' => ['required' => false, 'type' => 'string', 'default' => '0.000000'],
            'wht_rate'         => ['required' => false, 'type' => 'string', 'default' => '0.100000'],
            'day_count_basis'  => ['required' => false, 'type' => 'int',    'default' => 365],
            'auto_rollover'    => ['required' => false, 'type' => 'bool',   'default' => false],
            'is_active'        => ['required' => false, 'type' => 'bool',   'default' => true],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);
        $c = $v['clean'];

        if ($this->repo->codeExists($c['code'])) {
            return $this->validationError(['code' => 'Product code already exists']);
        }

        $type = InvestmentType::from($c['type']);
        $mode = InvestmentPayoutMode::from($c['payout_mode']);

        // An open-ended product has no maturity, so "pay at maturity" would
        // accrue forever with nothing to settle it. Reject at configuration
        // time rather than letting a placement fail later.
        if ($type === InvestmentType::OPEN_ENDED && $mode === InvestmentPayoutMode::AT_MATURITY) {
            return $this->validationError([
                'payout_mode' => 'An open-ended product cannot pay at maturity — choose periodic or compounded.',
            ]);
        }
        if ($type === InvestmentType::FIXED_TERM) {
            $min = $c['min_tenor_days'] ?? null;
            $max = $c['max_tenor_days'] ?? null;
            if ($min !== null && $max !== null && $min > $max) {
                return $this->validationError(['min_tenor_days' => 'Minimum tenor cannot exceed the maximum tenor.']);
            }
        }

        $p = new InvestmentProduct();
        $p->setName($c['name']);
        $p->setCode($c['code']);
        $p->setDescription($c['description'] ?? null);
        $p->setType($type);
        $p->setInterestRate($c['interest_rate']);
        $p->setPayoutMode($mode);
        $p->setPayoutFrequency(InvestmentPayoutFrequency::from($c['payout_frequency']));
        // Tenor bounds only apply to fixed-term.
        $p->setMinTenorDays($type === InvestmentType::FIXED_TERM ? ($c['min_tenor_days'] ?? null) : null);
        $p->setMaxTenorDays($type === InvestmentType::FIXED_TERM ? ($c['max_tenor_days'] ?? null) : null);
        $p->setMinAmount($c['min_amount']);
        // Top-ups are an open-ended feature; a fixed-term placement is locked.
        $p->setTopUpAllowed($type === InvestmentType::OPEN_ENDED ? (bool) $c['top_up_allowed'] : false);
        $p->setEarlyLiquidationPenaltyRate($c['early_liquidation_penalty_rate']);
        $p->setWhtRate($c['wht_rate']);
        $p->setDayCountBasis((int) $c['day_count_basis']);
        $p->setAutoRollover($type === InvestmentType::FIXED_TERM ? (bool) $c['auto_rollover'] : false);
        $p->setIsActive((bool) $c['is_active']);
        $p->setCreatedBy($request->getAttribute('user_id'));

        $this->repo->save($p);
        $this->audit->logCreate($request->getAttribute('user_id'), 'InvestmentProduct', $p->getId(), $p->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($p->toArray(), 'Investment product created successfully');
    }
}
