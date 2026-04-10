<?php
declare(strict_types=1);
namespace App\Action\Location;

use App\Domain\Entity\Location;
use App\Domain\Enum\{AuditAction, LocationType};
use App\Domain\Repository\LocationRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateLocationAction
{
    use ApiResponse;
    public function __construct(private readonly LocationRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'name'    => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 150],
            'code'    => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 20],
            'address' => ['required' => false, 'type' => 'string', 'max' => 500],
            'state'   => ['required' => false, 'type' => 'string', 'max' => 100],
            'type'    => ['required' => false, 'type' => 'string', 'in' => array_column(LocationType::cases(), 'value'), 'default' => LocationType::BRANCH->value],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);

        if ($this->repo->codeExists($v['clean']['code'])) {
            return $this->validationError(['code' => 'Location code already exists']);
        }

        $loc = new Location();
        $loc->setName($v['clean']['name']);
        $loc->setCode(strtoupper($v['clean']['code']));
        $loc->setAddress($v['clean']['address'] ?? null);
        $loc->setState($v['clean']['state'] ?? null);
        $loc->setType(LocationType::from($v['clean']['type'] ?? LocationType::BRANCH->value));
        $this->repo->save($loc);

        $this->audit->logCreate($request->getAttribute('user_id'), 'Location', $loc->getId(), $loc->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($loc->toArray(), 'Location created successfully');
    }
}
