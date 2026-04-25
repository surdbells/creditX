<?php

declare(strict_types=1);

namespace App\Action\Report;

use App\Infrastructure\Service\{ApiResponse, ExportService, GeneralLoanReportService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * General Loan Report endpoint.
 *
 * Modes (controlled by ?format):
 *   - json (default): paginated rows + chart_data + total in one response.
 *     The frontend renders the table from rows[], the 5 charts from
 *     chart_data[], and the pagination from total.
 *   - csv:            full unpaginated rows in legacy 44-column CSV format
 *
 * Filters (all optional):
 *   date_from, date_to, status, branch_id, product_id, agent_id, loan_type
 *
 * Pagination (json mode only):
 *   page (1-based), per_page (default 50, max 200)
 *
 * Skeleton only: Phase 3.1.b/c/d implement the service-layer logic;
 * Phase 3.1.e wires the frontend.
 */
final class GeneralLoanReportAction
{
    use ApiResponse;

    /** Hard ceiling for per_page to avoid accidental memory blowups. */
    private const MAX_PER_PAGE = 200;

    public function __construct(
        private readonly GeneralLoanReportService $service,
        private readonly ExportService $export,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $p = $request->getQueryParams();
        $filters = $this->extractFilters($p);

        if (($p['format'] ?? 'json') === 'csv') {
            return $this->respondCsv($response, $filters);
        }

        return $this->respondJson($p, $filters);
    }

    /**
     * @param array<string, mixed> $p Query params from the request
     * @return array<string, mixed>
     */
    private function extractFilters(array $p): array
    {
        return [
            'date_from'  => $p['date_from']  ?? null,
            'date_to'    => $p['date_to']    ?? null,
            'status'     => $p['status']     ?? null,
            'branch_id'  => $p['branch_id']  ?? null,
            'product_id' => $p['product_id'] ?? null,
            'agent_id'   => $p['agent_id']   ?? null,
            'loan_type'  => $p['loan_type']  ?? null,
        ];
    }

    /**
     * @param array<string, mixed> $p
     * @param array<string, mixed> $filters
     */
    private function respondJson(array $p, array $filters): ResponseInterface
    {
        $page    = max(1, (int) ($p['page'] ?? 1));
        $perPage = min(self::MAX_PER_PAGE, max(1, (int) ($p['per_page'] ?? 50)));
        $offset  = ($page - 1) * $perPage;

        $list   = $this->service->listLoans($filters, $offset, $perPage);
        $charts = $this->service->chartData($filters);

        return $this->success([
            'rows'       => $list['rows'],
            'total'      => $list['total'],
            'page'       => $page,
            'per_page'   => $perPage,
            'chart_data' => $charts,
        ]);
    }

    /**
     * @param array<string, mixed> $filters
     */
    private function respondCsv(ResponseInterface $response, array $filters): ResponseInterface
    {
        $rows = $this->service->exportLoans($filters);

        // Legacy column order — see MONTHLY_GENERAL_REPORT.csv. Headers
        // are quoted in the exact case the legacy export used so that
        // downstream Excel pivot tables and compliance scripts keep
        // working without modification.
        $headers = [
            'date', 'staff_id', 'customer_name', 'mobile', 'gender',
            'date_of_birth', 'mother_maiden_name', 'religion', 'marital_status',
            'address', 'state', 'lga', 'no_of_children', 'bvn',
            'name_of_next_of_kin', 'address_of_next_of_kin', 'relationship',
            'phone_no_of_next_of_kin', 'group_name_employer', 'branch',
            'salary', 'employment_date', 'retirement_date',
            'means_of_identification', 'id_number', 'id_issued_date', 'id_expiry_date',
            'account_name', 'primary_account_no', 'primary_bank_name',
            'loan_type', 'date_issued', 'approved_amount', 'bank_statement_fee',
            'gross_loan_amount', 'net_disbursement', 'top_up_balance',
            'interest_rate', 'repayment_amount', 'first_repayment_date', 'tenor',
            'dsa', 'channel', 'status',
        ];

        $csv = $this->export->toCsv($headers, $rows);
        $response->getBody()->write($csv);

        $ts = date('Ymd-His');
        return $response
            ->withHeader('Content-Type', 'text/csv')
            ->withHeader('Content-Disposition', "attachment; filename=\"general_loan_report_{$ts}.csv\"");
    }
}
