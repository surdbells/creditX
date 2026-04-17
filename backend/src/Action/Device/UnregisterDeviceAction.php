<?php
declare(strict_types=1);
namespace App\Action\Device;

use App\Domain\Entity\DeviceToken;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class UnregisterDeviceAction
{
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        if (empty($data['token'])) return $this->validationError(['token' => 'Token required']);

        $device = $this->em->getRepository(DeviceToken::class)->findOneBy(['token' => trim($data['token'])]);
        if ($device) {
            $device->setIsActive(false);
            $this->em->flush();
        }

        return $this->success(null, 'Device unregistered');
    }
}
