<?php
declare(strict_types=1);
namespace App\Action\Investment;

use App\Domain\Enum\{InvestmentPayoutFrequency, InvestmentPayoutMode, InvestmentType};
use App\Domain\Repository\InvestmentProductRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * PUT /api/investments/products/{id} — edit an investment product.
 * Gated by investments.create.
 *
 * NOTE: edits here affect FUTURE placements only. Every live investment
 * snapshotted its terms at placement, so repricing a product never changes an
 * investor's agreed rate, tenor, or WHT.
 */
final class UpdateInvestmentProductAction
{
    use ApiResponse;

    public function __construct(
        private readonly InvestmentProductRepository $repo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $p = $this->repo->find($args['id'] ?? '');
        if ($p === null) return $this->notFound('Investment product not found');

        $before = $p->toArray();
        $data = (array) ($request->getParsedBody() ?? []);

        if (isset($data['code']) && strtoupper(trim((string) $data['code'])) !== $p->getCode()) {
            $code = strtoupper(trim((string) $data['code']));
            if ($this->repo->codeExists($code, $p->getId())) {
                return $this->validationError(['code' => 'Product code already exists']);
            }
            $p->setCode($code);
        }

        if (isset($data['name']) && trim((string) $data['name']) !== '') $p->setName((string) $data['name']);
        if (array_key_exists('description', $data)) $p->setDescription($data['description'] ?: null);
        if (isset($data['type'])) $p->setType(InvestmentType::from((string) $data['type']));
        if (isset($data['interest_rate'])) $p->setInterestRate((string) $data['interest_rate']);
        if (isset($data['payout_mode'])) $p->setPayoutMode(InvestmentPayoutMode::from((string) $data['payout_mode']));
        if (isset($data['payout_frequency'])) $p->setPayoutFrequency(InvestmentPayoutFrequency::from((string) $data['payout_frequency']));
        if (array_key_exists('min_tenor_days', $data)) $p->setMinTenorDays($data['min_tenor_days'] !== null && $data['min_tenor_days'] !== '' ? (int) $data['min_tenor_days'] : null);
        if (array_key_exists('max_tenor_days', $data)) $p->setMaxTenorDays($data['max_tenor_days'] !== null && $data['max_tenor_days'] !== '' ? (int) $data['max_tenor_days'] : null);
        if (isset($data['min_amount'])) $p->setMinAmount((string) $data['min_amount']);
        if (array_key_exists('top_up_allowed', $data)) $p->setTopUpAllowed(filter_var($data['top_up_allowed'], FILTER_VALIDATE_BOOLEAN));
        if (isset($data['early_liquidation_penalty_rate'])) $p->setEarlyLiquidationPenaltyRate((string) $data['early_liquidation_penalty_rate']);
        if (isset($data['wht_rate'])) $p->setWhtRate((string) $data['wht_rate']);
        if (isset($data['day_count_basis'])) $p->setDayCountBasis((int) $data['day_count_basis']);
        if (array_key_exists('auto_rollover', $data)) $p->setAutoRollover(filter_var($data['auto_rollover'], FILTER_VALIDATE_BOOLEAN));
        if (array_key_exists('is_active', $data)) $p->setIsActive(filter_var($data['is_active'], FILTER_VALIDATE_BOOLEAN));

        // Same invariants as create — an open-ended product can never pay "at
        // maturity", and tenor bounds must be sane.
        if ($p->getType() === InvestmentType::OPEN_ENDED) {
            if ($p->getPayoutMode() === InvestmentPayoutMode::AT_MATURITY) {
                return $this->validationError([
                    'payout_mode' => 'An open-ended product cannot pay at maturity — choose periodic or compounded.',
                ]);
            }
            $p->setMinTenorDays(null);
            $p->setMaxTenorDays(null);
            $p->setAutoRollover(false);
        } else {
            $p->setTopUpAllowed(false);
            $min = $p->getMinTenorDays();
            $max = $p->getMaxTenorDays();
            if ($min !== null && $max !== null && $min > $max) {
                return $this->validationError(['min_tenor_days' => 'Minimum tenor cannot exceed the maximum tenor.']);
            }
        }

        $p->setUpdatedBy($request->getAttribute('user_id'));
        $this->repo->flush();

        $this->audit->logUpdate($request->getAttribute('user_id'), 'InvestmentProduct', $p->getId(), $before, $p->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($p->toArray(), 'Investment product updated');
    }
}
