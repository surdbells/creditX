<?php
declare(strict_types=1);
namespace App\Action\RecordType;

use App\Domain\Entity\RecordType;
use App\Domain\Repository\RecordTypeRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateRecordTypeAction
{
    use ApiResponse;
    public function __construct(private readonly RecordTypeRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'name'             => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 100],
            'code'             => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 50],
            'description'      => ['required' => false, 'type' => 'string', 'max' => 500],
            'field_config'     => ['required' => false, 'type' => 'array'],
            'eligibility_rules' => ['required' => false, 'type' => 'array'],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);

        if ($this->repo->codeExists($v['clean']['code'])) return $this->validationError(['code' => 'Record type code already exists']);

        $rt = new RecordType();
        $rt->setName($v['clean']['name']);
        $rt->setCode($v['clean']['code']);
        $rt->setDescription($v['clean']['description'] ?? null);
        $rt->setFieldConfig($v['clean']['field_config'] ?? null);
        $rt->setEligibilityRules($v['clean']['eligibility_rules'] ?? null);
        $this->repo->save($rt);

        $this->audit->logCreate($request->getAttribute('user_id'), 'RecordType', $rt->getId(), $rt->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($rt->toArray(), 'Record type created successfully');
    }
}
