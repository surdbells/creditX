<?php
declare(strict_types=1);
namespace App\Action\Audit;

use App\Domain\Entity\User;
use App\Domain\Repository\AuditLogRepository;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ListAuditLogsAction
{
    use ApiResponse;
    public function __construct(
        private readonly AuditLogRepository $repo,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $pagination = $this->getPaginationParams($params);
        $result = $this->repo->paginated(
            $pagination['offset'], $pagination['per_page'], $pagination['sort_by'], $pagination['sort_dir'],
            $pagination['search'] ?: null,
            $params['user_id'] ?? null, $params['entity_type'] ?? null,
            $params['action'] ?? null, $params['date_from'] ?? null, $params['date_to'] ?? null,
        );
        $items = array_map(fn($a) => $a->toArray(), $result['items']);

        // Backfill user_name for older rows logged before names were snapshotted:
        // resolve any row that has a user_id but no user_name to the user's
        // current name (batch lookup). Rows with a null user_id stay "System".
        $missing = [];
        foreach ($items as $it) {
            if (empty($it['user_name']) && !empty($it['user_id'])) $missing[$it['user_id']] = true;
        }
        if (!empty($missing)) {
            $map = [];
            foreach ($this->em->getRepository(User::class)->findBy(['id' => array_keys($missing)]) as $u) {
                $map[$u->getId()] = $u->getFullName();
            }
            foreach ($items as &$it) {
                if (empty($it['user_name']) && !empty($it['user_id']) && isset($map[$it['user_id']])) {
                    $it['user_name'] = $map[$it['user_id']];
                }
            }
            unset($it);
        }

        return $this->paginated($items, $result['total'], $pagination['page'], $pagination['per_page']);
    }
}
