<?php
declare(strict_types=1);
namespace App\Action\ApprovalWorkflow;

use App\Domain\Entity\{ApprovalCondition, ApprovalStep};
use App\Domain\Enum\{ApprovalMode, ConditionOperator};
use App\Domain\Repository\{ApprovalWorkflowRepository, RoleRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateWorkflowAction
{
    use ApiResponse;
    public function __construct(
        private readonly ApprovalWorkflowRepository $wfRepo,
        private readonly RoleRepository $roleRepo,
        private readonly AuditService $audit,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $wf = $this->wfRepo->find($args['id'] ?? '');
        if ($wf === null) return $this->notFound('Approval workflow not found');

        $old = $wf->toArray();
        $data = (array) ($request->getParsedBody() ?? []);

        if (isset($data['name']) && $data['name'] !== '') $wf->setName($data['name']);
        if (isset($data['mode'])) $wf->setMode(ApprovalMode::from($data['mode']));
        if (isset($data['is_active'])) $wf->setIsActive(filter_var($data['is_active'], FILTER_VALIDATE_BOOLEAN));

        // Replace steps if provided
        if (isset($data['steps']) && is_array($data['steps'])) {
            $wf->clearSteps();
            foreach ($data['steps'] as $i => $stepData) {
                $role = $this->roleRepo->find($stepData['role_id'] ?? '');
                if ($role === null) continue;
                $step = new ApprovalStep();
                $step->setStepOrder($stepData['step_order'] ?? ($i + 1));
                $step->setRole($role);
                $step->setName($stepData['name'] ?? $role->getName() . ' Approval');
                $step->setDescription($stepData['description'] ?? null);
                $step->setIsMandatory(filter_var($stepData['is_mandatory'] ?? true, FILTER_VALIDATE_BOOLEAN));
                $step->setAutoApproveAfterHours(isset($stepData['auto_approve_after_hours']) ? (int) $stepData['auto_approve_after_hours'] : null);
                $step->setSlaHours(isset($stepData['sla_hours']) ? (int) $stepData['sla_hours'] : null);
                $step->setIsConditional(filter_var($stepData['is_conditional'] ?? false, FILTER_VALIDATE_BOOLEAN));
                $wf->addStep($step);
            }
        }

        // Replace conditions if provided
        if (isset($data['conditions']) && is_array($data['conditions'])) {
            $wf->clearConditions();
            $this->em->flush(); // Flush to persist new steps before referencing them
            foreach ($data['conditions'] as $condData) {
                $additionalStep = $this->em->getRepository(ApprovalStep::class)->find($condData['additional_step_id'] ?? '');
                if ($additionalStep === null) continue;
                $cond = new ApprovalCondition();
                $cond->setField($condData['field'] ?? 'amount');
                $cond->setOperator(ConditionOperator::from($condData['operator'] ?? 'gt'));
                $cond->setValue($condData['value'] ?? '0');
                $cond->setAdditionalStep($additionalStep);
                $cond->setIsActive(filter_var($condData['is_active'] ?? true, FILTER_VALIDATE_BOOLEAN));
                $wf->addCondition($cond);
            }
        }

        $this->em->flush();
        $this->audit->logUpdate($request->getAttribute('user_id'), 'ApprovalWorkflow', $wf->getId(), $old, $wf->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($wf->toArray(), 'Approval workflow updated successfully');
    }
}
