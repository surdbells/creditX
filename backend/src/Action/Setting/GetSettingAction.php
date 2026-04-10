<?php
declare(strict_types=1);
namespace App\Action\Setting;

use App\Domain\Repository\SystemSettingRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GetSettingAction
{
    use ApiResponse;
    public function __construct(private readonly SystemSettingRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $setting = $this->repo->find($args['id'] ?? '');
        if ($setting === null) return $this->notFound('Setting not found');
        return $this->success($setting->toArray());
    }
}
