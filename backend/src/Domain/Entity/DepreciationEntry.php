<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * DepreciationEntry — one asset's depreciation charge for one period.
 *
 * One row per (asset, year, month). Posting a period's depreciation creates
 * an entry per active asset and one journal (DR Depreciation Expense / CR
 * Accumulated Depreciation) for the total. A unique (asset, period) guard
 * keeps re-runs idempotent.
 */
#[ORM\Entity]
#[ORM\Table(name: 'depreciation_entries')]
#[ORM\UniqueConstraint(name: 'uniq_dep_asset_period', columns: ['asset_id', 'period_year', 'period_month'])]
#[ORM\Index(name: 'idx_dep_period', columns: ['period_year', 'period_month'])]
#[ORM\HasLifecycleCallbacks]
class DepreciationEntry
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: FixedAsset::class)]
    #[ORM\JoinColumn(name: 'asset_id', referencedColumnName: 'id', nullable: false)]
    private FixedAsset $asset;

    #[ORM\Column(name: 'period_year', type: 'string', length: 4)]
    private string $periodYear;

    #[ORM\Column(name: 'period_month', type: 'string', length: 2)]
    private string $periodMonth;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2)]
    private string $amount = '0.00';

    #[ORM\Column(name: 'posting_date', type: 'date')]
    private \DateTimeInterface $postingDate;

    #[ORM\Column(name: 'callback_ref', type: 'string', length: 100, nullable: true)]
    private ?string $callbackRef = null;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getAsset(): FixedAsset { return $this->asset; }
    public function setAsset(FixedAsset $v): void { $this->asset = $v; }
    public function getPeriodYear(): string { return $this->periodYear; }
    public function setPeriodYear(string $v): void { $this->periodYear = $v; }
    public function getPeriodMonth(): string { return $this->periodMonth; }
    public function setPeriodMonth(string $v): void { $this->periodMonth = $v; }
    public function getAmount(): string { return $this->amount; }
    public function setAmount(string $v): void { $this->amount = $v; }
    public function getPostingDate(): \DateTimeInterface { return $this->postingDate; }
    public function setPostingDate(\DateTimeInterface $v): void { $this->postingDate = $v; }
    public function getCallbackRef(): ?string { return $this->callbackRef; }
    public function setCallbackRef(?string $v): void { $this->callbackRef = $v; }

    public function toArray(): array
    {
        return [
            'id'           => $this->id,
            'asset_id'     => $this->asset->getId(),
            'asset_tag'    => $this->asset->getAssetTag(),
            'period'       => $this->periodYear . '-' . $this->periodMonth,
            'amount'       => $this->amount,
            'posting_date' => $this->postingDate->format('Y-m-d'),
        ];
    }
}
