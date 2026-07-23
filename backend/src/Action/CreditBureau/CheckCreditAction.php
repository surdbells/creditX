<?php
declare(strict_types=1);
namespace App\Action\CreditBureau;

use App\Domain\Entity\CreditCheck;
use App\Domain\Repository\{CustomerRepository, UserRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, FirstCentralService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * POST /api/credit-bureau/check
 *
 * Standalone credit check (no loan required) — the RBAC-gated Credit Bureau
 * module. Body:
 *   subject_type : 'consumer' | 'commercial'
 *   consumer:  bvn  OR  (name + dob)
 *   commercial: business_name  OR  rc_number
 *   customer_id (optional) — link the enquiry to a customer
 *
 * Persists a CreditCheck and returns the normalized result.
 */
final class CheckCreditAction
{
    use ApiResponse;

    public function __construct(
        private readonly FirstCentralService $bureau,
        private readonly EntityManagerInterface $em,
        private readonly CustomerRepository $customerRepo,
        private readonly UserRepository $userRepo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        if (!$this->bureau->isConfigured()) {
            return $this->error('Credit bureau is not configured on this server.', 503);
        }

        $data = (array) ($request->getParsedBody() ?? []);
        $subjectType = ($data['subject_type'] ?? 'consumer') === 'commercial' ? 'commercial' : 'consumer';

        if ($subjectType === 'consumer') {
            $bvn  = trim((string) ($data['bvn'] ?? ''));
            $name = trim((string) ($data['name'] ?? ''));
            $dob  = trim((string) ($data['dob'] ?? ''));
            if ($bvn === '' && $name === '') {
                return $this->validationError(['bvn' => 'Provide a BVN, or a name and date of birth.']);
            }
            $identifier = $bvn !== '' ? $bvn : trim("$name $dob");
            $result = $this->bureau->checkConsumer($bvn ?: null, $name ?: null, $dob ?: null);
        } else {
            $business = trim((string) ($data['business_name'] ?? ''));
            $rc       = trim((string) ($data['rc_number'] ?? ''));
            if ($business === '' && $rc === '') {
                return $this->validationError(['business_name' => 'Provide a business name or RC number.']);
            }
            $identifier = $rc !== '' ? $rc : $business;
            $result = $this->bureau->checkCommercial($business ?: null, $rc ?: null);
        }

        $check = new CreditCheck();
        $check->setSubjectType($subjectType);
        $check->setIdentifier($identifier);
        $check->setStatus($result['status']);
        $check->setScore($result['score']);
        $check->setRiskBand($result['risk_band']);
        $check->setProviderRef($result['provider_ref']);
        $check->setSummary($result['summary'] ?: null);
        $check->setRawResponse($result['raw'] ?: null);
        $check->setErrorMessage($result['error']);

        $userId = $request->getAttribute('user_id');
        if ($userId) $check->setInitiatedBy($this->userRepo->find($userId));
        if (!empty($data['customer_id'])) $check->setCustomer($this->customerRepo->find($data['customer_id']));

        $this->em->persist($check);
        $this->em->flush();

        $this->audit->logCreate($userId, 'CreditCheck', $check->getId(), ['status' => $result['status'], 'score' => $result['score']], $this->getClientIp($request), $this->getUserAgent($request));

        // Include the full report so the module can render it.
        return $this->success($check->toArray(true), 'Credit check completed');
    }
}
