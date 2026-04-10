<?php
declare(strict_types=1);
namespace App\Action\GovRecord;

use App\Domain\Repository\{GovernmentRecordRepository, RecordTypeRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UpdateGovRecordAction
{
    use ApiResponse;
    public function __construct(
        private readonly GovernmentRecordRepository $recordRepo,
        private readonly RecordTypeRepository $typeRepo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $record = $this->recordRepo->find($args['id'] ?? '');
        if ($record === null) return $this->notFound('Government record not found');

        $old = $record->toArray();
        $data = (array) ($request->getParsedBody() ?? []);

        // If changing staff_id, check uniqueness within record type
        if (isset($data['staff_id']) && trim($data['staff_id']) !== '' && $data['staff_id'] !== $record->getStaffId()) {
            if ($this->recordRepo->staffIdExistsInType($record->getRecordType()->getId(), $data['staff_id'], $record->getId())) {
                return $this->validationError(['staff_id' => 'Staff ID already exists for this record type']);
            }
        }

        $record->fillFromArray($data);
        if (isset($data['is_active'])) $record->setIsActive(filter_var($data['is_active'], FILTER_VALIDATE_BOOLEAN));

        $this->recordRepo->flush();
        $this->audit->logUpdate($request->getAttribute('user_id'), 'GovernmentRecord', $record->getId(), $old, $record->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($record->toArray(), 'Government record updated successfully');
    }
}
