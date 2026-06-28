<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * TaxRate — a configurable VAT or WHT rate.
 *
 * type: 'VAT' (value-added tax) | 'WHT' (withholding tax). rate is a decimal
 * fraction (0.075 = 7.5%). Used by TaxService to compute tax on a base.
 */
#[ORM\Entity]
#[ORM\Table(name: 'tax_rates')]
#[ORM\HasLifecycleCallbacks]
class TaxRate
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 40, unique: true)]
    private string $code;

    #[ORM\Column(type: 'string', length: 120)]
    private string $name;

    /** 'VAT' | 'WHT' */
    #[ORM\Column(type: 'string', length: 10)]
    private string $type;

    /** Decimal fraction, e.g. 0.0750 for 7.5%. */
    #[ORM\Column(type: 'decimal', precision: 6, scale: 4)]
    private string $rate = '0.0000';

    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $description = null;

    #[ORM\Column(name: 'is_active', type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getCode(): string { return $this->code; }
    public function setCode(string $v): void { $this->code = $v; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): void { $this->name = $v; }
    public function getType(): string { return $this->type; }
    public function setType(string $v): void { $this->type = strtoupper($v); }
    public function getRate(): string { return $this->rate; }
    public function setRate(string $v): void { $this->rate = $v; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): void { $this->description = $v; }
    public function isActive(): bool { return $this->isActive; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    public function toArray(): array
    {
        return [
            'id'          => $this->id,
            'code'        => $this->code,
            'name'        => $this->name,
            'type'        => $this->type,
            'rate'        => $this->rate,
            'rate_pct'    => number_format((float) $this->rate * 100, 2, '.', ''),
            'description' => $this->description,
            'is_active'   => $this->isActive,
        ];
    }
}
