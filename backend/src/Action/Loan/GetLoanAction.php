<?php
declare(strict_types=1);
namespace App\Action\Loan;

use App\Domain\Repository\{DocumentRepository, LoanRepository};
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GetLoanAction
{
    use ApiResponse;
    public function __construct(
        private readonly LoanRepository $repo,
        private readonly DocumentRepository $docRepo,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $loan = $this->repo->find($args['id'] ?? '');
        if ($loan === null) return $this->notFound('Loan not found');

        $data = $loan->toArray(true);

        // Documents: queried separately via DocumentRepository (there's no
        // Loan→Document ORM relation — Documents carry a nullable loan_id
        // FK for flexibility). Attached here so the agent edit-loan wizard
        // can show 'already uploaded' state on Step 4 instead of forcing
        // the agent to re-upload the same files.
        $documents = $this->docRepo->findByLoan($loan->getId());
        $data['documents'] = array_map(
            fn($d) => $d->toArray(),
            $documents,
        );

        return $this->success($data);
    }
}
