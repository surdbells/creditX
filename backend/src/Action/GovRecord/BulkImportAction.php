<?php
declare(strict_types=1);
namespace App\Action\GovRecord;

use App\Domain\Repository\RecordTypeRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, BulkImportService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class BulkImportAction
{
    use ApiResponse;
    public function __construct(
        private readonly RecordTypeRepository $typeRepo,
        private readonly BulkImportService $importService,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $uploadedFiles = $request->getUploadedFiles();
        $file = $uploadedFiles['file'] ?? null;
        if ($file === null || $file->getError() !== UPLOAD_ERR_OK) {
            return $this->validationError(['file' => 'CSV file is required']);
        }

        $params = $request->getParsedBody() ?? [];
        $recordTypeId = $params['record_type_id'] ?? '';
        if ($recordTypeId === '') {
            // Try query params
            $recordTypeId = $request->getQueryParams()['record_type_id'] ?? '';
        }
        if ($recordTypeId === '') return $this->validationError(['record_type_id' => 'Record type ID is required']);

        $recordType = $this->typeRepo->find($recordTypeId);
        if ($recordType === null) return $this->validationError(['record_type_id' => 'Record type not found']);
        if (!$recordType->isActive()) return $this->error('Record type is inactive', 400);

        $upsert = filter_var($params['upsert'] ?? 'true', FILTER_VALIDATE_BOOLEAN);

        // Save uploaded file temporarily
        $tmpPath = sys_get_temp_dir() . '/creditx_import_' . bin2hex(random_bytes(8)) . '.csv';
        $file->moveTo($tmpPath);

        try {
            $parsed = $this->importService->parseCsv($tmpPath);
            $result = $this->importService->importRecords($parsed['rows'], $recordType, $upsert);
        } catch (\RuntimeException $e) {
            @unlink($tmpPath);
            return $this->error('Import failed: ' . $e->getMessage(), 400);
        } finally {
            @unlink($tmpPath);
        }

        $this->audit->logCreate(
            $request->getAttribute('user_id'), 'BulkImport', 'batch',
            ['record_type' => $recordType->getCode(), 'imported' => $result['imported'], 'updated' => $result['updated'], 'skipped' => $result['skipped']],
            $this->getClientIp($request), $this->getUserAgent($request)
        );

        return $this->success($result, 'Import completed');
    }
}
