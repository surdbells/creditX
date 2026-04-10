<?php
declare(strict_types=1);
namespace App\Action\ApprovalWorkflow;

use App\Domain\Entity\{ApprovalCondition, ApprovalStep, ApprovalWorkflow};
use App\Domain\Enum\{ApprovalMode, ConditionOperator};
use App\Domain\Repository\{ApprovalWorkflowRepository, LoanProductRepository, RoleRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateWorkflowAction
{
    use ApiResponse;
    public function __construct(
        private readonly ApprovalWorkflowRepository $wfRepo,
        private readonly LoanProductRepository $productRepo,
        private readonly RoleRepository $roleRepo,
        private readonly AuditService $audit,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'product_id' => ['required' => true, 'type' => 'string'],
            'name'       => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 150],
            'mode'       => ['required' => false, 'type' => 'string', 'in' => array_column(ApprovalMode::cases(), 'value'), 'default' => ApprovalMode::SEQUENTIAL->value],
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

        // Add conditions (need step IDs from persisted steps)
        if (isset($data['conditions']) && is_array($data['conditions'])) {
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
            $this->em->flush();
        }

        $this->audit->logCreate($request->getAttribute('user_id'), 'ApprovalWorkflow', $wf->getId(), $wf->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($wf->toArray(), 'Approval workflow created successfully');
    }
}
