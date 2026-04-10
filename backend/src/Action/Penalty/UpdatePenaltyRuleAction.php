<?php
declare(strict_types=1);
namespace App\Action\Penalty;

use App\Domain\Enum\PenaltyCalculationType;
use App\Domain\Repository\PenaltyRuleRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdatePenaltyRuleAction
{
    use ApiResponse;
    public function __construct(private readonly PenaltyRuleRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $rule = $this->repo->find($args['id'] ?? '');
        if ($rule === null) return $this->notFound('Penalty rule not found');

        $old = $rule->toArray();
        $data = (array) ($request->getParsedBody() ?? []);

        if (isset($data['name']) && $data['name'] !== '') $rule->setName($data['name']);
        if (isset($data['grace_period_days'])) $rule->setGracePeriodDays((int) $data['grace_period_days']);
        if (isset($data['calculation_type'])) $rule->setCalculationType(PenaltyCalculationType::from($data['calculation_type']));
        if (isset($data['value'])) $rule->setValue($data['value']);
        if (isset($data['max_amount'])) $rule->setMaxAmount($data['max_amount']);
        if (isset($data['is_compounding'])) $rule->setIsCompounding(filter_var($data['is_compounding'], FILTER_VALIDATE_BOOLEAN));
        if (isset($data['is_active'])) $rule->setIsActive(filter_var($data['is_active'], FILTER_VALIDATE_BOOLEAN));

        $this->repo->flush();
        $this->audit->logUpdate($request->getAttribute('user_id'), 'PenaltyRule', $rule->getId(), $old, $rule->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($rule->toArray(), 'Penalty rule updated successfully');
    }
}
