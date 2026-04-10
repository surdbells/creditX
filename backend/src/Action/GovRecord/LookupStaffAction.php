<?php
declare(strict_types=1);
namespace App\Action\GovRecord;

use App\Domain\Repository\GovernmentRecordRepository;
use App\Infrastructure\Service\{ApiResponse, EligibilityService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class LookupStaffAction
{
    use ApiResponse;
    public function __construct(
        private readonly GovernmentRecordRepository $repo,
        private readonly EligibilityService $eligibility,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $staffId = $args['staffId'] ?? '';
        if ($staffId === '') return $this->validationError(['staff_id' => 'Staff ID is required']);

        $records = $this->repo->findByStaffId($staffId);
        if (empty($records)) return $this->notFound('No records found for staff ID: ' . $staffId);

        $results = [];
        foreach ($records as $record) {
            $eligibility = $this->eligibility->check($record);
            $results[] = array_merge($record->toArray(), ['eligibility' => $eligibility]);
        }

        return $this->success($results, 'Records found');
    }
}
