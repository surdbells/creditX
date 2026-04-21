<?php
declare(strict_types=1);
namespace App\Action\User;

use App\Domain\Entity\User;
use App\Infrastructure\Service\ApiResponse;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * PATCH /api/users/me/preferences
 *
 * Updates per-user preferences on the authenticated user's record.
 * Currently supports:
 *   - font_scale (float, 0.85–1.20): drives the --cx-font-scale CSS variable
 *
 * Body: { "font_scale": 1.10 }
 * Only specified fields are updated. Unknown fields are ignored.
 */
final class UpdateMyPreferencesAction
{
    use ApiResponse;

    public function __construct(private readonly EntityManagerInterface $em) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = $request->getAttribute('user_id');
        if (!$userId) return $this->unauthorized();
        $user = $this->em->find(User::class, $userId);
        if (!$user instanceof User) return $this->unauthorized();

        $body = (array) ($request->getParsedBody() ?? []);
        $updated = [];

        if (array_key_exists('font_scale', $body)) {
            $scale = filter_var($body['font_scale'], FILTER_VALIDATE_FLOAT);
            if ($scale === false) {
                return $this->validationError(['font_scale' => 'Must be a number between 0.85 and 1.20']);
            }
            $user->setFontScale($scale);
            $updated['font_scale'] = $user->getFontScale();
        }

        if (empty($updated)) {
            return $this->validationError(['_' => 'No supported preferences provided']);
        }

        $this->em->flush();

        return $this->success([
            'preferences' => $updated,
        ], 'Preferences updated');
    }
}
