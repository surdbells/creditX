<?php
declare(strict_types=1);
namespace App\Action\ApprovalWorkflow;

use App\Domain\Entity\{ApprovalCondition, ApprovalStep, ApprovalWorkflow};
use App\Domain\Enum\{ApprovalMode, ConditionOperator};
use App\Domain\Repository\{ApprovalWorkflowRepository, LoanProductRepository, RoleRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator, SettingsCacheService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateWorkflowAction
{
    use ApiResponse;
    public function __construct(
        private readonly ApprovalWorkflowRepository $wfRepo,
        private readonly LoanProductRepository $productRepo,
        private readonly RoleRepository $roleRepo,
        private readonly SettingsCacheService $settings,
        private readonly AuditService $audit,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);

        // Default mode comes from approval.default_mode (admin-configurable
        // via Settings UI). Fallback to SEQUENTIAL if the setting is
        // missing or holds a value that's no longer a valid ApprovalMode
        // (e.g. an enum case was renamed). The validator's `in` rule
        // still rejects a malformed payload-supplied mode regardless of
        // what the default is.
        $defaultModeRaw = $this->settings->get('approval.default_mode', ApprovalMode::SEQUENTIAL->value);
        $defaultMode = (is_string($defaultModeRaw) && ApprovalMode::tryFrom($defaultModeRaw) !== null)
            ? $defaultModeRaw
            : ApprovalMode::SEQUENTIAL->value;

        $v = InputValidator::validate($data, [
            'product_id' => ['required' => true, 'type' => 'string'],
            'name'       => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 150],
            'mode'       => ['required' => false, 'type' => 'string', 'in' => array_column(ApprovalMode::cases(), 'value'), 'default' => $defaultMode],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);

        $product = $this->productRepo->find($v['clean']['product_id']);
        if ($product === null) return $this->notFound('Loan product not found');

        // Check if workflow already exists for this product
        $existing = $this->wfRepo->findByProductId($product->getId());
        if ($existing !== null) return $this->error('A workflow already exists for this product. Update or delete it first.', 400);

        $wf = new ApprovalWorkflow();
        $wf->setProduct($product);
        $wf->setName($v['clean']['name']);
        $wf->setMode(ApprovalMode::from($v['clean']['mode']));

        // Add steps
        if (isset($data['steps']) && is_array($data['steps'])) {
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

        $this->em->persist($wf);
        $this->em->flush();

        // Add conditions (need step IDs from persisted steps). The admin UI
        // references the target step by its position in the steps array
        // (additional_step_index) because newly-created steps have no client-
        // known ID yet; additional_step_id remains supported for API/seed use.
        if (isset($data['conditions']) && is_array($data['conditions'])) {
            $orderedSteps = array_values($wf->getSteps()->toArray());
            foreach ($data['conditions'] as $condData) {
                $additionalStep = $this->resolveAdditionalStep($condData, $orderedSteps);
                if ($additionalStep === null) continue;

                $field = $condData['field'] ?? 'amount';
                if (!in_array($field, ApprovalCondition::allowedFields(), true)) continue;

                $cond = new ApprovalCondition();
                $cond->setField($field);
                $cond->setOperator(ConditionOperator::from($condData['operator'] ?? 'gt'));
                $cond->setValue((string) ($condData['value'] ?? '0'));
                $cond->setAdditionalStep($additionalStep);
                $cond->setIsActive(filter_var($condData['is_active'] ?? true, FILTER_VALIDATE_BOOLEAN));
                $wf->addCondition($cond);
            }
            $this->em->flush();
        }

        $this->audit->logCreate($request->getAttribute('user_id'), 'ApprovalWorkflow', $wf->getId(), $wf->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($wf->toArray(), 'Approval workflow created successfully');
    }

    /**
     * Resolve a condition's target step from either a 0-based index into
     * the just-persisted steps (preferred for newly-built workflows) or an
     * explicit step ID.
     *
     * @param array<int, ApprovalStep> $orderedSteps
     */
    private function resolveAdditionalStep(array $condData, array $orderedSteps): ?ApprovalStep
    {
        if (isset($condData['additional_step_index']) && is_numeric($condData['additional_step_index'])) {
            return $orderedSteps[(int) $condData['additional_step_index']] ?? null;
        }
        if (!empty($condData['additional_step_id'])) {
            return $this->em->getRepository(ApprovalStep::class)->find($condData['additional_step_id']);
        }
        return null;
    }
}
