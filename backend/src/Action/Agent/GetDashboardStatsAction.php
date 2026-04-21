<?php
declare(strict_types=1);
namespace App\Action\Agent;

use App\Domain\Entity\{User, Loan};
use App\Domain\Enum\LoanStatus;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * GET /api/agent/dashboard-stats
 *
 * Returns for the authenticated agent:
 *   - Monthly disbursed count (current month)
 *   - Monthly target (from system setting `agent.monthly_target`, default 20)
 *   - Progress percentage
 *   - Total loans captured this month (all statuses)
 *   - Pending, approved, disbursed, declined counts
 *   - Current month label (e.g., "April 2026")
 */
final class GetDashboardStatsAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if (!$userId) return $this->unauthorized();
        $user = $this->em->find(User::class, $userId);
        if (!$user instanceof User) return $this->unauthorized();

        $now = new \DateTimeImmutable('now', new \DateTimeZone('Africa/Lagos'));
        $monthStart = $now->modify('first day of this month')->setTime(0, 0, 0);
        $monthEnd = $now->modify('last day of this month')->setTime(23, 59, 59);

        $conn = $this->em->getConnection();

        // Disbursed loans count this month (counts against target)
        $disbursedCount = (int) $conn->fetchOne(
            "SELECT COUNT(id) FROM loans
             WHERE agent_id = :agent_id
               AND status = :status
               AND disbursed_at BETWEEN :start AND :end",
            [
                'agent_id' => $user->getId(),
                'status' => LoanStatus::DISBURSED->value,
                'start' => $monthStart->format('Y-m-d H:i:s'),
                'end' => $monthEnd->format('Y-m-d H:i:s'),
            ]
        );

        // All loans captured this month (by created_at)
        $allByStatus = $conn->fetchAllAssociative(
            "SELECT status, COUNT(id) AS cnt FROM loans
             WHERE agent_id = :agent_id
               AND created_at BETWEEN :start AND :end
             GROUP BY status",
            [
                'agent_id' => $user->getId(),
                'start' => $monthStart->format('Y-m-d H:i:s'),
                'end' => $monthEnd->format('Y-m-d H:i:s'),
            ]
        );

        $byStatus = [];
        $totalThisMonth = 0;
        foreach ($allByStatus as $row) {
            $byStatus[$row['status']] = (int) $row['cnt'];
            $totalThisMonth += (int) $row['cnt'];
        }

        // Fetch target from system settings
        $targetSetting = $conn->fetchOne(
            "SELECT setting_value FROM system_settings WHERE setting_key = 'agent.monthly_target'"
        );
        $target = $targetSetting !== false && is_numeric($targetSetting) ? (int) $targetSetting : 20;
        if ($target <= 0) $target = 20;

        $progress = (int) round(($disbursedCount / $target) * 100);
        if ($progress > 100) $progress = 100;

        // Disbursed amount this month (sum of net_disbursed, fallback to amount_requested)
        $disbursedAmount = (float) ($conn->fetchOne(
            "SELECT COALESCE(SUM(COALESCE(net_disbursed, amount_requested)), 0) FROM loans
             WHERE agent_id = :agent_id
               AND status = :status
               AND disbursed_at BETWEEN :start AND :end",
            [
                'agent_id' => $user->getId(),
                'status' => LoanStatus::DISBURSED->value,
                'start' => $monthStart->format('Y-m-d H:i:s'),
                'end' => $monthEnd->format('Y-m-d H:i:s'),
            ]
        ) ?: 0);

        return $this->success([
            'month_label' => $now->format('F Y'),
            'target' => $target,
            'disbursed_count' => $disbursedCount,
            'remaining' => max(0, $target - $disbursedCount),
            'progress_pct' => $progress,
            'disbursed_amount' => $disbursedAmount,
            'captured_this_month' => $totalThisMonth,
            'by_status' => [
                'submitted' => $byStatus[LoanStatus::SUBMITTED->value] ?? 0,
                'under_review' => $byStatus[LoanStatus::UNDER_REVIEW->value] ?? 0,
                'approved' => $byStatus[LoanStatus::APPROVED->value] ?? 0,
                'disbursed' => $byStatus[LoanStatus::DISBURSED->value] ?? 0,
                'rejected' => $byStatus[LoanStatus::REJECTED->value] ?? 0,
            ],
        ]);
    }
}
