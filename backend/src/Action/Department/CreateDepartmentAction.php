<?php
declare(strict_types=1);
namespace App\Action\Department;
use App\Domain\Entity\{Department, User};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateDepartmentAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
        $data = (array) ($request->getParsedBody() ?? []);
        if (empty($data['name']) || empty($data['code'])) return $this->validationError(['name' => 'Name and code are required']);
        $dept = new Department();
        $dept->setName($data['name']); $dept->setCode($data['code']);
        $dept->setDescription($data['description'] ?? null);
        if (!empty($data['head_id'])) { $head = $this->em->find(User::class, $data['head_id']); if ($head) $dept->setHead($head); }
        $this->em->persist($dept); $this->em->flush();
        return $this->created($dept->toArray(), 'Department created');
    }
}
