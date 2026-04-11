<?php
declare(strict_types=1);
namespace App\Action\DsaTarget;

use App\Domain\Entity\DsaTarget;
use App\Domain\Repository\{DsaTargetRepository, UserRepository, LocationRepository};
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateDsaTargetAction
{
    use ApiResponse;
    public function __construct(
        private readonly DsaTargetRepository $repo,
        private readonly UserRepository $userRepo,
        private readonly LocationRepository $locRepo,
        private readonly AuditService $audit,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'user_id'       => ['required' => true, 'type' => 'string'],
            'target_amount' => ['required' => true, 'type' => 'string'],
            'target_count'  => ['required' => false, 'type' => 'int', 'default' => 0],
            'period_year'   => ['required' => true, 'type' => 'string'],
            'period_month'  => ['required' => true, 'type' => 'string'],
            'location_id'   => ['required' => false, 'type' => 'string'],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);

        $user = $this->userRepo->find($v['clean']['user_id']);
        if ($user === null) return $this->notFound('User not found');

        $existing = $this->repo->findByUserPeriod($user->getId(), $v['clean']['period_year'], $v['clean']['period_month']);
        if ($existing !== null) return $this->error('Target already exists for this user/period', 400);

        $target = new DsaTarget();
        $target->setUser($user);
        $target->setTargetAmount($v['clean']['target_amount']);
        $target->setTargetCount($v['clean']['target_count']);
        $target->setPeriodYear($v['clean']['period_year']);
        $target->setPeriodMonth($v['clean']['period_month']);

        if (isset($v['clean']['location_id']) && $v['clean']['location_id']) {
            $loc = $this->locRepo->find($v['clean']['location_id']);
            if ($loc) $target->setLocation($loc);
        }

        $this->repo->save($target);
        $this->audit->logCreate($request->getAttribute('user_id'), 'DsaTarget', $target->getId(), $target->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($target->toArray(), 'DSA target created');
    }
}
