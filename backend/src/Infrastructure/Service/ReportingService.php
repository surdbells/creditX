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
    /**
     * Agent performance report.
     *
     * Returns a structured payload:
     *
     *   {
     *     summary:   { total_loans, total_amount_requested, total_disbursed,
     *                  active_agents, approval_rate, avg_ticket_size },
     *     by_agent:  [ { agent_id, agent_name, total_loans, ..., total_disbursed } ],
     *     details:   []   // populated only on drill-down (see $agentId)
     *   }
     *
     * Filters:
     *   - $dateFrom / $dateTo:       applied to summary + by_agent (l.created_at)
     *   - $locationId (branch):      applied to summary + by_agent
     *   - $statusRaw (string[]|null): applied ONLY to $details when drilled.
     *     Top-level rollups intentionally ignore the status filter so operators
     *     can see "1,000 loans: 800 approved, 750 disbursed" while filtering
     *     the drill view to e.g. rejected loans only. This is the Q2 decision
     *     from the Phase 2.2 plan.
     *
     * Drill:
     *   When $agentId is provided, $details is populated with that agent's
     *   individual loans (respecting all filters including status). The
     *   summary and by_agent arrays still reflect the unfiltered-by-status
     *   rollups — they don't change when you drill.
     */
    public function agentPerformance(
        ?string $dateFrom = null,
        ?string $dateTo = null,
        ?string $locationId = null,
        ?array $statusRaw = null,
        ?string $agentId = null
    ): array {
        $conn = $this->em->getConnection();

        // Base filter shared by summary + by_agent (NO status filter here — Q2)
        $where = 'l.agent_id IS NOT NULL';
        $params = [];
        if ($dateFrom)   { $where .= " AND l.created_at >= :df"; $params['df'] = $dateFrom; }
        if ($dateTo)     { $where .= " AND l.created_at <= :dt"; $params['dt'] = $dateTo . ' 23:59:59'; }
        if ($locationId) { $where .= " AND l.branch_id = :lid"; $params['lid'] = $locationId; }

        // ── by_agent rollup ──
        $byAgentSql = "
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
        $byAgent = $conn->fetchAllAssociative($byAgentSql, $params);

        // Frontend chart consumer expects `count` and `amount` — map for compat.
        foreach ($byAgent as &$row) {
            $row['count']  = (int) $row['total_loans'];
            $row['amount'] = (float) $row['total_disbursed'];
            $row['name']   = $row['agent_name'];
        }
        unset($row);

        // ── summary ──
        $summary = [
            'total_loans'            => array_sum(array_column($byAgent, 'count')),
            'total_amount_requested' => array_sum(array_column($byAgent, 'total_amount_requested')),
            'total_disbursed'        => array_sum(array_column($byAgent, 'amount')),
            'active_agents'          => count($byAgent),
        ];
        $approved = array_sum(array_column($byAgent, 'approved'))
                  + array_sum(array_column($byAgent, 'disbursed'));
        $summary['approval_rate']  = $summary['total_loans'] > 0
            ? round(($approved / $summary['total_loans']) * 100, 2) : 0;
        $summary['avg_ticket_size'] = $summary['total_loans'] > 0
            ? round($summary['total_amount_requested'] / $summary['total_loans'], 2) : 0;

        // ── details (drill) ──
        $details = [];
        if ($agentId !== null) {
            $details = $this->fetchAgentLoans($agentId, $dateFrom, $dateTo, $locationId, $statusRaw);
        }

        return [
            'summary'  => $summary,
            'by_agent' => $byAgent,
            'details'  => $details,
        ];
    }

    /**
     * Fetch a single agent's loans for drill-down.
     * Applies date/location/status filters.
     */
    private function fetchAgentLoans(
        string $agentId,
        ?string $dateFrom,
        ?string $dateTo,
        ?string $locationId,
        ?array $statusRaw
    ): array {
        $conn = $this->em->getConnection();

        $where = 'l.agent_id = :aid';
        $params = ['aid' => $agentId];
        if ($dateFrom)   { $where .= " AND l.created_at >= :df"; $params['df'] = $dateFrom; }
        if ($dateTo)     { $where .= " AND l.created_at <= :dt"; $params['dt'] = $dateTo . ' 23:59:59'; }
        if ($locationId) { $where .= " AND l.branch_id = :lid"; $params['lid'] = $locationId; }
        if ($statusRaw && !empty($statusRaw)) {
            $placeholders = [];
            foreach ($statusRaw as $i => $s) {
                $key = "s{$i}";
                $placeholders[] = ":{$key}";
                $params[$key] = $s;
            }
            $where .= ' AND l.status IN (' . implode(',', $placeholders) . ')';
        }

        $sql = "
            SELECT l.id as loan_id, l.application_id, l.status,
                c.full_name as customer_name,
                lp.name as product_name,
                loc.name as branch_name,
                l.amount_requested,
                l.net_disbursed,
                l.disbursed_at,
                l.created_at
            FROM loans l
            INNER JOIN customers c ON l.customer_id = c.id
            LEFT JOIN loan_products lp ON l.product_id = lp.id
            LEFT JOIN locations loc ON l.branch_id = loc.id
            WHERE {$where}
            ORDER BY l.created_at DESC
            LIMIT 500
        ";
        return $conn->fetchAllAssociative($sql, $params);
    }

    /**
     * Branch performance report.
     */
    /**
     * Branch performance report.
     *
     * Returns:
     *   {
     *     summary:   { total_applications, total_approvals, total_disbursements,
     *                  total_disbursed, active_branches, approval_rate, avg_ticket_size },
     *     by_branch: [ { branch_id, branch_name, branch_code, total_applications, ..., total_disbursed } ],
     *     details:   []   // populated on drill
     *   }
     *
     * Drill:
     *   - Level 1 ($branchId only): $details = agents rollup for that branch
     *     (shape matches by_agent row — so the frontend can reuse the chart
     *     pattern). $details does NOT respect the status filter — it's still
     *     a rollup, per Q2.
     *   - Level 2 ($branchId AND $agentId): $details = that agent's loans in
     *     that branch. $details respects the status filter at this level.
     */
    public function branchPerformance(
        ?string $dateFrom = null,
        ?string $dateTo = null,
        ?array $statusRaw = null,
        ?string $branchId = null,
        ?string $agentId = null
    ): array {
        $conn = $this->em->getConnection();

        $where = 'l.branch_id IS NOT NULL';
        $params = [];
        if ($dateFrom) { $where .= " AND l.created_at >= :df"; $params['df'] = $dateFrom; }
        if ($dateTo)   { $where .= " AND l.created_at <= :dt"; $params['dt'] = $dateTo . ' 23:59:59'; }

        // ── by_branch rollup ──
        $byBranchSql = "
            SELECT loc.id as branch_id, loc.name as branch_name, loc.code as branch_code,
                COUNT(*) as total_applications,
                SUM(CASE WHEN l.status IN ('approved','disbursed','active','overdue','closed') THEN 1 ELSE 0 END) as approvals,
                SUM(CASE WHEN l.status IN ('disbursed','active','overdue','closed') THEN 1 ELSE 0 END) as disbursements,
                SUM(CASE WHEN l.status = 'rejected' THEN 1 ELSE 0 END) as rejected,
                COALESCE(SUM(CAST(l.amount_requested AS NUMERIC)), 0) as total_amount_requested,
                COALESCE(SUM(CASE WHEN l.status IN ('disbursed','active','overdue','closed') THEN CAST(l.net_disbursed AS NUMERIC) ELSE 0 END), 0) as total_disbursed
            FROM loans l
            INNER JOIN locations loc ON l.branch_id = loc.id
            WHERE {$where}
            GROUP BY loc.id, loc.name, loc.code
            ORDER BY total_disbursed DESC
        ";
        $byBranch = $conn->fetchAllAssociative($byBranchSql, $params);

        foreach ($byBranch as &$row) {
            $row['count']  = (int) $row['total_applications'];
            $row['amount'] = (float) $row['total_disbursed'];
            $row['name']   = $row['branch_name'];
        }
        unset($row);

        // ── summary ──
        $totalApps  = array_sum(array_column($byBranch, 'count'));
        $totalAppr  = array_sum(array_column($byBranch, 'approvals'));
        $totalDisb  = array_sum(array_column($byBranch, 'disbursements'));
        $totalAmt   = array_sum(array_column($byBranch, 'total_amount_requested'));
        $totalVal   = array_sum(array_column($byBranch, 'amount'));

        $summary = [
            'total_applications'   => $totalApps,
            'total_approvals'      => $totalAppr,
            'total_disbursements'  => $totalDisb,
            'total_disbursed'      => $totalVal,
            'active_branches'      => count($byBranch),
            'approval_rate'        => $totalApps > 0 ? round(($totalAppr / $totalApps) * 100, 2) : 0,
            'avg_ticket_size'      => $totalApps > 0 ? round($totalAmt / $totalApps, 2) : 0,
        ];

        // ── details (drill) ──
        $details = [];
        if ($branchId !== null && $agentId !== null) {
            // Level 2: agent's loans in this branch
            $details = $this->fetchAgentLoans($agentId, $dateFrom, $dateTo, $branchId, $statusRaw);
        } elseif ($branchId !== null) {
            // Level 1: agents in this branch — rollup (ignores status filter, Q2)
            $details = $this->fetchAgentsInBranch($branchId, $dateFrom, $dateTo);
        }

        return [
            'summary'   => $summary,
            'by_branch' => $byBranch,
            'details'   => $details,
        ];
    }

    /**
     * Fetch agent-level rollup scoped to a single branch.
     * Used for branchPerformance level-1 drill.
     */
    private function fetchAgentsInBranch(string $branchId, ?string $dateFrom, ?string $dateTo): array
    {
        $conn = $this->em->getConnection();

        $where = 'l.agent_id IS NOT NULL AND l.branch_id = :bid';
        $params = ['bid' => $branchId];
        if ($dateFrom) { $where .= " AND l.created_at >= :df"; $params['df'] = $dateFrom; }
        if ($dateTo)   { $where .= " AND l.created_at <= :dt"; $params['dt'] = $dateTo . ' 23:59:59'; }

        $sql = "
            SELECT u.id as agent_id, u.first_name || ' ' || u.last_name as agent_name,
                COUNT(*) as total_loans,
                SUM(CASE WHEN l.status IN ('approved','disbursed','active','overdue','closed') THEN 1 ELSE 0 END) as approved,
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
        $rows = $conn->fetchAllAssociative($sql, $params);
        foreach ($rows as &$row) {
            $row['count']  = (int) $row['total_loans'];
            $row['amount'] = (float) $row['total_disbursed'];
            $row['name']   = $row['agent_name'];
        }
        return $rows;
    }

    /**
     * Product performance report.
     */
    /**
     * Product performance report.
     *
     * Returns:
     *   {
     *     summary:     { total_loans, total_requested, total_disbursed,
     *                    active_products, avg_ticket_size, approval_rate },
     *     by_product:  [ { product_id, product_name, product_code, ..., total_disbursed } ],
     *     details:     []   // populated on drill
     *   }
     *
     * Drill:
     *   When $productId is provided, $details is populated with loans of that
     *   product (respects status filter — Q2).
     */
    public function productPerformance(
        ?string $dateFrom = null,
        ?string $dateTo = null,
        ?array $statusRaw = null,
        ?string $branchId = null,
        ?string $productId = null
    ): array {
        $conn = $this->em->getConnection();

        $where = '1=1';
        $params = [];
        if ($dateFrom) { $where .= " AND l.created_at >= :df"; $params['df'] = $dateFrom; }
        if ($dateTo)   { $where .= " AND l.created_at <= :dt"; $params['dt'] = $dateTo . ' 23:59:59'; }
        if ($branchId) { $where .= " AND l.branch_id = :bid"; $params['bid'] = $branchId; }

        // ── by_product rollup ──
        $byProductSql = "
            SELECT lp.id as product_id, lp.name as product_name, lp.code as product_code,
                COUNT(*) as total_loans,
                SUM(CASE WHEN l.status IN ('approved','disbursed','active','overdue','closed') THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN l.status IN ('disbursed','active','overdue','closed') THEN 1 ELSE 0 END) as disbursed_count,
                SUM(CASE WHEN l.status = 'rejected' THEN 1 ELSE 0 END) as rejected,
                COALESCE(SUM(CAST(l.amount_requested AS NUMERIC)), 0) as total_requested,
                COALESCE(SUM(CASE WHEN l.status IN ('disbursed','active','overdue','closed') THEN CAST(l.net_disbursed AS NUMERIC) ELSE 0 END), 0) as total_disbursed
            FROM loans l
            INNER JOIN loan_products lp ON l.product_id = lp.id
            WHERE {$where}
            GROUP BY lp.id, lp.name, lp.code
            ORDER BY total_disbursed DESC
        ";
        $byProduct = $conn->fetchAllAssociative($byProductSql, $params);

        foreach ($byProduct as &$row) {
            $row['count']  = (int) $row['total_loans'];
            $row['amount'] = (float) $row['total_disbursed'];
            $row['name']   = $row['product_name'];
        }
        unset($row);

        // ── summary ──
        $totalLoans = array_sum(array_column($byProduct, 'count'));
        $totalReq   = array_sum(array_column($byProduct, 'total_requested'));
        $totalDisb  = array_sum(array_column($byProduct, 'amount'));
        $totalAppr  = array_sum(array_column($byProduct, 'approved'));

        $summary = [
            'total_loans'      => $totalLoans,
            'total_requested'  => $totalReq,
            'total_disbursed'  => $totalDisb,
            'active_products'  => count($byProduct),
            'avg_ticket_size'  => $totalLoans > 0 ? round($totalReq / $totalLoans, 2) : 0,
            'approval_rate'    => $totalLoans > 0 ? round(($totalAppr / $totalLoans) * 100, 2) : 0,
        ];

        // ── details (drill) ──
        $details = [];
        if ($productId !== null) {
            $details = $this->fetchProductLoans($productId, $dateFrom, $dateTo, $branchId, $statusRaw);
        }

        return [
            'summary'    => $summary,
            'by_product' => $byProduct,
            'details'    => $details,
        ];
    }

    /**
     * Fetch a product's loans for drill-down.
     */
    private function fetchProductLoans(
        string $productId,
        ?string $dateFrom,
        ?string $dateTo,
        ?string $branchId,
        ?array $statusRaw
    ): array {
        $conn = $this->em->getConnection();

        $where = 'l.product_id = :pid';
        $params = ['pid' => $productId];
        if ($dateFrom) { $where .= " AND l.created_at >= :df"; $params['df'] = $dateFrom; }
        if ($dateTo)   { $where .= " AND l.created_at <= :dt"; $params['dt'] = $dateTo . ' 23:59:59'; }
        if ($branchId) { $where .= " AND l.branch_id = :bid"; $params['bid'] = $branchId; }
        if ($statusRaw && !empty($statusRaw)) {
            $placeholders = [];
            foreach ($statusRaw as $i => $s) {
                $key = "s{$i}";
                $placeholders[] = ":{$key}";
                $params[$key] = $s;
            }
            $where .= ' AND l.status IN (' . implode(',', $placeholders) . ')';
        }

        $sql = "
            SELECT l.id as loan_id, l.application_id, l.status,
                c.full_name as customer_name,
                u.first_name || ' ' || u.last_name as agent_name,
                loc.name as branch_name,
                l.amount_requested,
                l.net_disbursed,
                l.disbursed_at,
                l.created_at
            FROM loans l
            INNER JOIN customers c ON l.customer_id = c.id
            LEFT JOIN users u ON l.agent_id = u.id
            LEFT JOIN locations loc ON l.branch_id = loc.id
            WHERE {$where}
            ORDER BY l.created_at DESC
            LIMIT 500
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

    /**
     * Customer variance report — expected vs actual per customer.
     */
    public function customerVarianceReport(?string $yearMonth = null, ?string $productId = null): array
    {
        $conn = $this->em->getConnection();
        $ym = $yearMonth ?? date('Y-m');
        $parts = explode('-', $ym);
        $year = $parts[0];
        $month = str_pad($parts[1] ?? date('m'), 2, '0', STR_PAD_LEFT);

        $where = "EXTRACT(YEAR FROM rs.due_date) = :y AND EXTRACT(MONTH FROM rs.due_date) = :m";
        $params = ['y' => $year, 'm' => $month];
        if ($productId) { $where .= " AND l.product_id = :pid"; $params['pid'] = $productId; }

        return $conn->fetchAllAssociative(
            "SELECT c.id as customer_id, c.full_name as customer_name, c.staff_id,
                    COUNT(rs.id) as installments,
                    COALESCE(SUM(CAST(rs.total_amount AS NUMERIC)), 0) as expected,
                    COALESCE(SUM(CAST(rs.paid_amount AS NUMERIC)), 0) as actual,
                    COALESCE(SUM(CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)), 0) as variance,
                    SUM(CASE WHEN rs.status = 'paid' THEN 1 ELSE 0 END) as paid_count,
                    SUM(CASE WHEN rs.status = 'overdue' THEN 1 ELSE 0 END) as overdue_count
             FROM repayment_schedules rs
             INNER JOIN loans l ON rs.loan_id = l.id
             INNER JOIN customers c ON l.customer_id = c.id
             WHERE {$where}
             GROUP BY c.id, c.full_name, c.staff_id
             ORDER BY variance DESC
             LIMIT 500",
            $params
        );
    }

    /**
     * Repayment performance — schedule vs actual payments over time.
     * Groups repayments by month with expected vs collected amounts.
     */
    public function repaymentPerformance(?string $dateFrom = null, ?string $dateTo = null, ?string $productId = null): array
    {
        $conn = $this->em->getConnection();
        $where = '1=1';
        $params = [];

        if ($dateFrom !== null) { $where .= ' AND rs.due_date >= :df'; $params['df'] = $dateFrom; }
        if ($dateTo !== null) { $where .= ' AND rs.due_date <= :dt'; $params['dt'] = $dateTo; }
        if ($productId !== null) { $where .= ' AND l.product_id = :pid'; $params['pid'] = $productId; }

        $totals = $conn->fetchAssociative(
            "SELECT
                COUNT(DISTINCT rs.loan_id) as total_loans,
                COALESCE(SUM(CAST(rs.total_amount AS NUMERIC)), 0) as expected,
                COALESCE(SUM(CAST(rs.paid_amount AS NUMERIC)), 0) as collected,
                SUM(CASE WHEN rs.status = 'paid' THEN 1 ELSE 0 END) as installments_paid,
                SUM(CASE WHEN rs.status = 'overdue' THEN 1 ELSE 0 END) as installments_overdue,
                COUNT(*) as total_installments
             FROM repayment_schedules rs
             INNER JOIN loans l ON rs.loan_id = l.id
             WHERE {$where}",
            $params
        ) ?: [];

        $expected = (float) ($totals['expected'] ?? 0);
        $collected = (float) ($totals['collected'] ?? 0);
        $collectionRate = $expected > 0 ? round(($collected / $expected) * 100, 2) : 0;

        // Breakdown by month
        $byPeriod = $conn->fetchAllAssociative(
            "SELECT
                TO_CHAR(rs.due_date, 'YYYY-MM') as period,
                COALESCE(SUM(CAST(rs.total_amount AS NUMERIC)), 0) as expected,
                COALESCE(SUM(CAST(rs.paid_amount AS NUMERIC)), 0) as collected,
                COUNT(*) as count
             FROM repayment_schedules rs
             INNER JOIN loans l ON rs.loan_id = l.id
             WHERE {$where}
             GROUP BY period
             ORDER BY period DESC
             LIMIT 12",
            $params
        );

        // Breakdown by product
        $byProduct = $conn->fetchAllAssociative(
            "SELECT
                lp.name,
                lp.id as product_id,
                COALESCE(SUM(CAST(rs.total_amount AS NUMERIC)), 0) as expected,
                COALESCE(SUM(CAST(rs.paid_amount AS NUMERIC)), 0) as collected,
                COUNT(DISTINCT rs.loan_id) as count
             FROM repayment_schedules rs
             INNER JOIN loans l ON rs.loan_id = l.id
             INNER JOIN loan_products lp ON l.product_id = lp.id
             WHERE {$where}
             GROUP BY lp.id, lp.name
             ORDER BY expected DESC",
            $params
        );

        return [
            'total_loans'       => (int) ($totals['total_loans'] ?? 0),
            'total_amount'      => $expected,
            'outstanding'       => max(0, $expected - $collected),
            'collection_rate'   => $collectionRate,
            'installments_paid' => (int) ($totals['installments_paid'] ?? 0),
            'installments_overdue' => (int) ($totals['installments_overdue'] ?? 0),
            'total_installments'=> (int) ($totals['total_installments'] ?? 0),
            'by_period'         => $byPeriod,
            'by_product'        => $byProduct,
        ];
    }

    /**
     * Collection efficiency — payments received grouped by agent and recovery rate.
     */
    public function collectionEfficiency(?string $dateFrom = null, ?string $dateTo = null, ?string $agentId = null): array
    {
        $conn = $this->em->getConnection();
        $where = '1=1';
        $params = [];

        if ($dateFrom !== null) { $where .= ' AND p.payment_date >= :df'; $params['df'] = $dateFrom; }
        if ($dateTo !== null) { $where .= ' AND p.payment_date <= :dt'; $params['dt'] = $dateTo; }
        if ($agentId !== null) { $where .= ' AND l.agent_id = :aid'; $params['aid'] = $agentId; }

        $totals = $conn->fetchAssociative(
            "SELECT
                COUNT(DISTINCT p.loan_id) as loans_collected,
                COALESCE(SUM(CAST(p.amount AS NUMERIC)), 0) as total_collected,
                COUNT(*) as total_payments
             FROM payments p
             INNER JOIN loans l ON p.loan_id = l.id
             WHERE p.status = 'confirmed' AND {$where}",
            $params
        ) ?: [];

        // Expected in same period (for recovery rate)
        $expected = $conn->fetchAssociative(
            "SELECT COALESCE(SUM(CAST(rs.total_amount AS NUMERIC)), 0) as expected
             FROM repayment_schedules rs
             INNER JOIN loans l ON rs.loan_id = l.id
             WHERE 1=1" .
                ($dateFrom !== null ? ' AND rs.due_date >= :df' : '') .
                ($dateTo !== null ? ' AND rs.due_date <= :dt' : '') .
                ($agentId !== null ? ' AND l.agent_id = :aid' : ''),
            $params
        ) ?: [];

        $exp = (float) ($expected['expected'] ?? 0);
        $col = (float) ($totals['total_collected'] ?? 0);
        $recoveryRate = $exp > 0 ? round(($col / $exp) * 100, 2) : 0;

        // Breakdown by agent
        $byAgent = $conn->fetchAllAssociative(
            "SELECT
                u.id as agent_id,
                CONCAT(u.first_name, ' ', u.last_name) as agent_name,
                COUNT(DISTINCT p.loan_id) as loans_touched,
                COUNT(*) as payments_count,
                COALESCE(SUM(CAST(p.amount AS NUMERIC)), 0) as total_collected
             FROM payments p
             INNER JOIN loans l ON p.loan_id = l.id
             INNER JOIN users u ON l.agent_id = u.id
             WHERE p.status = 'confirmed' AND {$where}
             GROUP BY u.id, u.first_name, u.last_name
             ORDER BY total_collected DESC
             LIMIT 50",
            $params
        );

        return [
            'total_loans'     => (int) ($totals['loans_collected'] ?? 0),
            'total_amount'    => $exp,
            'collected'       => $col,
            'outstanding'     => max(0, $exp - $col),
            'collection_rate' => $recoveryRate,
            'total_payments'  => (int) ($totals['total_payments'] ?? 0),
            'by_agent'        => $byAgent,
        ];
    }

    /**
     * Approver performance report — decision throughput and turnaround
     * time per user who has acted on approvals.
     *
     * Framing (Commit 4 decisions):
     *   - AA2: "approver" = any user with decisions, regardless of
     *     role.slug. A branch manager signing off on loans counts
     *     the same way an underwriter does — the report is about
     *     who's deciding, not who's named 'underwriter'.
     *   - BB1: "submission" = the moment a step became active for
     *     the approver, which we read from loan_approvals.sla_started_at.
     *     This is what the approver actually saw on their desk, not
     *     when the loan was first captured days earlier.
     *   - CC1: "approver clock" = decided_at - sla_started_at.
     *     Measures the approver's own responsiveness once an item
     *     hit their queue. The accountability metric.
     *   - CC2: "loan clock" = decided_at - earliest_sla_on_loan.
     *     Measures total wait time from the loan's first arrival in
     *     the approval pipeline to this decision. The customer-
     *     experience metric. Computed per decision by joining to
     *     a subquery that finds each loan's earliest sla_started_at.
     *   - GG: "active" = user who made ≥ 1 decision in the range.
     *   - HH: "currently on desk" = count of PENDING approvals
     *     with slaStartedAt IS NOT NULL (the definition of 'on desk'
     *     we already use in the approval queue). Not date-ranged —
     *     a real-time snapshot regardless of date filters.
     *
     * Drill:
     *   When $approverId is provided, $details is populated with
     *   individual decisions (status filter applies per Q2 convention).
     *
     * Time series:
     *   $granularity in {day, week, month} chooses DATE_TRUNC bucket.
     *   Each bucket row reports (submissions, approvals, rejections)
     *   for the approver scope in effect (all approvers unless filtered).
     */
    public function approverPerformance(
        ?string $dateFrom = null,
        ?string $dateTo = null,
        ?array $statusRaw = null,
        ?string $branchId = null,
        ?string $approverId = null,
        string $granularity = 'day'
    ): array {
        $conn = $this->em->getConnection();

        // ── date boundary normalisation ──
        // Default to last 30 days if caller didn't supply a range — gives
        // the charts sensible data without forcing the UI to pre-fill.
        $df = $dateFrom ?: (new \DateTimeImmutable('-30 days'))->format('Y-m-d');
        $dt = ($dateTo ?: (new \DateTimeImmutable('now'))->format('Y-m-d')) . ' 23:59:59';

        // ── by_approver rollup ──
        // Only DECIDED rows count for rollup throughput (status != PENDING).
        // PENDING rows contribute to the 'on desk' KPI separately.
        // decided_at range is the scope anchor (not sla_started_at) because
        // operators ask 'how many did person X decide last week?' — that's
        // the decided-at window regardless of when the item arrived.
        $branchFilter = $branchId ? "AND l.branch_id = :bid" : "";

        $byApproverSql = "
            WITH loan_first_sla AS (
                -- Earliest sla_started_at per loan. Proxy for 'when this
                -- loan entered the approval pipeline.' Used for CC2.
                SELECT loan_id, MIN(sla_started_at) AS first_sla
                FROM loan_approvals
                WHERE sla_started_at IS NOT NULL
                GROUP BY loan_id
            )
            SELECT
                u.id AS approver_id,
                u.first_name || ' ' || u.last_name AS approver_name,
                COUNT(*) AS decisions,
                SUM(CASE WHEN la.status IN ('approved','auto_approved') THEN 1 ELSE 0 END) AS approved,
                SUM(CASE WHEN la.status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
                AVG(EXTRACT(EPOCH FROM (la.decided_at - la.sla_started_at)) / 3600.0)
                    FILTER (WHERE la.decided_at IS NOT NULL AND la.sla_started_at IS NOT NULL)
                    AS avg_approver_clock_hours,
                AVG(EXTRACT(EPOCH FROM (la.decided_at - lfs.first_sla)) / 3600.0)
                    FILTER (WHERE la.decided_at IS NOT NULL AND lfs.first_sla IS NOT NULL)
                    AS avg_loan_clock_hours
            FROM loan_approvals la
            INNER JOIN users u ON la.approver_id = u.id
            INNER JOIN loans l ON la.loan_id = l.id
            LEFT JOIN loan_first_sla lfs ON lfs.loan_id = la.loan_id
            WHERE la.status IN ('approved','rejected','auto_approved')
              AND la.decided_at >= :df AND la.decided_at <= :dt
              {$branchFilter}
            GROUP BY u.id, u.first_name, u.last_name
            HAVING COUNT(*) >= 1
            ORDER BY decisions DESC
        ";
        $params = ['df' => $df, 'dt' => $dt];
        if ($branchId) $params['bid'] = $branchId;
        $byApprover = $conn->fetchAllAssociative($byApproverSql, $params);

        // Approval rate + chart-shape fields.
        foreach ($byApprover as &$row) {
            $d = (int) $row['decisions'];
            $row['approval_rate'] = $d > 0 ? round(((int) $row['approved'] / $d) * 100, 2) : 0;
            $row['avg_approver_clock_hours'] = $row['avg_approver_clock_hours'] !== null
                ? round((float) $row['avg_approver_clock_hours'], 2) : null;
            $row['avg_loan_clock_hours'] = $row['avg_loan_clock_hours'] !== null
                ? round((float) $row['avg_loan_clock_hours'], 2) : null;
            // Chart compat — front-end pie/bar reads count/amount/name.
            // amount = decisions (not a monetary figure, but it's what the
            // chart visualises so the bigger-bar = more-decided semantic
            // carries through without a custom chart variant).
            $row['count']  = $d;
            $row['amount'] = $d;
            $row['name']   = $row['approver_name'];
        }
        unset($row);

        // ── summary ──
        $totalDecisions = array_sum(array_column($byApprover, 'decisions'));
        $totalApproved  = array_sum(array_column($byApprover, 'approved'));
        $totalRejected  = array_sum(array_column($byApprover, 'rejected'));

        // Global averages — re-compute from raw rows so per-approver
        // averaging doesn't skew against high-volume approvers.
        $globalAvgSql = "
            WITH loan_first_sla AS (
                SELECT loan_id, MIN(sla_started_at) AS first_sla
                FROM loan_approvals WHERE sla_started_at IS NOT NULL
                GROUP BY loan_id
            )
            SELECT
                AVG(EXTRACT(EPOCH FROM (la.decided_at - la.sla_started_at)) / 3600.0)
                    FILTER (WHERE la.decided_at IS NOT NULL AND la.sla_started_at IS NOT NULL)
                    AS avg_approver_clock_hours,
                AVG(EXTRACT(EPOCH FROM (la.decided_at - lfs.first_sla)) / 3600.0)
                    FILTER (WHERE la.decided_at IS NOT NULL AND lfs.first_sla IS NOT NULL)
                    AS avg_loan_clock_hours
            FROM loan_approvals la
            INNER JOIN loans l ON la.loan_id = l.id
            LEFT JOIN loan_first_sla lfs ON lfs.loan_id = la.loan_id
            WHERE la.status IN ('approved','rejected','auto_approved')
              AND la.decided_at >= :df AND la.decided_at <= :dt
              {$branchFilter}
        ";
        $globalAvg = $conn->fetchAssociative($globalAvgSql, $params) ?: [];

        // HH — on-desk snapshot (ignores date range by design).
        $onDeskSql = "
            SELECT COUNT(*) AS c
            FROM loan_approvals la
            INNER JOIN loans l ON la.loan_id = l.id
            WHERE la.status = 'pending' AND la.sla_started_at IS NOT NULL
              {$branchFilter}
        ";
        $onDeskParams = $branchId ? ['bid' => $branchId] : [];
        $onDesk = (int) ($conn->fetchOne($onDeskSql, $onDeskParams) ?: 0);

        $summary = [
            'decisions'                => $totalDecisions,
            'approved'                 => $totalApproved,
            'rejected'                 => $totalRejected,
            'approval_rate'            => $totalDecisions > 0
                ? round(($totalApproved / $totalDecisions) * 100, 2) : 0,
            'active_approvers'         => count($byApprover),
            'currently_on_desk'        => $onDesk,
            'avg_approver_clock_hours' => $globalAvg['avg_approver_clock_hours'] !== null
                ? round((float) $globalAvg['avg_approver_clock_hours'], 2) : null,
            'avg_loan_clock_hours'     => $globalAvg['avg_loan_clock_hours'] !== null
                ? round((float) $globalAvg['avg_loan_clock_hours'], 2) : null,
        ];

        // ── time series ──
        // BB1: submissions = sla_started_at bucket.
        // approvals/rejections = decided_at bucket.
        // Two queries, zipped by period in PHP — simpler than a
        // full-outer-join dance in SQL.
        $bucket = match ($granularity) {
            'week'  => 'week',
            'month' => 'month',
            default => 'day',
        };

        $submissionsSql = "
            SELECT DATE_TRUNC(:bucket, la.sla_started_at)::date AS period,
                   COUNT(*) AS submissions
            FROM loan_approvals la
            INNER JOIN loans l ON la.loan_id = l.id
            WHERE la.sla_started_at >= :df AND la.sla_started_at <= :dt
              {$branchFilter}
            GROUP BY period ORDER BY period
        ";
        $decisionsSql = "
            SELECT DATE_TRUNC(:bucket, la.decided_at)::date AS period,
                   SUM(CASE WHEN la.status IN ('approved','auto_approved') THEN 1 ELSE 0 END) AS approvals,
                   SUM(CASE WHEN la.status = 'rejected' THEN 1 ELSE 0 END) AS rejections
            FROM loan_approvals la
            INNER JOIN loans l ON la.loan_id = l.id
            WHERE la.decided_at IS NOT NULL
              AND la.decided_at >= :df AND la.decided_at <= :dt
              {$branchFilter}
            GROUP BY period ORDER BY period
        ";
        $tsParams = $params + ['bucket' => $bucket];
        $subsRows = $conn->fetchAllAssociative($submissionsSql, $tsParams);
        $decRows  = $conn->fetchAllAssociative($decisionsSql,  $tsParams);

        $series = [];
        foreach ($subsRows as $r) {
            $key = $r['period'];
            $series[$key] = [
                'period'      => $key,
                'submissions' => (int) $r['submissions'],
                'approvals'   => 0,
                'rejections'  => 0,
            ];
        }
        foreach ($decRows as $r) {
            $key = $r['period'];
            if (!isset($series[$key])) {
                $series[$key] = ['period' => $key, 'submissions' => 0, 'approvals' => 0, 'rejections' => 0];
            }
            $series[$key]['approvals']  = (int) $r['approvals'];
            $series[$key]['rejections'] = (int) $r['rejections'];
        }
        ksort($series);
        $timeSeries = array_values($series);

        // ── details (drill) ──
        $details = [];
        if ($approverId !== null) {
            $details = $this->fetchApproverDecisions(
                $approverId, $df, $dt, $branchId, $statusRaw
            );
        }

        return [
            'summary'     => $summary,
            'by_approver' => $byApprover,
            'time_series' => $timeSeries,
            'details'     => $details,
        ];
    }

    /**
     * Per-decision drill for a single approver.
     * Status filter here maps the app-level bucket to approval statuses
     * (approved/auto_approved, rejected, pending — no "performing" etc.
     * since those are loan statuses, not approval statuses). The
     * StatusBucketResolver is loan-centric, so we interpret statusRaw
     * liberally: if it contains 'approved'/'rejected' we match, anything
     * else is ignored (returns all decided rows).
     */
    private function fetchApproverDecisions(
        string $approverId,
        string $df,
        string $dt,
        ?string $branchId,
        ?array $statusRaw
    ): array {
        $conn = $this->em->getConnection();

        $where = "la.approver_id = :aid AND la.decided_at >= :df AND la.decided_at <= :dt";
        $params = ['aid' => $approverId, 'df' => $df, 'dt' => $dt];
        if ($branchId) { $where .= " AND l.branch_id = :bid"; $params['bid'] = $branchId; }

        // Filter by approval-status bucket when user picked approved/rejected.
        // loan-status buckets (performing, non_performing, closed, etc) don't
        // apply to approvals, so we fall back to no filter.
        if ($statusRaw && !empty($statusRaw)) {
            $approvalStatuses = [];
            foreach ($statusRaw as $s) {
                if ($s === 'approved')  $approvalStatuses = array_merge($approvalStatuses, ['approved', 'auto_approved']);
                if ($s === 'rejected')  $approvalStatuses[] = 'rejected';
                if ($s === 'pending')   $approvalStatuses[] = 'pending';
            }
            if (!empty($approvalStatuses)) {
                $placeholders = [];
                foreach ($approvalStatuses as $i => $s) {
                    $k = "as{$i}";
                    $placeholders[] = ":{$k}";
                    $params[$k] = $s;
                }
                $where .= ' AND la.status IN (' . implode(',', $placeholders) . ')';
            }
        }

        $sql = "
            WITH loan_first_sla AS (
                SELECT loan_id, MIN(sla_started_at) AS first_sla
                FROM loan_approvals WHERE sla_started_at IS NOT NULL
                GROUP BY loan_id
            )
            SELECT
                la.id AS approval_id,
                l.id AS loan_id,
                l.application_id,
                c.full_name AS customer_name,
                la.status AS decision,
                la.decided_at,
                la.sla_started_at,
                lfs.first_sla AS loan_submitted_at,
                loc.name AS branch_name,
                la.comment,
                CASE WHEN la.decided_at IS NOT NULL AND la.sla_started_at IS NOT NULL
                     THEN ROUND((EXTRACT(EPOCH FROM (la.decided_at - la.sla_started_at)) / 3600.0)::numeric, 2)
                     ELSE NULL END AS approver_clock_hours,
                CASE WHEN la.decided_at IS NOT NULL AND lfs.first_sla IS NOT NULL
                     THEN ROUND((EXTRACT(EPOCH FROM (la.decided_at - lfs.first_sla)) / 3600.0)::numeric, 2)
                     ELSE NULL END AS loan_clock_hours
            FROM loan_approvals la
            INNER JOIN loans l ON la.loan_id = l.id
            INNER JOIN customers c ON l.customer_id = c.id
            LEFT JOIN locations loc ON l.branch_id = loc.id
            LEFT JOIN loan_first_sla lfs ON lfs.loan_id = la.loan_id
            WHERE {$where}
            ORDER BY la.decided_at DESC
            LIMIT 500
        ";
        return $conn->fetchAllAssociative($sql, $params);
    }

    /**
     * Dashboard charts — five aggregations bundled for the home page.
     *
     * Returns everything the home dashboard's chart grid needs in a
     * single round-trip. Co-located here rather than in a dedicated
     * service because every query is loan/payment-centric and reuses
     * fragments from existing report methods.
     *
     * Charts (J decision):
     *   1. portfolio_by_status — count + amount per LoanStatus.
     *      Drives the donut. Reuses logic from portfolioDashboard's
     *      status_breakdown but keeps its own copy here so a future
     *      change to either doesn't accidentally couple them.
     *
     *   2. disbursement_trend — last 12 months, sum of net_disbursed
     *      per month. Densified: every month appears even if zero.
     *      Drives the bar chart. Anchored to first-day-of-current-
     *      month minus 11 months so partial months render correctly.
     *
     *   3. collection_trend — last 12 months, sum of successful
     *      payments per month. Same densification as #2. Drives
     *      the line chart. NOT 'collection rate' (which would need
     *      expected-vs-actual per month and is harder); just absolute
     *      collection volume — what hit the bank account.
     *
     *   4. overdue_aging — current/1-30/31-60/61-90/90+ buckets with
     *      outstanding amounts. Drives the horizontal bar. Reuses the
     *      same bucket logic as parReport but excludes the 'current'
     *      bucket from the chart since the dashboard is about the
     *      problem set (overdue), not the healthy set.
     *
     *   5. top_products — top 5 products by disbursed loan count.
     *      Drives the bar. Volume is also returned so the chart can
     *      show count or amount on hover.
     *
     * No filters — the dashboard is unfiltered tenant-wide. Operators
     * wanting filtered views go to /reports.
     *
     * @return array<string, mixed>
     */
    public function dashboardCharts(): array
    {
        $conn = $this->em->getConnection();

        // ── 1. portfolio_by_status ──
        $statusRows = $conn->fetchAllAssociative(
            "SELECT l.status::text AS status,
                    COUNT(*) AS count,
                    COALESCE(SUM(CAST(l.amount_requested AS NUMERIC)), 0) AS amount
             FROM loans l
             WHERE l.status NOT IN ('draft','cancelled')
             GROUP BY l.status
             ORDER BY count DESC"
        );
        $portfolioByStatus = array_map(
            fn(array $r): array => [
                'label'  => strtoupper((string) $r['status']),
                'value'  => (int) $r['count'],
                'amount' => (float) $r['amount'],
            ],
            $statusRows
        );

        // ── 2. disbursement_trend (12-month rolling) ──
        $now = new \DateTimeImmutable('now');
        $start = $now->modify('first day of -11 months')->setTime(0, 0, 0);
        $disbRows = $conn->fetchAllAssociative(
            "SELECT TO_CHAR(DATE_TRUNC('month', l.disbursed_at), 'YYYY-MM') AS month_key,
                    COALESCE(SUM(CAST(l.net_disbursed AS NUMERIC)), 0) AS value,
                    COUNT(*) AS count
             FROM loans l
             WHERE l.disbursed_at IS NOT NULL
               AND l.disbursed_at >= :start
             GROUP BY month_key
             ORDER BY month_key ASC",
            ['start' => $start->format('Y-m-d')]
        );
        $disbByMonth = [];
        foreach ($disbRows as $r) {
            $disbByMonth[$r['month_key']] = [
                'value' => (float) $r['value'],
                'count' => (int) $r['count'],
            ];
        }
        $disbursementTrend = [];
        for ($i = 0; $i < 12; $i++) {
            $m = $start->modify("+{$i} months");
            $key = $m->format('Y-m');
            $disbursementTrend[] = [
                'label' => $m->format('M Y'),
                'value' => $disbByMonth[$key]['value'] ?? 0.0,
                'count' => $disbByMonth[$key]['count'] ?? 0,
            ];
        }

        // ── 3. collection_trend (12-month rolling) ──
        $payRows = $conn->fetchAllAssociative(
            "SELECT TO_CHAR(DATE_TRUNC('month', p.created_at), 'YYYY-MM') AS month_key,
                    COALESCE(SUM(CAST(p.amount AS NUMERIC)), 0) AS value
             FROM payments p
             WHERE p.status = 'success'
               AND p.created_at >= :start
             GROUP BY month_key
             ORDER BY month_key ASC",
            ['start' => $start->format('Y-m-d')]
        );
        $payByMonth = [];
        foreach ($payRows as $r) {
            $payByMonth[$r['month_key']] = (float) $r['value'];
        }
        $collectionTrend = [];
        for ($i = 0; $i < 12; $i++) {
            $m = $start->modify("+{$i} months");
            $key = $m->format('Y-m');
            $collectionTrend[] = [
                'label' => $m->format('M Y'),
                'value' => $payByMonth[$key] ?? 0.0,
            ];
        }

        // ── 4. overdue_aging ──
        // Reuses parReport's bucket logic minus the 'current' bucket.
        // Densifies missing buckets to zero so the chart always renders
        // four bars even when a bucket has no loans.
        $agingRows = $conn->fetchAllAssociative(
            "SELECT
                CASE
                    WHEN CURRENT_DATE - rs.due_date BETWEEN 1 AND 30 THEN '1_30'
                    WHEN CURRENT_DATE - rs.due_date BETWEEN 31 AND 60 THEN '31_60'
                    WHEN CURRENT_DATE - rs.due_date BETWEEN 61 AND 90 THEN '61_90'
                    WHEN CURRENT_DATE - rs.due_date > 90 THEN '90_plus'
                    ELSE NULL
                END AS bucket,
                COUNT(DISTINCT l.id) AS loan_count,
                COALESCE(SUM(CAST(rs.total_amount AS NUMERIC) - CAST(rs.paid_amount AS NUMERIC)), 0) AS outstanding
            FROM repayment_schedules rs
            INNER JOIN loans l ON rs.loan_id = l.id
            WHERE rs.status IN ('pending','partial','overdue')
              AND l.status IN ('active','overdue')
              AND rs.due_date < CURRENT_DATE
            GROUP BY bucket
            HAVING bucket IS NOT NULL
            ORDER BY bucket"
        );
        $agingByBucket = [];
        foreach ($agingRows as $r) {
            $agingByBucket[$r['bucket']] = $r;
        }
        $bucketLabels = [
            '1_30'    => '1–30 days',
            '31_60'   => '31–60 days',
            '61_90'   => '61–90 days',
            '90_plus' => '90+ days',
        ];
        $overdueAging = [];
        foreach ($bucketLabels as $key => $label) {
            $row = $agingByBucket[$key] ?? null;
            $overdueAging[] = [
                'label'       => $label,
                'value'       => $row !== null ? (float) $row['outstanding'] : 0.0,
                'count'       => $row !== null ? (int) $row['loan_count'] : 0,
            ];
        }

        // ── 5. top_products (top 5 by disbursed loan count) ──
        // Uses 'disbursed-or-after' status set so the chart reflects
        // products that actually moved money, not products with lots
        // of approvals stuck in disbursement queue.
        $productRows = $conn->fetchAllAssociative(
            "SELECT lp.id AS product_id, lp.name AS product_name,
                    COUNT(*) AS count,
                    COALESCE(SUM(CAST(l.net_disbursed AS NUMERIC)), 0) AS amount
             FROM loans l
             INNER JOIN loan_products lp ON l.product_id = lp.id
             WHERE l.status IN ('disbursed','active','overdue','closed','restructured')
             GROUP BY lp.id, lp.name
             ORDER BY count DESC
             LIMIT 5"
        );
        $topProducts = array_map(
            fn(array $r): array => [
                'label'  => (string) $r['product_name'],
                'value'  => (int) $r['count'],
                'amount' => (float) $r['amount'],
            ],
            $productRows
        );

        return [
            'portfolio_by_status' => $portfolioByStatus,
            'disbursement_trend'  => $disbursementTrend,
            'collection_trend'    => $collectionTrend,
            'overdue_aging'       => $overdueAging,
            'top_products'        => $topProducts,
        ];
    }
}
