<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Infrastructure\Service\{ApiResponse, BankReconciliationService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/accounting/bank-reconciliations/{id}/import
 * Body: { rows: [ {value_date, description, reference?, amount}, ... ] }
 *       OR { csv: "value_date,description,reference,amount\n..." }
 *
 * Import statement rows (amount signed: +in / -out). CSV is parsed
 * server-side when provided. Gated by reports.reconciliation.
 */
final class ImportBankStatementAction
{
    use ApiResponse;

    public function __construct(private readonly BankReconciliationService $service) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $b = (array) ($request->getParsedBody() ?? []);
        $rows = is_array($b['rows'] ?? null) ? $b['rows'] : [];

        if (empty($rows) && isset($b['csv']) && is_string($b['csv'])) {
            $rows = $this->parseCsv($b['csv']);
        }
        if (empty($rows)) {
            return $this->error('No statement rows provided', 400);
        }

        try {
            $rec = $this->service->importLines($args['id'] ?? '', $rows);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }
        return $this->success($rec->toArray(true), 'Statement imported');
    }

    /**
     * Parse a simple CSV (header row required) with columns:
     * value_date, description, reference, amount. Amount may use a leading
     * '-' for debits; separate debit/credit columns are not assumed.
     *
     * @return array<int, array>
     */
    private function parseCsv(string $csv): array
    {
        $lines = preg_split('/\r\n|\r|\n/', trim($csv)) ?: [];
        if (count($lines) < 2) return [];
        $header = array_map(fn($h) => strtolower(trim($h)), str_getcsv(array_shift($lines)));
        $idx = array_flip($header);
        $out = [];
        foreach ($lines as $raw) {
            if (trim($raw) === '') continue;
            $cols = str_getcsv($raw);
            $get = fn(string $k) => isset($idx[$k]) && isset($cols[$idx[$k]]) ? trim((string) $cols[$idx[$k]]) : '';
            $out[] = [
                'value_date'  => $get('value_date') ?: $get('date'),
                'description' => $get('description') ?: $get('narration'),
                'reference'   => $get('reference') ?: $get('ref'),
                'amount'      => $get('amount'),
            ];
        }
        return $out;
    }
}
