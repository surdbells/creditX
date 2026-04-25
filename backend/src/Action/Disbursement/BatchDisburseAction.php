<?php
declare(strict_types=1);
namespace App\Action\Disbursement;

use App\Domain\Entity\{Loan, MakerCheckerRequest};
use App\Domain\Repository\{LoanRepository, UserRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, DisbursementService, SettingsCacheService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Batch disburse — disburse many approved loans in one call.
 *
 * Contract:
 *   POST /api/disbursement/batch
 *   Body: {
 *     loan_ids?: string[],            // UUIDs (queue-checkbox flow)
 *     application_ids?: string[],     // App IDs (paste/CSV flow)
 *     settlement_gl_id: string,
 *     effective_date?: 'YYYY-MM-DD',
 *     notes?: string,
 *   }
 *
 * loan_ids and application_ids may be supplied independently or together.
 * The combined deduplicated set is processed; any IDs that don't resolve
 * to a real loan land in the `failed` array with a 'Loan not found' reason.
 *
 * Response shape:
 *   { status, message, data: { success: [...], failed: [...], total } }
 *
 * Semantics (unchanged from prior turn):
 *   - All loans disbursed from the SAME settlement GL on the SAME
 *     effective date.
 *   - Top-up balance is AUTO-DETECTED per loan at disburse time.
 *   - Maker-checker is RESPECTED per-loan.
 *   - Per-item try/catch, no enveloping transaction.
 *   - Max combined batch size: 50 loans (W1 decision — kept consistent
 *     with the original ceiling per BatchDisburseAction's comment about
 *     ~300 DB writes per batch).
 */
final class BatchDisburseAction
{
    use ApiResponse;

    public function __construct(
        private readonly LoanRepository $loanRepo,
        private readonly UserRepository $userRepo,
        private readonly DisbursementService $disbService,
        private readonly SettingsCacheService $settings,
        private readonly AuditService $audit,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        $user = $this->userRepo->find($userId);
        if ($user === null) return $this->unauthorized('User not found');

        $data = (array) ($request->getParsedBody() ?? []);
        $settlementGlId = (string) ($data['settlement_gl_id'] ?? '');
        $effectiveDate = $data['effective_date'] ?? date('Y-m-d');
        $notes = $data['notes'] ?? null;

        // Resolve loans from both id types into a unified [id => Loan|null] map.
        // Unresolved IDs are tracked separately and get reported as failures.
        [$resolved, $unresolved] = BatchIdResolver::resolve(
            $this->loanRepo,
            (array) ($data['loan_ids'] ?? []),
            (array) ($data['application_ids'] ?? []),
        );

        $totalRequested = count($resolved) + count($unresolved);
        if ($totalRequested === 0) {
            return $this->validationError([
                'loan_ids' => 'At least one loan_id or application_id is required',
            ]);
        }
        if ($totalRequested > 50) {
            return $this->validationError([
                'loan_ids' => 'Maximum 50 loans per batch',
            ]);
        }
        if ($settlementGlId === '') {
            return $this->validationError(['settlement_gl_id' => 'Settlement GL account is required']);
        }

        $makerCheckerEnabled = $this->settings->getBool('security.maker_checker_disbursement', false);

        $success = [];
        $failed = [];

        // Fold unresolved IDs straight into failed[] — they never reach
        // the disburse path so per-item try/catch isn't relevant for them.
        foreach ($unresolved as $unr) {
            $failed[] = [
                'loan_id'        => $unr['loan_id'] ?? null,
                'application_id' => $unr['application_id'] ?? null,
                'error'          => 'Loan not found',
            ];
        }

        foreach ($resolved as $loan) {
            /** @var Loan $loan */
            $lid = $loan->getId();

            try {
                if ($makerCheckerEnabled) {
                    $mc = new MakerCheckerRequest();
                    $mc->setOperationType('disbursement');
                    $mc->setEntityType('Loan');
                    $mc->setEntityId($loan->getId());
                    $mc->setPayload([
                        'loan_id'          => $loan->getId(),
                        'settlement_gl_id' => $settlementGlId,
                        'effective_date'   => $effectiveDate,
                    ]);
                    $mc->setMaker($user);
                    $mc->setMakerComment($notes);
                    $this->em->persist($mc);
                    $this->em->flush();

                    $success[] = [
                        'loan_id'        => $lid,
                        'application_id' => $loan->getApplicationId(),
                        'result'         => [
                            'status'           => 'pending_checker',
                            'maker_checker_id' => $mc->getId(),
                        ],
                    ];
                } else {
                    $result = $this->disbService->disburse(
                        $loan,
                        $settlementGlId,
                        $effectiveDate,
                        $userId,
                        null,
                    );
                    $success[] = [
                        'loan_id'        => $lid,
                        'application_id' => $loan->getApplicationId(),
                        'result'         => $result,
                    ];

                    $this->audit->logCreate(
                        $userId,
                        'Disbursement',
                        $loan->getId(),
                        $result,
                        $this->getClientIp($request),
                        $this->getUserAgent($request),
                    );
                }
            } catch (\App\Domain\Exception\DomainException $e) {
                $failed[] = [
                    'loan_id'        => $lid,
                    'application_id' => $loan->getApplicationId(),
                    'error'          => $e->getMessage(),
                ];
            } catch (\Throwable $e) {
                $failed[] = [
                    'loan_id'        => $lid,
                    'application_id' => $loan->getApplicationId(),
                    'error'          => 'Unexpected error: ' . $e->getMessage(),
                ];
            }
        }

        $succeeded = count($success);
        $fcount = count($failed);
        $msg = $fcount === 0
            ? ($makerCheckerEnabled
                ? sprintf('All %d loans submitted for approval', $succeeded)
                : sprintf('All %d loans disbursed successfully', $succeeded))
            : sprintf('%d %s, %d failed',
                $succeeded,
                $makerCheckerEnabled ? 'submitted' : 'disbursed',
                $fcount);

        return $this->success([
            'success' => $success,
            'failed'  => $failed,
            'total'   => $totalRequested,
        ], $msg);
    }
}
