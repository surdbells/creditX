<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\MakerCheckerRequest;
use App\Domain\Repository\UserRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, JournalReversalService, SettingsCacheService};
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class ReversalAction
{
    use ApiResponse;
    public function __construct(
        private readonly JournalReversalService $reversalService,
        private readonly UserRepository $userRepo,
        private readonly SettingsCacheService $settings,
        private readonly AuditService $audit,
        private readonly EntityManagerInterface $em,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $transactionId = $args['id'] ?? '';
        $data = (array) ($request->getParsedBody() ?? []);
        $reason = $data['reason'] ?? null;
        $userId = $request->getAttribute('user_id');

        // Maker-checker for reversals
        $makerCheckerEnabled = $this->settings->getBool('security.maker_checker_reversal', false);
        if ($makerCheckerEnabled) {
            $user = $this->userRepo->find($userId);
            if ($user !== null) {
                $mc = new MakerCheckerRequest();
                $mc->setOperationType('reversal');
                $mc->setEntityType('LedgerTransaction');
                $mc->setEntityId($transactionId);
                $mc->setPayload(['transaction_id' => $transactionId, 'reason' => $reason]);
                $mc->setMaker($user);
                $mc->setMakerComment($reason);
                $this->em->persist($mc);
                $this->em->flush();
                return $this->success(['maker_checker_id' => $mc->getId()], 'Reversal submitted for checker approval');
            }
        }

        try {
            $result = $this->reversalService->reverse($transactionId, $userId, $reason);
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logCreate($userId, 'JournalReversal', $transactionId, $result, $this->getClientIp($request), $this->getUserAgent($request));
        return $this->success($result, 'Journal entry reversed successfully');
    }
}
