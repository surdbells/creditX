<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Exception\DomainException;
use App\Infrastructure\Service\{ApiResponse, AuditService, ManualJournalService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/accounting/journals
 *
 * Accountant-authored manual journal entry. Gated by accounting.journal.
 * Delegates the heavy lifting (GL resolution, period guard, balanced
 * posting) to ManualJournalService, which reuses LedgerService::postJournal
 * so manual entries are validated and traced exactly like system journals.
 */
final class CreateManualJournalAction
{
    use ApiResponse;

    public function __construct(
        private readonly ManualJournalService $service,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);

        $postingDate = trim((string) ($data['posting_date'] ?? ''));
        $narration   = trim((string) ($data['narration'] ?? ''));
        $reference   = isset($data['reference']) && $data['reference'] !== '' ? (string) $data['reference'] : null;
        $lines       = $data['lines'] ?? null;

        $errors = [];
        if ($postingDate === '') {
            $errors['posting_date'] = 'Required (YYYY-MM-DD).';
        }
        if ($narration === '') {
            $errors['narration'] = 'Required.';
        }
        if (!is_array($lines) || count($lines) < 2) {
            $errors['lines'] = 'At least two lines are required.';
        }
        if (!empty($errors)) {
            return $this->validationError($errors);
        }

        $userId = $request->getAttribute('user_id');

        try {
            $journal = $this->service->post($postingDate, $narration, $reference, $lines, $userId);
        } catch (DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logCreate(
            $userId,
            'JournalEntry',
            $journal->getId(),
            $journal->toArray(),
            $this->getClientIp($request),
            $this->getUserAgent($request),
        );

        return $this->created($journal->toArray(), 'Manual journal posted successfully');
    }
}
