<?php
declare(strict_types=1);
namespace App\Action\User;

use App\Domain\Entity\User;
use App\Infrastructure\Service\ApiResponse;
use App\Infrastructure\Service\AuditService;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * PATCH /api/users/{id}/agent-target
 *
 * Updates the two agent-related fields on a user:
 *   - is_agent (bool)
 *   - monthly_target (decimal string | null)
 *
 * This is the *only* surface through which these fields can change.
 * Standard user create/update actions ignore them. This keeps the
 * concept of "who is an agent / what's their target" cleanly isolated
 * to the Agent Targets admin page (which uses this endpoint).
 *
 * Validation:
 *   - is_agent must be a boolean (or missing, in which case we don't touch it)
 *   - monthly_target must be null, '' (= null), or a non-negative number.
 *     Values > 999,999,999,999,999.99 (the decimal(15,2) ceiling) are rejected.
 *   - If is_agent is being set to false, monthly_target is forcibly cleared
 *     so we don't leave stale data on non-agents.
 *
 * RBAC: settings.edit (registered in routes.php).
 */
final class UpdateAgentTargetAction
{
    use ApiResponse;

    /** Maximum value that fits in decimal(15,2). */
    private const MAX_TARGET = 999999999999999.99;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = $args['id'] ?? null;
        if (!$id) return $this->validationError(['id' => 'User id is required']);

        $user = $this->em->find(User::class, $id);
        if (!$user instanceof User) return $this->notFound('User not found');

        $body = (array) ($request->getParsedBody() ?? []);
        $errors = [];

        // Snapshot BEFORE so audit has a clean diff
        $old = [
            'is_agent' => $user->isAgent(),
            'monthly_target' => $user->getMonthlyTarget(),
        ];

        // ── is_agent ──
        $isAgentChanged = false;
        if (array_key_exists('is_agent', $body)) {
            $v = $body['is_agent'];
            if (!is_bool($v)) {
                // Accept common truthy/falsy strings for JSON-serialized booleans
                if ($v === 'true' || $v === 1 || $v === '1') $v = true;
                elseif ($v === 'false' || $v === 0 || $v === '0') $v = false;
                else $errors['is_agent'] = 'Must be a boolean';
            }
            if (!isset($errors['is_agent'])) {
                $user->setIsAgent((bool) $v);
                $isAgentChanged = true;
            }
        }

        // ── monthly_target ──
        if (array_key_exists('monthly_target', $body)) {
            $v = $body['monthly_target'];
            if ($v === null || $v === '') {
                $user->setMonthlyTarget(null);
            } elseif (!is_numeric($v)) {
                $errors['monthly_target'] = 'Must be a non-negative number or null';
            } else {
                $f = (float) $v;
                if ($f < 0) {
                    $errors['monthly_target'] = 'Cannot be negative';
                } elseif ($f > self::MAX_TARGET) {
                    $errors['monthly_target'] = 'Exceeds maximum allowed value';
                } else {
                    $user->setMonthlyTarget($v);
                }
            }
        }

        // If the user is being un-flagged as agent, force-clear their target.
        // Prevents stale amounts from haunting a former agent's record.
        if ($isAgentChanged && !$user->isAgent()) {
            $user->setMonthlyTarget(null);
        }

        if (!empty($errors)) {
            return $this->validationError($errors);
        }

        $this->em->flush();

        $new = [
            'is_agent' => $user->isAgent(),
            'monthly_target' => $user->getMonthlyTarget(),
        ];

        $this->audit->logUpdate(
            $request->getAttribute('user_id'),
            'User', $user->getId(), $old, $new,
            $this->getClientIp($request), $this->getUserAgent($request)
        );

        return $this->success([
            'id' => $user->getId(),
            'is_agent' => $user->isAgent(),
            'monthly_target' => $user->getMonthlyTarget(),
        ], 'Agent target updated');
    }
}
