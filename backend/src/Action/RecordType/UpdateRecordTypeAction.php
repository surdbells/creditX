<?php
declare(strict_types=1);
namespace App\Action\RecordType;

use App\Domain\Repository\RecordTypeRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateRecordTypeAction
{
    use ApiResponse;
    public function __construct(private readonly RecordTypeRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $rt = $this->repo->find($args['id'] ?? '');
        if ($rt === null) return $this->notFound('Record type not found');
        $old = $rt->toArray();
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'name' => ['required' => false, 'type' => 'string', 'max' => 100],
            'code' => ['required' => false, 'type' => 'string', 'max' => 50],
            'description' => ['required' => false, 'type' => 'string', 'max' => 500],
            'field_config' => ['required' => false, 'type' => 'array'],
            'eligibility_rules' => ['required' => false, 'type' => 'array'],
            'is_active' => ['required' => false, 'type' => 'bool'],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);
        $c = $v['clean'];

        if (isset($c['code']) && $c['code'] !== null && $this->repo->codeExists($c['code'], $rt->getId())) return $this->validationError(['code' => 'Record type code already exists']);

        if (isset($c['name']) && $c['name'] !== null) $rt->setName($c['name']);
        if (isset($c['code']) && $c['code'] !== null) $rt->setCode($c['code']);
        if (array_key_exists('description', $c)) $rt->setDescription($c['description']);
        if (array_key_exists('field_config', $c)) $rt->setFieldConfig($c['field_config']);
        if (array_key_exists('eligibility_rules', $c)) $rt->setEligibilityRules($c['eligibility_rules']);
        if (isset($c['is_active'])) $rt->setIsActive($c['is_active']);

        $this->repo->flush();
        $this->audit->logUpdate($request->getAttribute('user_id'), 'RecordType', $rt->getId(), $old, $rt->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($rt->toArray(), 'Record type updated successfully');
    }
}
