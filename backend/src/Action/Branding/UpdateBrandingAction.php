<?php
declare(strict_types=1);
namespace App\Action\Branding;

use App\Infrastructure\Service\{ApiResponse, BrandingService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

/**
 * PUT /api/branding — save org branding (colors + company name).
 * Body: { primary_color, accent_color, company_name }
 * Logo is uploaded separately via POST /api/branding/logo.
 */
final class UpdateBrandingAction
{
    use ApiResponse;

    public function __construct(private readonly BrandingService $branding) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $errors = [];

        $primary = isset($data['primary_color']) ? trim((string) $data['primary_color']) : null;
        $accent  = isset($data['accent_color'])  ? trim((string) $data['accent_color'])  : null;
        $company = isset($data['company_name'])  ? trim((string) $data['company_name'])  : null;

        $hex = '/^#[0-9a-fA-F]{6}$/';
        if ($primary !== null && !preg_match($hex, $primary)) $errors['primary_color'] = 'Must be a 6-digit hex colour, e.g. #0A4F2A.';
        if ($accent  !== null && !preg_match($hex, $accent))  $errors['accent_color']  = 'Must be a 6-digit hex colour, e.g. #C9A227.';
        if ($company !== null && $company === '')             $errors['company_name']  = 'Company name cannot be empty.';
        if (!empty($errors)) return $this->validationError($errors);

        $kv = [];
        if ($primary !== null) $kv['brand.primary_color'] = $primary;
        if ($accent  !== null) $kv['brand.accent_color']  = $accent;
        if ($company !== null) $kv['general.company_name'] = $company;
        if (!empty($kv)) $this->branding->set($kv);

        return $this->success($this->branding->get(), 'Branding updated');
    }
}
