<?php
declare(strict_types=1);
namespace App\Action\Team;
use App\Domain\Entity\{Team, Department, User};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateTeamAction {
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}
    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface {
        $team = $this->em->find(Team::class, $args['id'] ?? '');
        if (!$team) return $this->notFound('Team not found');
        $data = (array) ($request->getParsedBody() ?? []);
        if (isset($data['name'])) $team->setName($data['name']);
        if (isset($data['code'])) $team->setCode($data['code']);
        if (array_key_exists('description', $data)) $team->setDescription($data['description']);
        if (array_key_exists('department_id', $data)) { $team->setDepartment($data['department_id'] ? $this->em->find(Department::class, $data['department_id']) : null); }
        if (array_key_exists('lead_id', $data)) { $team->setLead($data['lead_id'] ? $this->em->find(User::class, $data['lead_id']) : null); }
        if (isset($data['is_active'])) $team->setIsActive((bool) $data['is_active']);
        $this->em->flush();
        return $this->success($team->toArray(), 'Team updated');
    }
}
