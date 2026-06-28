<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * FixedAsset — an item in the fixed-asset register.
 *
 * Straight-line depreciation: monthly charge = (cost − salvage) /
 * useful_life_months, accumulated until net book value reaches salvage.
 * Acquisition optionally posts DR Fixed Assets / CR <funding GL>;
 * depreciation posts DR Depreciation Expense / CR Accumulated Depreciation
 * (see FixedAssetService). Disposal removes cost + accumulated depreciation
 * and books the gain/loss against the proceeds.
 */
#[ORM\Entity]
#[ORM\Table(name: 'fixed_assets')]
#[ORM\Index(name: 'idx_fixedasset_status', columns: ['status'])]
#[ORM\HasLifecycleCallbacks]
class FixedAsset
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(name: 'asset_tag', type: 'string', length: 40, unique: true)]
    private string $assetTag;

    #[ORM\Column(type: 'string', length: 200)]
    private string $name;

    #[ORM\Column(type: 'string', length: 80, nullable: true)]
    private ?string $category = null;

    #[ORM\Column(name: 'acquisition_date', type: 'date')]
    private \DateTimeInterface $acquisitionDate;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $cost = '0.00';

    #[ORM\Column(name: 'salvage_value', type: 'decimal', precision: 15, scale: 2)]
    private string $salvageValue = '0.00';

    #[ORM\Column(name: 'useful_life_months', type: 'integer')]
    private int $usefulLifeMonths = 12;

    /** Running accumulated depreciation, kept in step with the GL. */
    #[ORM\Column(name: 'accumulated_depreciation', type: 'decimal', precision: 15, scale: 2)]
    private string $accumulatedDepreciation = '0.00';

    /** 'active' | 'fully_depreciated' | 'disposed' */
    #[ORM\Column(type: 'string', length: 20)]
    private string $status = 'active';

    #[ORM\Column(name: 'disposed_at', type: 'date', nullable: true)]
    private ?\DateTimeInterface $disposedAt = null;

    #[ORM\Column(name: 'disposal_proceeds', type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $disposalProceeds = null;

    #[ORM\Column(type: 'string', length: 36, nullable: true)]
    private ?string $createdBy = null;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public static function generateTag(): string
    {
        return 'FA-' . strtoupper(bin2hex(random_bytes(4)));
    }

    public function getId(): string { return $this->id; }
    public function getAssetTag(): string { return $this->assetTag; }
    public function setAssetTag(string $v): void { $this->assetTag = $v; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): void { $this->name = $v; }
    public function getCategory(): ?string { return $this->category; }
    public function setCategory(?string $v): void { $this->category = $v; }
    public function getAcquisitionDate(): \DateTimeInterface { return $this->acquisitionDate; }
    public function setAcquisitionDate(\DateTimeInterface $v): void { $this->acquisitionDate = $v; }
    public function getCost(): string { return $this->cost; }
    public function setCost(string $v): void { $this->cost = $v; }
    public function getSalvageValue(): string { return $this->salvageValue; }
    public function setSalvageValue(string $v): void { $this->salvageValue = $v; }
    public function getUsefulLifeMonths(): int { return $this->usefulLifeMonths; }
    public function setUsefulLifeMonths(int $v): void { $this->usefulLifeMonths = max(1, $v); }
    public function getAccumulatedDepreciation(): string { return $this->accumulatedDepreciation; }
    public function setAccumulatedDepreciation(string $v): void { $this->accumulatedDepreciation = $v; }
    public function getStatus(): string { return $this->status; }
    public function setStatus(string $v): void { $this->status = $v; }
    public function getDisposedAt(): ?\DateTimeInterface { return $this->disposedAt; }
    public function setDisposedAt(?\DateTimeInterface $v): void { $this->disposedAt = $v; }
    public function getDisposalProceeds(): ?string { return $this->disposalProceeds; }
    public function setDisposalProceeds(?string $v): void { $this->disposalProceeds = $v; }
    public function getCreatedBy(): ?string { return $this->createdBy; }
    public function setCreatedBy(?string $v): void { $this->createdBy = $v; }

    /** Net book value = cost − accumulated depreciation. */
    public function bookValue(): string
    {
        return bcsub($this->cost, $this->accumulatedDepreciation, 2);
    }

    /** Total depreciable base = cost − salvage. */
    public function depreciableBase(): string
    {
        $base = bcsub($this->cost, $this->salvageValue, 2);
        return bccomp($base, '0.00', 2) > 0 ? $base : '0.00';
    }

    public function monthlyDepreciation(): string
    {
        return bcdiv($this->depreciableBase(), (string) $this->usefulLifeMonths, 2);
    }

    public function toArray(): array
    {
        return [
            'id'                       => $this->id,
            'asset_tag'                => $this->assetTag,
            'name'                     => $this->name,
            'category'                 => $this->category,
            'acquisition_date'         => $this->acquisitionDate->format('Y-m-d'),
            'cost'                     => $this->cost,
            'salvage_value'            => $this->salvageValue,
            'useful_life_months'       => $this->usefulLifeMonths,
            'accumulated_depreciation' => $this->accumulatedDepreciation,
            'book_value'               => $this->bookValue(),
            'monthly_depreciation'     => $this->monthlyDepreciation(),
            'status'                   => $this->status,
            'disposed_at'              => $this->disposedAt?->format('Y-m-d'),
            'disposal_proceeds'        => $this->disposalProceeds,
            'created_at'               => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
