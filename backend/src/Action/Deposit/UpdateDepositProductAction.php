<?php
declare(strict_types=1);
namespace App\Action\Deposit;

use App\Domain\Enum\{DepositInterestMethod, DepositWithdrawalPolicy};
use App\Domain\Repository\DepositProductRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * PUT /api/deposits/products/{id} — update a deposit product.
 * Gated by deposits.create.
 */
final class UpdateDepositProductAction
{
    use ApiResponse;

    public function __construct(
        private readonly DepositProductRepository $repo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $p = $this->repo->find($args['id'] ?? '');
        if ($p === null) return $this->notFound('Deposit product not found');

        $before = $p->toArray();
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'name'                => ['required' => false, 'type' => 'string', 'min' => 1, 'max' => 150],
            'code'                => ['required' => false, 'type' => 'string', 'min' => 1, 'max' => 30],
            'description'         => ['required' => false, 'type' => 'string', 'max' => 1000],
            'interest_method'     => ['required' => false, 'type' => 'string', 'in' => array_column(DepositInterestMethod::cases(), 'value')],
            'interest_rate'       => ['required' => false, 'type' => 'string'],
            'withdrawal_policy'   => ['required' => false, 'type' => 'string', 'in' => array_column(DepositWithdrawalPolicy::cases(), 'value')],
            'min_balance'         => ['required' => false, 'type' => 'string'],
            'min_opening_balance' => ['required' => false, 'type' => 'string'],
            'dormancy_days'       => ['required' => false, 'type' => 'int'],
            'is_active'           => ['required' => false, 'type' => 'bool'],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);
        $c = $v['clean'];

        if (isset($c['code']) && $c['code'] !== $p->getCode() && $this->repo->codeExists($c['code'], $p->getId())) {
            return $this->validationError(['code' => 'Product code already exists']);
        }

        if (isset($c['name']))                $p->setName($c['name']);
        if (isset($c['code']))                $p->setCode($c['code']);
        if (isset($c['description']))         $p->setDescription($c['description']);
        if (isset($c['interest_method']))     $p->setInterestMethod(DepositInterestMethod::from($c['interest_method']));
        if (isset($c['interest_rate']))       $p->setInterestRate($c['interest_rate']);
        if (isset($c['withdrawal_policy']))   $p->setWithdrawalPolicy(DepositWithdrawalPolicy::from($c['withdrawal_policy']));
        if (isset($c['min_balance']))         $p->setMinBalance($c['min_balance']);
        if (isset($c['min_opening_balance'])) $p->setMinOpeningBalance($c['min_opening_balance']);
        if (isset($c['dormancy_days']))       $p->setDormancyDays($c['dormancy_days']);
        if (isset($c['is_active']))           $p->setIsActive($c['is_active']);

        $this->repo->flush();
        $this->audit->logUpdate($request->getAttribute('user_id'), 'DepositProduct', $p->getId(), $before, $p->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($p->toArray(), 'Deposit product updated successfully');
    }
}
