<?php
declare(strict_types=1);
namespace App\Action\Penalty;

use App\Domain\Entity\PenaltyRule;
use App\Domain\Enum\PenaltyCalculationType;
use App\Domain\Repository\{LoanProductRepository, PenaltyRuleRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreatePenaltyRuleAction
{
    use ApiResponse;
    public function __construct(
        private readonly PenaltyRuleRepository $repo,
        private readonly LoanProductRepository $productRepo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'product_id'       => ['required' => true, 'type' => 'string'],
            'name'             => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 100],
            'grace_period_days' => ['required' => false, 'type' => 'int', 'min' => 0, 'default' => 0],
            'calculation_type' => ['required' => true, 'type' => 'string', 'in' => array_column(PenaltyCalculationType::cases(), 'value')],
            'value'            => ['required' => true, 'type' => 'string'],
            'max_amount'       => ['required' => false, 'type' => 'string'],
            'is_compounding'   => ['required' => false, 'type' => 'bool', 'default' => false],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);

        $product = $this->productRepo->find($v['clean']['product_id']);
        if ($product === null) return $this->notFound('Loan product not found');

        $rule = new PenaltyRule();
        $rule->setProduct($product);
        $rule->setName($v['clean']['name']);
        $rule->setGracePeriodDays($v['clean']['grace_period_days']);
        $rule->setCalculationType(PenaltyCalculationType::from($v['clean']['calculation_type']));
        $rule->setValue($v['clean']['value']);
        $rule->setMaxAmount($v['clean']['max_amount'] ?? null);
        $rule->setIsCompounding($v['clean']['is_compounding']);
        $this->repo->save($rule);

        $this->audit->logCreate($request->getAttribute('user_id'), 'PenaltyRule', $rule->getId(), $rule->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($rule->toArray(), 'Penalty rule created successfully');
    }
}
