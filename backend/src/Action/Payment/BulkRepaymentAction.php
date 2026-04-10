<?php
declare(strict_types=1);
namespace App\Action\Payment;

use App\Infrastructure\Service\{ApiResponse, AuditService, BulkRepaymentService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class BulkRepaymentAction
{
    use ApiResponse;
    public function __construct(
        private readonly BulkRepaymentService $bulkService,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $uploadedFiles = $request->getUploadedFiles();
        $file = $uploadedFiles['file'] ?? null;
        if ($file === null || $file->getError() !== UPLOAD_ERR_OK) {
            return $this->validationError(['file' => 'CSV file is required']);
        }

        $tmpPath = sys_get_temp_dir() . '/creditx_bulk_' . bin2hex(random_bytes(8)) . '.csv';
        $file->moveTo($tmpPath);
        $userId = $request->getAttribute('user_id');

        try {
            $upload = $this->bulkService->process($tmpPath, $file->getClientFilename() ?? 'upload.csv', $userId);
        } catch (\Exception $e) {
            @unlink($tmpPath);
            return $this->error('Bulk upload failed: ' . $e->getMessage(), 400);
        }

        $this->audit->logCreate($userId, 'BulkUpload', $upload->getId(), $upload->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($upload->toArray(), 'Bulk repayment processed');
    }
}
