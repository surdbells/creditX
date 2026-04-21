<?php
declare(strict_types=1);
namespace App\Action\User;

use App\Domain\Entity\User;
use App\Infrastructure\Service\ApiResponse;
use App\Infrastructure\Service\AuditService;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * PATCH /api/users/bulk-agent-targets
 *
 * Bulk-updates the agent fields for multiple users in a single atomic
 * transaction. Lets an admin set the same monthly_target across a
 * selection of agents (or bulk-flag/unflag).
 *
 * Body:
 *   {
 *     "user_ids": ["uuid1", "uuid2", ...],   // required, non-empty
 *     "is_agent": bool | null,               // optional
 *     "monthly_target": string|number|null   // optional
 *   }
 *
 * At least one of `is_agent` or `monthly_target` must be provided,
 * otherwise the call is a no-op and we return 422.
 *
 * Transaction semantics:
 *   - All-or-nothing: if ANY user id is missing, returns 422 and
 *     nothing is saved. This prevents partial half-states where e.g.
 *     30 of 50 users got the new target.
 *
 * Returns:
 *   - updated_count: int
 *   - user_ids: the ids that were successfully updated
 *
 * RBAC: settings.edit (registered in routes.php).
 */
final class BulkUpdateAgentTargetsAction
{
    use ApiResponse;

    private const MAX_TARGET = 999999999999999.99;
    /** Soft cap on how many users can be touched in one call. Prevents
        memory issues and protects against operator mistakes. */
    private const MAX_BATCH = 500;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body = (array) ($request->getParsedBody() ?? []);
        $errors = [];

        // ── user_ids ──
        $ids = $body['user_ids'] ?? null;
        if (!is_array($ids) || empty($ids)) {
            $errors['user_ids'] = 'Must be a non-empty array of user IDs';
        } elseif (count($ids) > self::MAX_BATCH) {
            $errors['user_ids'] = 'Cannot update more than ' . self::MAX_BATCH . ' users at once';
        } else {
            // Normalize and uniquify
            $ids = array_values(array_unique(array_map(fn($v) => (string) $v, $ids)));
        }

        // ── at-least-one-field check ──
        $hasIsAgent = array_key_exists('is_agent', $body);
        $hasTarget = array_key_exists('monthly_target', $body);
        if (!$hasIsAgent && !$hasTarget) {
            $errors['_'] = 'Provide at least one of: is_agent, monthly_target';
        }

        // ── normalize is_agent ──
        $isAgent = null;
        if ($hasIsAgent) {
            $v = $body['is_agent'];
            if (is_bool($v)) {
                $isAgent = $v;
            } elseif ($v === 'true' || $v === 1 || $v === '1') {
                $isAgent = true;
            } elseif ($v === 'false' || $v === 0 || $v === '0') {
                $isAgent = false;
            } else {
                $errors['is_agent'] = 'Must be a boolean';
            }
        }

        // ── normalize monthly_target ──
        $target = null;
        $clearTarget = false;
        if ($hasTarget) {
            $v = $body['monthly_target'];
            if ($v === null || $v === '') {
                $clearTarget = true;
            } elseif (!is_numeric($v)) {
                $errors['monthly_target'] = 'Must be a non-negative number or null';
            } else {
                $f = (float) $v;
                if ($f < 0) {
                    $errors['monthly_target'] = 'Cannot be negative';
                } elseif ($f > self::MAX_TARGET) {
                    $errors['monthly_target'] = 'Exceeds maximum allowed value';
                } else {
                    $target = $v; // keep original precision, User::setMonthlyTarget will format
                }
            }
        }

        if (!empty($errors)) {
            return $this->validationError($errors);
        }

        // ── Load all users in one query ──
        /** @var User[] $users */
        $users = $this->em->getRepository(User::class)->findBy(['id' => $ids]);
        if (count($users) !== count($ids)) {
            $foundIds = array_map(fn(User $u) => $u->getId(), $users);
            $missing = array_values(array_diff($ids, $foundIds));
            return $this->validationError([
                'user_ids' => 'User(s) not found: ' . implode(', ', $missing),
            ]);
        }

        // ── Apply changes ──
        // Wrap in a transaction so either all updates land or none do.
        $conn = $this->em->getConnection();
        $conn->beginTransaction();
        try {
            $userId = $request->getAttribute('user_id');
            $ip = $this->getClientIp($request);
            $ua = $this->getUserAgent($request);

            foreach ($users as $user) {
                $old = [
                    'is_agent' => $user->isAgent(),
                    'monthly_target' => $user->getMonthlyTarget(),
                ];

                if ($hasIsAgent) {
                    $user->setIsAgent((bool) $isAgent);
                }
                if ($hasTarget) {
                    $user->setMonthlyTarget($clearTarget ? null : $target);
                }
                // Force-clear target if user was un-flagged — same policy
                // as the single-user action.
                if ($hasIsAgent && !$user->isAgent()) {
                    $user->setMonthlyTarget(null);
                }

                $new = [
                    'is_agent' => $user->isAgent(),
                    'monthly_target' => $user->getMonthlyTarget(),
                ];

                // Audit per-user so the history is granular
                if ($old !== $new) {
                    $this->audit->logUpdate($userId, 'User', $user->getId(), $old, $new, $ip, $ua);
                }
            }

            $this->em->flush();
            $conn->commit();
        } catch (\Throwable $e) {
            $conn->rollBack();
            throw $e;
        }

        return $this->success([
            'updated_count' => count($users),
            'user_ids' => array_map(fn(User $u) => $u->getId(), $users),
        ], 'Agent targets updated');
    }
}
