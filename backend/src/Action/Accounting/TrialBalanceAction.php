<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class TrialBalanceAction
{
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $params = $request->getQueryParams();
        $year = $params['year'] ?? date('Y');
        $month = $params['month'] ?? null;

        $conn = $this->em->getConnection();

        $where = "lt.trans_year = :y";
        $qParams = ['y' => $year];
        if ($month) { $where .= " AND lt.trans_month = :m"; $qParams['m'] = str_pad($month, 2, '0', STR_PAD_LEFT); }

        $sql = "
            SELECT gl.id, gl.account_name, gl.account_number, gl.account_code, gl.account_type,
                   COALESCE(SUM(CASE WHEN lt.trans_type = 'DR' THEN CAST(lt.trans_amount AS NUMERIC) ELSE 0 END), 0) as total_dr,
                   COALESCE(SUM(CASE WHEN lt.trans_type = 'CR' THEN CAST(lt.trans_amount AS NUMERIC) ELSE 0 END), 0) as total_cr
            FROM general_ledgers gl
            LEFT JOIN ledger_transactions lt ON lt.gl_id = gl.id AND {$where}
            WHERE gl.is_active = true
            GROUP BY gl.id, gl.account_name, gl.account_number, gl.account_code, gl.account_type
            HAVING COALESCE(SUM(CASE WHEN lt.trans_type = 'DR' THEN CAST(lt.trans_amount AS NUMERIC) ELSE 0 END), 0) > 0
                OR COALESCE(SUM(CASE WHEN lt.trans_type = 'CR' THEN CAST(lt.trans_amount AS NUMERIC) ELSE 0 END), 0) > 0
            ORDER BY gl.account_code
        ";

        $rows = $conn->fetchAllAssociative($sql, $qParams);
        $totalDr = '0.00'; $totalCr = '0.00';
        foreach ($rows as &$row) {
            $row['balance'] = number_format((float) $row['total_dr'] - (float) $row['total_cr'], 2, '.', '');
            $row['total_dr'] = number_format((float) $row['total_dr'], 2, '.', '');
            $row['total_cr'] = number_format((float) $row['total_cr'], 2, '.', '');
            $totalDr = bcadd($totalDr, $row['total_dr'], 2);
            $totalCr = bcadd($totalCr, $row['total_cr'], 2);
        }

        return $this->success([
            'accounts' => $rows,
            'total_dr' => $totalDr,
            'total_cr' => $totalCr,
            'difference' => bcsub($totalDr, $totalCr, 2),
            'is_balanced' => bccomp($totalDr, $totalCr, 2) === 0,
            'period' => $month ? "{$year}-{$month}" : $year,
        ]);
    }
}
