<?php
declare(strict_types=1);
namespace App\Action\Location;

use App\Domain\Enum\{AuditAction, LocationType};
use App\Domain\Repository\LocationRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateLocationAction
{
    use ApiResponse;
    public function __construct(private readonly LocationRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loc = $this->repo->find($args['id'] ?? '');
        if ($loc === null) return $this->notFound('Location not found');

        $old = $loc->toArray();
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'name'      => ['required' => false, 'type' => 'string', 'max' => 150],
            'code'      => ['required' => false, 'type' => 'string', 'max' => 20],
            'address'   => ['required' => false, 'type' => 'string', 'max' => 500],
            'state'     => ['required' => false, 'type' => 'string', 'max' => 100],
            'type'      => ['required' => false, 'type' => 'string', 'in' => array_column(LocationType::cases(), 'value')],
            'is_active' => ['required' => false, 'type' => 'bool'],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);
        $c = $v['clean'];

        if (isset($c['code']) && $c['code'] !== null && $this->repo->codeExists($c['code'], $loc->getId())) {
            return $this->validationError(['code' => 'Location code already exists']);
        }

        if (isset($c['name']) && $c['name'] !== null) $loc->setName($c['name']);
        if (isset($c['code']) && $c['code'] !== null) $loc->setCode(strtoupper($c['code']));
        if (array_key_exists('address', $c)) $loc->setAddress($c['address']);
        if (array_key_exists('state', $c)) $loc->setState($c['state']);
        if (isset($c['type']) && $c['type'] !== null) $loc->setType(LocationType::from($c['type']));
        if (isset($c['is_active'])) $loc->setIsActive($c['is_active']);

        $this->repo->flush();
        $this->audit->logUpdate($request->getAttribute('user_id'), 'Location', $loc->getId(), $old, $loc->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($loc->toArray(), 'Location updated successfully');
    }
}
