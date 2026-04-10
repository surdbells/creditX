<?php
declare(strict_types=1);
namespace App\Action\Reconciliation;
use App\Infrastructure\Service\{ApiResponse, AuditService, ReconciliationService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class RunReconciliationAction
{
    use ApiResponse;
    public function __construct(private readonly ReconciliationService $service, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $uploadedFiles = $request->getUploadedFiles();
        $file = $uploadedFiles['file'] ?? null;
        if ($file === null || $file->getError() !== UPLOAD_ERR_OK) return $this->validationError(['file' => 'Bank statement CSV is required']);

        $params = (array) ($request->getParsedBody() ?? []);
        $year = $params['year'] ?? date('Y');
        $month = $params['month'] ?? date('m');

        $tmpPath = sys_get_temp_dir() . '/creditx_recon_' . bin2hex(random_bytes(8)) . '.csv';
        $file->moveTo($tmpPath);

        try {
            $recon = $this->service->reconcile($tmpPath, $year, $month);
        } catch (\Exception $e) {
            @unlink($tmpPath);
            return $this->error('Reconciliation failed: ' . $e->getMessage(), 400);
        } finally {
            @unlink($tmpPath);
        }

        $userId = $request->getAttribute('user_id');
        $this->audit->logCreate($userId, 'Reconciliation', $recon->getId(), $recon->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($recon->toArray(true), 'Reconciliation completed');
    }
}
