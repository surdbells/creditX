<?php
declare(strict_types=1);
namespace App\Action\Team;
use App\Domain\Entity\{Team, Department, User};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateTeamAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
        $data = (array) ($request->getParsedBody() ?? []);
        if (empty($data['name']) || empty($data['code'])) return $this->validationError(['name' => 'Name and code are required']);
        $team = new Team();
        $team->setName($data['name']); $team->setCode($data['code']);
        $team->setDescription($data['description'] ?? null);
        if (!empty($data['department_id'])) { $dept = $this->em->find(Department::class, $data['department_id']); if ($dept) $team->setDepartment($dept); }
        if (!empty($data['lead_id'])) { $lead = $this->em->find(User::class, $data['lead_id']); if ($lead) $team->setLead($lead); }
        $this->em->persist($team); $this->em->flush();
        return $this->created($team->toArray(), 'Team created');
    }
}
