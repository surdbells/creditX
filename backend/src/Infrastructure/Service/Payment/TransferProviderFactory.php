<?php
declare(strict_types=1);
namespace App\Infrastructure\Service\Payment;

use App\Domain\Exception\DomainException;
use App\Infrastructure\Service\SettingsCacheService;

/**
 * Resolves the active transfer provider. The default provider is read from
 * the `settlement.provider` admin setting; callers may override it per
 * settlement (e.g. the disbursement dialog lets an operator pick Paystack
 * or Flutterwave for a specific loan).
 */
final class TransferProviderFactory
{
    public function __construct(
        private readonly PaystackTransferProvider $paystack,
        private readonly FlutterwaveTransferProvider $flutterwave,
        private readonly SettingsCacheService $settings,
    ) {
    }

    /** The provider configured as the default in admin settings. */
    public function default(): TransferProviderInterface
    {
        return $this->byName($this->settings->get('settlement.provider', 'paystack'));
    }

    /** Resolve a provider by explicit name, falling back to the default. */
    public function resolve(?string $name): TransferProviderInterface
    {
        if ($name === null || $name === '') {
            return $this->default();
        }
        return $this->byName($name);
    }

    public function byName(string $name): TransferProviderInterface
    {
        return match (strtolower(trim($name))) {
            'paystack'    => $this->paystack,
            'flutterwave' => $this->flutterwave,
            default       => throw new DomainException("Unknown settlement provider: {$name}"),
        };
    }
}
