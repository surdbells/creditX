<?php
declare(strict_types=1);
namespace App\Action\Deposit;

use App\Domain\Entity\DepositProduct;
use App\Domain\Enum\{DepositInterestMethod, DepositWithdrawalPolicy};
use App\Domain\Repository\DepositProductRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/deposits/products — create a deposit product.
 * Gated by deposits.create.
 */
final class CreateDepositProductAction
{
    use ApiResponse;

    public function __construct(
        private readonly DepositProductRepository $repo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'name'                => ['required' => true,  'type' => 'string', 'min' => 1, 'max' => 150],
            'code'                => ['required' => true,  'type' => 'string', 'min' => 1, 'max' => 30],
            'description'         => ['required' => false, 'type' => 'string', 'max' => 1000],
            'interest_method'     => ['required' => true,  'type' => 'string', 'in' => array_column(DepositInterestMethod::cases(), 'value')],
            'interest_rate'       => ['required' => false, 'type' => 'string', 'default' => '0.000000'],
            'withdrawal_policy'   => ['required' => true,  'type' => 'string', 'in' => array_column(DepositWithdrawalPolicy::cases(), 'value')],
            'min_balance'         => ['required' => false, 'type' => 'string', 'default' => '0.00'],
            'min_opening_balance' => ['required' => false, 'type' => 'string', 'default' => '0.00'],
            'dormancy_days'       => ['required' => false, 'type' => 'int',    'default' => 180],
            'is_active'           => ['required' => false, 'type' => 'bool',   'default' => true],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);

        if ($this->repo->codeExists($v['clean']['code'])) {
            return $this->validationError(['code' => 'Product code already exists']);
        }

        $p = new DepositProduct();
        $p->setName($v['clean']['name']);
        $p->setCode($v['clean']['code']);
        $p->setDescription($v['clean']['description'] ?? null);
        $p->setInterestMethod(DepositInterestMethod::from($v['clean']['interest_method']));
        $p->setInterestRate($v['clean']['interest_rate']);
        $p->setWithdrawalPolicy(DepositWithdrawalPolicy::from($v['clean']['withdrawal_policy']));
        $p->setMinBalance($v['clean']['min_balance']);
        $p->setMinOpeningBalance($v['clean']['min_opening_balance']);
        $p->setDormancyDays($v['clean']['dormancy_days']);
        $p->setIsActive($v['clean']['is_active']);

        $this->repo->save($p);
        $this->audit->logCreate($request->getAttribute('user_id'), 'DepositProduct', $p->getId(), $p->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($p->toArray(), 'Deposit product created successfully');
    }
}
