<?php
declare(strict_types=1);
namespace App\Action\ApprovalWorkflow;

use App\Domain\Entity\{LoanProduct, Role};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/approval-workflows/meta
 *
 * Returns the products + roles the workflow builder needs to populate its
 * product and per-step role dropdowns. Gated by the workflow permission
 * (products.view) rather than roles.view, so a workflow manager can build and
 * edit workflows without also holding role-management rights — which was why
 * the step role dropdown came back empty and steps couldn't resolve.
 */
final class GetWorkflowMetaAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $products = array_map(
            fn(LoanProduct $p) => ['id' => $p->getId(), 'name' => $p->getName()],
            $this->em->getRepository(LoanProduct::class)->findBy([], ['name' => 'ASC'])
        );
        $roles = array_map(
            fn(Role $r) => ['id' => $r->getId(), 'name' => $r->getName(), 'slug' => $r->getSlug()],
            $this->em->getRepository(Role::class)->findBy([], ['name' => 'ASC'])
        );

        return $this->success(['products' => $products, 'roles' => $roles]);
    }
}
