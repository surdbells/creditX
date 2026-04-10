<?php
declare(strict_types=1);
namespace App\Action\GovRecord;

use App\Domain\Entity\GovernmentRecord;
use App\Domain\Repository\{GovernmentRecordRepository, RecordTypeRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateGovRecordAction
{
    use ApiResponse;
    public function __construct(
        private readonly GovernmentRecordRepository $recordRepo,
        private readonly RecordTypeRepository $typeRepo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'record_type_id' => ['required' => true, 'type' => 'string'],
            'staff_id'       => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 50],
            'employee_name'  => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 200],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);

        $type = $this->typeRepo->find($v['clean']['record_type_id']);
        if ($type === null) return $this->validationError(['record_type_id' => 'Record type not found']);
        if (!$type->isActive()) return $this->error('Record type is inactive', 400);

        if ($this->recordRepo->staffIdExistsInType($type->getId(), $v['clean']['staff_id'])) {
            return $this->validationError(['staff_id' => 'Staff ID already exists for this record type']);
        }

        $record = new GovernmentRecord();
        $record->setRecordType($type);
        $record->fillFromArray($data);
        $this->recordRepo->save($record);

        $this->audit->logCreate($request->getAttribute('user_id'), 'GovernmentRecord', $record->getId(), $record->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($record->toArray(), 'Government record created successfully');
    }
}
