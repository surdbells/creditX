<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\Location;
use App\Domain\Entity\User;
use Doctrine\ORM\QueryBuilder;

/**
 * Branch scoping helper.
 *
 * Resolves a user's assigned branches (User.locations ManyToMany)
 * into a list of location IDs suitable for filtering loan queries
 * down to "only loans from branches this user is assigned to".
 *
 * Admin and Super Admin bypass the scope entirely — they see every
 * branch's loans. Every other role is scoped to the locations
 * assigned to the user via the user_locations pivot table.
 *
 * Usage:
 *   - Call getUserBranchIds() for conditional logic
 *   - Call applyToLoanQueryBuilder() to mutate an existing QueryBuilder
 *
 * Consumers today: ApprovalEngineService::getQueue (via repository).
 * Consumers tomorrow (Phase 2.2+): anywhere loans need branch
 * visibility gating that's NOT already handled by permissions or
 * agent-id scoping.
 *
 * Note: this helper is deliberately NOT applied to the performance
 * reports being built in Phase 2.2. Those reports are gated by
 * permissions (reports.performance.agents / .branches / .products)
 * and accept an optional branch filter in the UI — users who hold
 * the permission see all branches, with the filter as an
 * ergonomic convenience, not a security boundary.
 */
final class BranchScopeService
{
    /**
     * Role slugs that bypass branch scoping entirely.
     * These roles see loans from all branches.
     */
    private const UNSCOPED_ROLES = ['admin', 'super_admin'];

    /**
     * Resolve the set of branch (Location) IDs this user's queries
     * should be limited to.
     *
     * @return string[]|null  Null means no scope — user sees all branches.
     *                        Empty array means user has no assigned locations,
     *                        and should see nothing (caller must handle this
     *                        case — typically by short-circuiting with an
     *                        empty result rather than issuing an IN () query
     *                        which most databases reject).
     *                        Non-empty array means scope to those IDs.
     */
    public function getUserBranchIds(User $user): ?array
    {
        foreach (self::UNSCOPED_ROLES as $slug) {
            if ($user->hasRole($slug)) {
                return null;
            }
        }

        $ids = [];
        foreach ($user->getLocations() as $location) {
            /** @var Location $location */
            $ids[] = $location->getId();
        }
        return $ids;
    }

    /**
     * Mutate a QueryBuilder to apply branch scoping.
     *
     * The $loanAlias argument is the alias used for the Loan entity
     * in the QueryBuilder — e.g. if the query is
     * `SELECT a FROM LoanApproval a JOIN a.loan l`, pass 'l'.
     *
     * If the user's scope is null (unscoped), this is a no-op.
     * If the user's scope is an empty array (no assigned branches),
     * a contradiction is added (1 = 0) so the query returns zero
     * rows without needing the caller to short-circuit — useful for
     * uniform pagination behavior.
     */
    public function applyToLoanQueryBuilder(
        QueryBuilder $qb,
        User $user,
        string $loanAlias = 'l'
    ): void {
        $branchIds = $this->getUserBranchIds($user);

        if ($branchIds === null) {
            return;
        }

        if (empty($branchIds)) {
            $qb->andWhere('1 = 0');
            return;
        }

        $qb->andWhere("{$loanAlias}.branch IN (:branchScopeIds)")
           ->setParameter('branchScopeIds', $branchIds);
    }
}
