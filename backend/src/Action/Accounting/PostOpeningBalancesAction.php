<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Exception\DomainException;
use App\Infrastructure\Service\{ApiResponse, AuditService, OpeningBalanceService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/accounting/opening-balances
 *
 * Seeds day-one opening balances. Each submitted balance carries its
 * natural side (DR for assets, CR for liabilities/equity); the service
 * posts the difference to Opening Balance Equity so the journal balances.
 * Gated by accounting.journal.
 */
final class PostOpeningBalancesAction
{
    use ApiResponse;

    public function __construct(
        private readonly OpeningBalanceService $service,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);

        $postingDate = trim((string) ($data['posting_date'] ?? ''));
        $balances    = $data['balances'] ?? null;
        $force       = filter_var($data['force'] ?? false, FILTER_VALIDATE_BOOLEAN);

        $errors = [];
        if ($postingDate === '') {
            $errors['posting_date'] = 'Required (YYYY-MM-DD).';
        }
        if (!is_array($balances) || count($balances) === 0) {
            $errors['balances'] = 'At least one opening balance is required.';
        }
        if (!empty($errors)) {
            return $this->validationError($errors);
        }

        $userId = $request->getAttribute('user_id');

        try {
            $journal = $this->service->post($postingDate, $balances, $userId, $force);
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

        return $this->created($journal->toArray(), 'Opening balances posted successfully');
    }
}
