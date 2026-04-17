<?php
declare(strict_types=1);
namespace App\Action\Device;

use App\Domain\Entity\{DeviceToken, User};
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class RegisterDeviceAction
{
    use ApiResponse;
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $userId = $request->getAttribute('user_id');

        if (empty($data['token'])) {
            return $this->validationError(['token' => 'Device token is required']);
        }

        $user = $this->em->find(User::class, $userId);
        if (!$user) return $this->notFound('User not found');

        $platform = $data['platform'] ?? 'android';
        $token = trim($data['token']);

        // Check if token already exists
        $existing = $this->em->getRepository(DeviceToken::class)->findOneBy(['token' => $token]);
        if ($existing) {
            // Update: reassign to current user if different
            $existing->setUser($user);
            $existing->setPlatform($platform);
            $existing->setIsActive(true);
            $this->em->flush();
            return $this->success($existing->toArray(), 'Device token updated');
        }

        // Deactivate old tokens for this user on same platform (max 3 devices)
        $oldTokens = $this->em->getRepository(DeviceToken::class)->findBy(
            ['user' => $user, 'platform' => $platform, 'isActive' => true],
            ['createdAt' => 'ASC']
        );
        if (count($oldTokens) >= 3) {
            // Keep newest 2, deactivate oldest
            $oldTokens[0]->setIsActive(false);
        }

        $device = new DeviceToken();
        $device->setUser($user);
        $device->setToken($token);
        $device->setPlatform($platform);
        $this->em->persist($device);
        $this->em->flush();

        return $this->created($device->toArray(), 'Device registered');
    }
}
