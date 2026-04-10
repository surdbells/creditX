<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Enum\LoanStatus;
use Doctrine\ORM\EntityManagerInterface;

final class ReportingService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {
    }

    /**
     * Portfolio dashboard summary.
     */
    public function portfolioDashboard(?string $dateFrom = null, ?string $dateTo = null, ?string $branchId = null, ?string $productId = null): array
    {
        $conn = $this->em->getConnection();

        $where = '1=1';
        $params = [];
        if ($dateFrom) { $where .= " AND l.created_at >= :df"; $params['df'] = $dateFrom; }
        if ($dateTo) { $where .= " AND l.created_at <= :dt"; $params['dt'] = $dateTo . ' 23:59:59'; }
        if ($branchId) { $where .= " AND l.branch_id = :bid"; $params['bid'] = $branchId; }
        if ($productId) { $where .= " AND l.product_id = :pid"; $params['pid'] = $productId; }

        $statusCounts = $conn->fetchAllAssociative(
            "SELECT status, COUNT(*) as count, COALESCE(SUM(CAST(amount_requested AS NUMERIC)), 0) as total_amount FROM loans l WHERE {$where} GROUP BY status ORDER BY count DESC",
            $params
        );

        $totalDisbursed = $conn->fetchOne("SELECT COALESCE(SUM(CAST(net_disbursed AS NUMERIC)), 0) FROM loans l WHERE status IN ('active','overdue','closed','written_off','restructured') AND {$where}", $params);
        $totalOutstanding = $conn->fetchOne("SELECT COALESCE(SUM(CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)), 0) FROM repayment_schedules rs INNER JOIN loans l ON rs.loan_id = l.id WHERE rs.status IN ('pending','partial','overdue') AND {$where}", $params);
        $totalCollected = $conn->fetchOne("SELECT COALESCE(SUM(CAST(p.amount AS NUMERIC)), 0) FROM payments p INNER JOIN loans l ON p.loan_id = l.id WHERE p.status = 'success' AND {$where}", $params);

        $collectionRate = (float) $totalDisbursed > 0 ? round(((float) $totalCollected / (float) $totalDisbursed) * 100, 2) : 0;
        $avgLoanSize = $conn->fetchOne("SELECT COALESCE(AVG(CAST(amount_requested AS NUMERIC)), 0) FROM loans l WHERE status NOT IN ('draft','cancelled') AND {$where}", $params);

        return [
            'status_breakdown' => $statusCounts,
            'total_disbursed' => number_format((float) $totalDisbursed, 2, '.', ''),
            'total_outstanding' => number_format((float) $totalOutstanding, 2, '.', ''),
            'total_collected' => number_format((float) $totalCollected, 2, '.', ''),
            'collection_rate' => $collectionRate,
            'average_loan_size' => number_format((float) $avgLoanSize, 2, '.', ''),
        ];
    }

    /**
     * Portfolio at Risk (PAR) with aging buckets.
     */
    public function parReport(?string $productId = null, ?string $branchId = null): array
    {
        $conn = $this->em->getConnection();

        $where = "l.status IN ('active','overdue')";
        $params = [];
        if ($productId) { $where .= " AND l.product_id = :pid"; $params['pid'] = $productId; }
        if ($branchId) { $where .= " AND l.branch_id = :bid"; $params['bid'] = $branchId; }

        $sql = "
            SELECT
                CASE
                    WHEN CURRENT_DATE - rs.due_date <= 0 THEN 'current'
                    WHEN CURRENT_DATE - rs.due_date BETWEEN 1 AND 30 THEN '1_30'
                    WHEN CURRENT_DATE - rs.due_date BETWEEN 31 AND 60 THEN '31_60'
                    WHEN CURRENT_DATE - rs.due_date BETWEEN 61 AND 90 THEN '61_90'
                    ELSE '90_plus'
                END as bucket,
                COUNT(DISTINCT l.id) as loan_count,
                COALESCE(SUM(CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)), 0) as outstanding
            FROM repayment_schedules rs
            INNER JOIN loans l ON rs.loan_id = l.id
            WHERE rs.status IN ('pending','partial','overdue') AND {$where}
            GROUP BY bucket
            ORDER BY bucket
        ";

        $buckets = $conn->fetchAllAssociative($sql, $params);

        $totalOutstanding = $conn->fetchOne("SELECT COALESCE(SUM(CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)), 0) FROM repayment_schedules rs INNER JOIN loans l ON rs.loan_id = l.id WHERE rs.status IN ('pending','partial','overdue') AND {$where}", $params);
        $overdueOutstanding = $conn->fetchOne("SELECT COALESCE(SUM(CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)), 0) FROM repayment_schedules rs INNER JOIN loans l ON rs.loan_id = l.id WHERE rs.status IN ('partial','overdue') AND rs.due_date < CURRENT_DATE AND {$where}", $params);

        $parRatio = (float) $totalOutstanding > 0 ? round(((float) $overdueOutstanding / (float) $totalOutstanding) * 100, 2) : 0;

        return [
            'buckets' => $buckets,
            'total_outstanding' => number_format((float) $totalOutstanding, 2, '.', ''),
            'overdue_outstanding' => number_format((float) $overdueOutstanding, 2, '.', ''),
            'par_ratio' => $parRatio,
        ];
    }

    /**
     * Agent (DSA) performance report.
     */
    public function agentPerformance(?string $dateFrom = null, ?string $dateTo = null, ?string $locationId = null): array
    {
        $conn = $this->em->getConnection();

        $where = 'l.agent_id IS NOT NULL';
        $params = [];
        if ($dateFrom) { $where .= " AND l.created_at >= :df"; $params['df'] = $dateFrom; }
        if ($dateTo) { $where .= " AND l.created_at <= :dt"; $params['dt'] = $dateTo . ' 23:59:59'; }
        if ($locationId) { $where .= " AND l.branch_id = :lid"; $params['lid'] = $locationId; }

        $sql = "
            SELECT u.id as agent_id, u.first_name || ' ' || u.last_name as agent_name,
                COUNT(*) as total_loans,
                SUM(CASE WHEN l.status = 'captured' THEN 1 ELSE 0 END) as captured,
                SUM(CASE WHEN l.status = 'submitted' THEN 1 ELSE 0 END) as submitted,
                SUM(CASE WHEN l.status = 'approved' THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN l.status IN ('disbursed','active','overdue','closed') THEN 1 ELSE 0 END) as disbursed,
                SUM(CASE WHEN l.status = 'rejected' THEN 1 ELSE 0 END) as rejected,
                COALESCE(SUM(CAST(l.amount_requested AS NUMERIC)), 0) as total_amount_requested,
                COALESCE(SUM(CASE WHEN l.status IN ('disbursed','active','overdue','closed') THEN CAST(l.net_disbursed AS NUMERIC) ELSE 0 END), 0) as total_disbursed
            FROM loans l
            INNER JOIN users u ON l.agent_id = u.id
            WHERE {$where}
            GROUP BY u.id, u.first_name, u.last_name
            ORDER BY total_disbursed DESC
        ";

        return $conn->fetchAllAssociative($sql, $params);
    }

    /**
     * Branch performance report.
     */
    public function branchPerformance(?string $dateFrom = null, ?string $dateTo = null): array
    {
        $conn = $this->em->getConnection();

        $where = 'l.branch_id IS NOT NULL';
        $params = [];
        if ($dateFrom) { $where .= " AND l.created_at >= :df"; $params['df'] = $dateFrom; }
        if ($dateTo) { $where .= " AND l.created_at <= :dt"; $params['dt'] = $dateTo . ' 23:59:59'; }

        $sql = "
            SELECT loc.id as branch_id, loc.name as branch_name, loc.code as branch_code,
                COUNT(*) as total_applications,
                SUM(CASE WHEN l.status IN ('approved','disbursed','active','overdue','closed') THEN 1 ELSE 0 END) as approvals,
                SUM(CASE WHEN l.status IN ('disbursed','active','overdue','closed') THEN 1 ELSE 0 END) as disbursements,
                COALESCE(SUM(CASE WHEN l.status IN ('disbursed','active','overdue','closed') THEN CAST(l.net_disbursed AS NUMERIC) ELSE 0 END), 0) as total_disbursed
            FROM loans l
            INNER JOIN locations loc ON l.branch_id = loc.id
            WHERE {$where}
            GROUP BY loc.id, loc.name, loc.code
            ORDER BY total_disbursed DESC
        ";

        return $conn->fetchAllAssociative($sql, $params);
    }

    /**
     * Product performance report.
     */
    public function productPerformance(?string $dateFrom = null, ?string $dateTo = null): array
    {
        $conn = $this->em->getConnection();

        $where = '1=1';
        $params = [];
        if ($dateFrom) { $where .= " AND l.created_at >= :df"; $params['df'] = $dateFrom; }
        if ($dateTo) { $where .= " AND l.created_at <= :dt"; $params['dt'] = $dateTo . ' 23:59:59'; }

        $sql = "
            SELECT lp.id as product_id, lp.name as product_name, lp.code as product_code,
                COUNT(*) as total_loans,
                SUM(CASE WHEN l.status IN ('disbursed','active','overdue','closed') THEN 1 ELSE 0 END) as disbursed_count,
                COALESCE(SUM(CAST(l.amount_requested AS NUMERIC)), 0) as total_requested,
                COALESCE(SUM(CASE WHEN l.status IN ('disbursed','active','overdue','closed') THEN CAST(l.net_disbursed AS NUMERIC) ELSE 0 END), 0) as total_disbursed
            FROM loans l
            INNER JOIN loan_products lp ON l.product_id = lp.id
            WHERE {$where}
            GROUP BY lp.id, lp.name, lp.code
            ORDER BY total_disbursed DESC
        ";

        return $conn->fetchAllAssociative($sql, $params);
    }

    /**
     * Expected vs actual repayments report.
     */
    public function receivablesReport(?string $yearMonth = null, ?string $productId = null): array
    {
        $conn = $this->em->getConnection();

        $ym = $yearMonth ?? date('Y-m');
        $parts = explode('-', $ym);
        $year = $parts[0];
        $month = str_pad($parts[1] ?? date('m'), 2, '0', STR_PAD_LEFT);

        $where = "EXTRACT(YEAR FROM rs.due_date) = :y AND EXTRACT(MONTH FROM rs.due_date) = :m";
        $params = ['y' => $year, 'm' => $month];
        if ($productId) { $where .= " AND l.product_id = :pid"; $params['pid'] = $productId; }

        $sql = "
            SELECT
                COALESCE(SUM(CAST(rs.total_amount AS NUMERIC)), 0) as expected,
                COALESCE(SUM(CAST(rs.paid_amount AS NUMERIC)), 0) as actual,
                COUNT(*) as total_installments,
                SUM(CASE WHEN rs.status = 'paid' THEN 1 ELSE 0 END) as paid_count,
                SUM(CASE WHEN rs.status = 'overdue' THEN 1 ELSE 0 END) as overdue_count
            FROM repayment_schedules rs
            INNER JOIN loans l ON rs.loan_id = l.id
            WHERE {$where}
        ";

        $result = $conn->fetchAssociative($sql, $params);
        $expected = (float) ($result['expected'] ?? 0);
        $actual = (float) ($result['actual'] ?? 0);

        return array_merge($result ?? [], [
            'variance' => number_format($expected - $actual, 2, '.', ''),
            'collection_rate' => $expected > 0 ? round(($actual / $expected) * 100, 2) : 0,
            'period' => $ym,
        ]);
    }

    /**
     * Closed loans report.
     */
    public function closedLoans(?string $dateFrom = null, ?string $dateTo = null, ?string $productId = null): array
    {
        $conn = $this->em->getConnection();

        $where = "l.status IN ('closed','written_off')";
        $params = [];
        if ($dateFrom) { $where .= " AND l.closed_at >= :df"; $params['df'] = $dateFrom; }
        if ($dateTo) { $where .= " AND l.closed_at <= :dt"; $params['dt'] = $dateTo . ' 23:59:59'; }
        if ($productId) { $where .= " AND l.product_id = :pid"; $params['pid'] = $productId; }

        return $conn->fetchAllAssociative(
            "SELECT l.id, l.application_id, c.full_name as customer_name, c.staff_id,
                    l.amount_requested, l.net_disbursed, l.status, l.closed_at,
                    lp.name as product_name
             FROM loans l
             INNER JOIN customers c ON l.customer_id = c.id
             INNER JOIN loan_products lp ON l.product_id = lp.id
             WHERE {$where}
             ORDER BY l.closed_at DESC LIMIT 500",
            $params
        );
    }

    /**
     * CBN Loan Portfolio Report.
     */
    public function cbnPortfolioReport(): array
    {
        $conn = $this->em->getConnection();
        return $conn->fetchAllAssociative(
            "SELECT c.full_name as customer_name, c.staff_id,
                    l.amount_requested as loan_amount,
                    COALESCE(SUM(CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)), 0) as outstanding,
                    COALESCE(MAX(CURRENT_DATE - rs.due_date), 0) as days_past_due,
                    l.status
             FROM loans l
             INNER JOIN customers c ON l.customer_id = c.id
             LEFT JOIN repayment_schedules rs ON rs.loan_id = l.id AND rs.status IN ('pending','partial','overdue')
             WHERE l.status IN ('active','overdue','disbursed')
             GROUP BY l.id, c.full_name, c.staff_id, l.amount_requested, l.status
             ORDER BY c.full_name"
        );
    }

    /**
     * CBN NPL Report (non-performing loans, 90+ days past due).
     */
    public function cbnNplReport(): array
    {
        $conn = $this->em->getConnection();
        return $conn->fetchAllAssociative(
            "SELECT l.id as loan_id, l.application_id, c.full_name as customer_name, c.staff_id,
                    COALESCE(SUM(CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)), 0) as outstanding,
                    MAX(CURRENT_DATE - rs.due_date) as days_past_due
             FROM loans l
             INNER JOIN customers c ON l.customer_id = c.id
             INNER JOIN repayment_schedules rs ON rs.loan_id = l.id
             WHERE l.status IN ('active','overdue') AND rs.status = 'overdue' AND (CURRENT_DATE - rs.due_date) > 90
             GROUP BY l.id, l.application_id, c.full_name, c.staff_id
             ORDER BY days_past_due DESC"
        );
    }

    /**
     * CBN Aging Report (bucket summary).
     */
    public function cbnAgingReport(): array
    {
        return $this->parReport();
    }
}
