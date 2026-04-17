<?php
declare(strict_types=1);
namespace App\Action\Department;
use App\Domain\Entity\{Department, User};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateDepartmentAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface {
        $dept = $this->em->find(Department::class, $args['id'] ?? '');
        if (!$dept) return $this->notFound('Department not found');
        $data = (array) ($request->getParsedBody() ?? []);
        if (isset($data['name'])) $dept->setName($data['name']);
        if (isset($data['code'])) $dept->setCode($data['code']);
        if (array_key_exists('description', $data)) $dept->setDescription($data['description']);
        if (array_key_exists('head_id', $data)) { $dept->setHead($data['head_id'] ? $this->em->find(User::class, $data['head_id']) : null); }
        if (isset($data['is_active'])) $dept->setIsActive((bool) $data['is_active']);
        $this->em->flush();
        return $this->success($dept->toArray(), 'Department updated');
    }
}
