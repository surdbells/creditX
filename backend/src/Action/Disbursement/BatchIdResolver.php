<?php

declare(strict_types=1);

namespace App\Action\Disbursement;

use App\Domain\Entity\Loan;
use App\Domain\Repository\LoanRepository;

/**
 * Loan ID resolver — converts arbitrary identifier inputs (UUIDs and/or
 * application IDs) into a deduplicated set of Loan entities, plus a
 * separate list of identifiers that didn't resolve to anything.
 *
 * Used by BatchDisburseAction (commits the disbursement) and
 * BatchDisbursePreviewAction (validates without committing). Both want
 * the same input handling: accept either ID flavor, deduplicate within
 * and across the two lists, surface the unresolved cases as named
 * failures rather than silently dropping them.
 *
 * Why a separate helper: the resolution logic is non-trivial enough
 * (case normalization, dedup across both id types, reporting which
 * identifier was the unresolved one) that duplicating it across the
 * two actions would invite drift.
 */
final class BatchIdResolver
{
    /**
     * @param LoanRepository $repo
     * @param string[] $loanIds          UUIDs from the queue-checkbox flow
     * @param string[] $applicationIds   App IDs from the paste/CSV flow
     * @return array{0: array<int, Loan>, 1: array<int, array{loan_id?: string, application_id?: string}>}
     *         Returns [resolvedLoans, unresolvedRefs]. resolvedLoans is
     *         deduplicated by Loan.id (the same loan referenced by both a
     *         UUID and an app_id appears once). unresolvedRefs preserves
     *         which identifier failed to resolve so the caller can put a
     *         meaningful row in their failed[] response.
     */
    public static function resolve(
        LoanRepository $repo,
        array $loanIds,
        array $applicationIds,
    ): array {
        $resolved = []; // id => Loan
        $unresolved = [];

        // Resolve UUIDs first — these are exact-match lookups.
        foreach ($loanIds as $rawId) {
            $id = trim((string) $rawId);
            if ($id === '') continue;
            $loan = $repo->find($id);
            if ($loan === null) {
                $unresolved[] = ['loan_id' => $id];
                continue;
            }
            $resolved[$loan->getId()] = $loan;
        }

        // Resolve app IDs. Trim each + uppercase since the schema's
        // applicationId column is stored uppercase by convention.
        // Skip any that resolve to a Loan we already have via the
        // UUID list (dedup across the two input arrays).
        foreach ($applicationIds as $rawAppId) {
            $appId = strtoupper(trim((string) $rawAppId));
            if ($appId === '') continue;
            $loan = $repo->findByApplicationId($appId);
            if ($loan === null) {
                $unresolved[] = ['application_id' => $appId];
                continue;
            }
            // Already in the resolved set via the UUID path — skip the
            // duplicate. The caller gets one row per loan regardless of
            // how it was identified.
            if (isset($resolved[$loan->getId()])) continue;
            $resolved[$loan->getId()] = $loan;
        }

        return [array_values($resolved), $unresolved];
    }
}
