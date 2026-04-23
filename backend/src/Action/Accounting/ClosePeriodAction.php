<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\AccountingPeriod;
use App\Infrastructure\Service\{ApiResponse, PeriodCloseService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * Close a period. Body: { year, month, notes? }. Creates the
 * AccountingPeriod row if it doesn't exist yet (synthetic periods
 * from the list endpoint have no row until close).
 *
 * Gated by accounting.close.
 */
final class ClosePeriodAction
{
    use ApiResponse;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly PeriodCloseService $closeService,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if ($userId === null) return $this->unauthorized();

        $data = (array) ($request->getParsedBody() ?? []);
        $year = (string) ($data['year'] ?? '');
        $month = str_pad((string) ($data['month'] ?? ''), 2, '0', STR_PAD_LEFT);
        $notes = $data['notes'] ?? null;

        if (!preg_match('/^\d{4}$/', $year) || !preg_match('/^\d{2}$/', $month)) {
            return $this->validationError(['year' => 'Must be YYYY', 'month' => 'Must be MM']);
        }

        // Do not allow closing a future period — the postings it would
        // zero out haven't happened yet, and the close would strand
        // future postings by making them back-dated.
        $periodStart = "{$year}-{$month}-01";
        if (strcmp($periodStart, date('Y-m-01')) > 0) {
            return $this->error('Cannot close a future period', 400);
        }

        // Find existing or create fresh.
        $repo = $this->em->getRepository(AccountingPeriod::class);
        $period = $repo->findOneBy(['year' => $year, 'month' => $month]);
        if ($period === null) {
            $period = new AccountingPeriod();
            $period->setYear($year);
            $period->setMonth($month);
            $this->em->persist($period);
            $this->em->flush();
        }

        try {
            $result = $this->closeService->closePeriod($period, $userId, $notes);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        } catch (\Throwable $e) {
            return $this->error('Close failed: ' . $e->getMessage(), 500);
        }

        return $this->success($result, "Period {$year}-{$month} closed successfully");
    }
}
