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
 *   - target (decimal string, naira): either the agent's personal
 *     monthly_target, or the global fallback from system_settings
 *     (`agent.monthly_target`, default ₦1,000,000).
 *   - target_source: 'personal' | 'global_default' — for the UI to show
 *     an explanation if the agent hasn't been assigned a personal target.
 *   - disbursed_amount (decimal string, naira): sum of net_disbursed
 *     (fallback amount_requested) for loans disbursed this calendar month.
 *   - remaining_amount (decimal string, naira): max(0, target - disbursed).
 *   - disbursed_count (int): number of DISBURSED loans this month — kept
 *     as an informational secondary stat. No longer drives progress.
 *   - progress_pct (int, 0-100): amount-based progress toward the target.
 *   - captured_this_month (int): total loan applications captured this
 *     month across all statuses (for the by_status summary tiles).
 *   - by_status: counts by loan status, for dashboard tiles.
 *   - month_label: "April 2026" etc.
 *
 * Only loans with status = DISBURSED and agent_id = caller count toward
 * the target. Captured-but-not-disbursed loans show in by_status but not
 * in target progress.
 */
final class GetDashboardStatsAction
{
    use ApiResponse;

    /** Last-resort default target if no row exists in system_settings (₦1M). */
    private const HARDCODED_DEFAULT_TARGET = '1000000';

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

        // ── Target resolution ──────────────────────────────────────────────
        // Personal target takes precedence; falls back to the global
        // `agent.monthly_target` setting (a naira amount after the rework);
        // falls back further to HARDCODED_DEFAULT_TARGET if the row is
        // missing or non-numeric.
        $personal = $user->getMonthlyTarget();
        $targetSource = 'global_default';
        if ($personal !== null && is_numeric($personal) && (float) $personal > 0) {
            $targetStr = (string) $personal;
            $targetSource = 'personal';
        } else {
            $globalRaw = $conn->fetchOne(
                "SELECT setting_value FROM system_settings WHERE setting_key = 'agent.monthly_target'"
            );
            if ($globalRaw !== false && is_numeric($globalRaw) && (float) $globalRaw > 0) {
                $targetStr = (string) $globalRaw;
            } else {
                $targetStr = self::HARDCODED_DEFAULT_TARGET;
            }
        }
        $targetFloat = (float) $targetStr;

        // ── Loan counts (by status) for the month, scoped to this agent ──
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

        // ── Disbursed count (count of loans with status=disbursed) ────────
        // Informational only — no longer drives progress.
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

        // ── Disbursed amount (sum of net_disbursed, fallback amount_requested) ─
        $disbursedAmountRaw = $conn->fetchOne(
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
        );
        $disbursedAmount = (float) ($disbursedAmountRaw ?: 0);

        // ── Progress (amount-based) ───────────────────────────────────────
        $progress = $targetFloat > 0
            ? (int) round(($disbursedAmount / $targetFloat) * 100)
            : 0;
        if ($progress > 100) $progress = 100;
        if ($progress < 0) $progress = 0;

        $remainingAmount = max(0.0, $targetFloat - $disbursedAmount);

        return $this->success([
            'month_label' => $now->format('F Y'),
            // Decimal strings for financial amounts — matches Loan entity convention
            'target' => number_format($targetFloat, 2, '.', ''),
            'target_source' => $targetSource,
            'disbursed_amount' => number_format($disbursedAmount, 2, '.', ''),
            'remaining_amount' => number_format($remainingAmount, 2, '.', ''),
            'disbursed_count' => $disbursedCount,
            'progress_pct' => $progress,
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
