<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\DepreciationEntry;
use App\Domain\Entity\FixedAsset;
use App\Domain\Entity\GeneralLedger;
use App\Domain\Enum\JournalEntryType;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use Doctrine\ORM\EntityManagerInterface;

/**
 * FixedAssetService — register, depreciate, and dispose fixed assets.
 *
 * GL codes used (seeded in chart of accounts):
 *   FIXASSET  Fixed Assets at cost (asset)
 *   ACCDEP    Accumulated Depreciation (contra-asset)
 *   DEPEXP    Depreciation Expense
 *   BANK      default funding / proceeds account
 *   OTHINC    gain on disposal; GENADMIN absorbs loss on disposal
 *
 * Depreciation is straight-line: monthly = (cost − salvage) / life, charged
 * until net book value reaches salvage. One DepreciationEntry per asset per
 * period (unique) makes runs idempotent.
 */
final class FixedAssetService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly PeriodGuardService $periodGuard,
        private readonly LedgerService $ledgerService,
    ) {}

    /**
     * Register an asset. When $fundingGlCode is provided, the acquisition is
     * capitalised: DR Fixed Assets / CR <funding>. Otherwise the asset is
     * recorded for depreciation only (assumed already on the books).
     */
    public function register(array $data, ?string $userId): FixedAsset
    {
        $cost = $this->money((string) ($data['cost'] ?? '0'));
        if (bccomp($cost, '0.00', 2) <= 0) {
            throw new DomainException('Asset cost must be greater than zero');
        }
        $acqDate = (string) ($data['acquisition_date'] ?? date('Y-m-d'));
        $this->assertDate($acqDate);

        $asset = new FixedAsset();
        $asset->setAssetTag(trim((string) ($data['asset_tag'] ?? '')) ?: FixedAsset::generateTag());
        $asset->setName(trim((string) ($data['name'] ?? '')) ?: 'Unnamed asset');
        $asset->setCategory(isset($data['category']) && $data['category'] !== '' ? (string) $data['category'] : null);
        $asset->setAcquisitionDate(new \DateTimeImmutable($acqDate));
        $asset->setCost($cost);
        $asset->setSalvageValue($this->money((string) ($data['salvage_value'] ?? '0')));
        $asset->setUsefulLifeMonths((int) ($data['useful_life_months'] ?? 12));
        $asset->setCreatedBy($userId);

        $fundingCode = isset($data['funding_gl_code']) && $data['funding_gl_code'] !== '' ? (string) $data['funding_gl_code'] : null;

        $this->em->beginTransaction();
        try {
            $this->em->persist($asset);

            if ($fundingCode !== null) {
                $this->periodGuard->assertDateOpen($acqDate);
                $fixGl = $this->gl('FIXASSET');
                $fundGl = $this->gl($fundingCode);
                $callback = 'FA-ACQ-' . $asset->getAssetTag();
                $this->ledgerService->postJournal(
                    entryType: JournalEntryType::MANUAL,
                    postingDate: $acqDate,
                    narration: 'Fixed asset acquired — ' . $asset->getName(),
                    postedBy: $userId,
                    lines: [
                        ['gl' => $fixGl, 'type' => TransactionType::DR, 'amount' => $cost, 'narration' => 'Asset capitalised - ' . $asset->getAssetTag()],
                        ['gl' => $fundGl, 'type' => TransactionType::CR, 'amount' => $cost, 'narration' => 'Asset funding - ' . $asset->getAssetTag()],
                    ],
                    legacyCallback: $callback,
                    reference: $asset->getAssetTag(),
                );
            }

            $this->em->flush();
            $this->em->commit();
            return $asset;
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) $this->em->rollback();
            throw $e;
        }
    }

    /** Compute the depreciation a period would charge, without posting. */
    public function depreciatePreview(string $year, string $month): array
    {
        [$year, $month] = $this->normalisePeriod($year, $month);
        $postingDate = $this->lastDay($year, $month);
        $lines = $this->computeDepreciation($year, $month, $postingDate);
        $total = '0.00';
        foreach ($lines as $l) $total = bcadd($total, $l['amount'], 2);
        return [
            'period' => "{$year}-{$month}", 'posting_date' => $postingDate,
            'lines' => $lines, 'summary' => ['asset_count' => count($lines), 'total' => $total],
        ];
    }

    /** Post a period's depreciation (DR DEPEXP / CR ACCDEP for the total). */
    public function depreciateRun(string $year, string $month, ?string $userId = null): array
    {
        [$year, $month] = $this->normalisePeriod($year, $month);
        $postingDate = $this->lastDay($year, $month);
        $this->periodGuard->assertDateOpen($postingDate);

        $depExp = $this->gl('DEPEXP');
        $accDep = $this->gl('ACCDEP');
        $lines = $this->computeDepreciation($year, $month, $postingDate);
        if (empty($lines)) {
            return ['period' => "{$year}-{$month}", 'posting_date' => $postingDate, 'asset_count' => 0, 'total' => '0.00'];
        }

        $this->em->beginTransaction();
        try {
            $total = '0.00';
            $callback = 'DEP-' . $year . $month . '-' . bin2hex(random_bytes(4));
            foreach ($lines as $l) {
                /** @var FixedAsset $asset */
                $asset = $this->em->getReference(FixedAsset::class, $l['asset_id']);
                $entry = new DepreciationEntry();
                $entry->setAsset($asset);
                $entry->setPeriodYear($year);
                $entry->setPeriodMonth($month);
                $entry->setAmount($l['amount']);
                $entry->setPostingDate(new \DateTimeImmutable($postingDate));
                $entry->setCallbackRef($callback);
                $this->em->persist($entry);

                // Update running accumulated depreciation + status.
                $newAccum = bcadd($asset->getAccumulatedDepreciation(), $l['amount'], 2);
                $asset->setAccumulatedDepreciation($newAccum);
                if (bccomp($newAccum, $asset->depreciableBase(), 2) >= 0) {
                    $asset->setStatus('fully_depreciated');
                }
                $total = bcadd($total, $l['amount'], 2);
            }

            $this->ledgerService->postJournal(
                entryType: JournalEntryType::MANUAL,
                postingDate: $postingDate,
                narration: "Depreciation — {$year}-{$month}",
                postedBy: $userId,
                lines: [
                    ['gl' => $depExp, 'type' => TransactionType::DR, 'amount' => $total, 'narration' => "Depreciation expense {$year}-{$month}"],
                    ['gl' => $accDep, 'type' => TransactionType::CR, 'amount' => $total, 'narration' => "Accumulated depreciation {$year}-{$month}"],
                ],
                legacyCallback: $callback,
            );

            $this->em->flush();
            $this->em->commit();
            return ['period' => "{$year}-{$month}", 'posting_date' => $postingDate, 'asset_count' => count($lines), 'total' => $total];
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) $this->em->rollback();
            throw $e;
        }
    }

    /**
     * Dispose an asset. Removes cost + accumulated depreciation, books the
     * proceeds and the resulting gain/loss.
     */
    public function dispose(string $assetId, string $disposalDate, string $proceeds, ?string $userId): FixedAsset
    {
        $this->assertDate($disposalDate);
        /** @var FixedAsset|null $asset */
        $asset = $this->em->find(FixedAsset::class, $assetId);
        if ($asset === null) throw new DomainException('Asset not found');
        if ($asset->getStatus() === 'disposed') throw new DomainException('Asset already disposed');

        $this->periodGuard->assertDateOpen($disposalDate);
        $proceeds = $this->money($proceeds);
        $cost = $asset->getCost();
        $accum = $asset->getAccumulatedDepreciation();

        $fixGl = $this->gl('FIXASSET');
        $accGl = $this->gl('ACCDEP');
        $bankGl = $this->gl('BANK');

        // DR ACCDEP (accumulated) + DR BANK (proceeds) vs CR FIXASSET (cost).
        // Residual is gain (CR OTHINC) or loss (DR GENADMIN).
        $lines = [
            ['gl' => $accGl, 'type' => TransactionType::DR, 'amount' => $accum, 'narration' => 'Remove accumulated depreciation - ' . $asset->getAssetTag()],
            ['gl' => $fixGl, 'type' => TransactionType::CR, 'amount' => $cost, 'narration' => 'Remove asset cost - ' . $asset->getAssetTag()],
        ];
        if (bccomp($proceeds, '0.00', 2) > 0) {
            $lines[] = ['gl' => $bankGl, 'type' => TransactionType::DR, 'amount' => $proceeds, 'narration' => 'Disposal proceeds - ' . $asset->getAssetTag()];
        }
        $debits = bcadd($accum, $proceeds, 2);
        $diff = bcsub($debits, $cost, 2); // >0 gain, <0 loss
        if (bccomp($diff, '0.00', 2) > 0) {
            $lines[] = ['gl' => $this->gl('OTHINC'), 'type' => TransactionType::CR, 'amount' => $diff, 'narration' => 'Gain on disposal - ' . $asset->getAssetTag()];
        } elseif (bccomp($diff, '0.00', 2) < 0) {
            $lines[] = ['gl' => $this->gl('GENADMIN'), 'type' => TransactionType::DR, 'amount' => $this->abs($diff), 'narration' => 'Loss on disposal - ' . $asset->getAssetTag()];
        }
        // Filter zero amounts (e.g. accum=0).
        $lines = array_values(array_filter($lines, fn($l) => bccomp((string) $l['amount'], '0.00', 2) > 0));

        $this->em->beginTransaction();
        try {
            $this->ledgerService->postJournal(
                entryType: JournalEntryType::MANUAL,
                postingDate: $disposalDate,
                narration: 'Fixed asset disposal — ' . $asset->getName(),
                postedBy: $userId,
                lines: $lines,
                legacyCallback: 'FA-DISP-' . $asset->getAssetTag() . '-' . date('YmdHis'),
                reference: $asset->getAssetTag(),
            );
            $asset->setStatus('disposed');
            $asset->setDisposedAt(new \DateTimeImmutable($disposalDate));
            $asset->setDisposalProceeds($proceeds);
            $this->em->flush();
            $this->em->commit();
            return $asset;
        } catch (\Throwable $e) {
            if ($this->em->getConnection()->isTransactionActive()) $this->em->rollback();
            throw $e;
        }
    }

    // ─── internal ──────────────────────────────────────────────────

    /**
     * Per-asset depreciation for the period: active assets acquired on/before
     * period end, not yet fully depreciated, without an entry for this period.
     *
     * @return array<int, array{asset_id:string, asset_tag:string, amount:string}>
     */
    private function computeDepreciation(string $year, string $month, string $postingDate): array
    {
        $assets = $this->em->getRepository(FixedAsset::class)->findBy(['status' => 'active']);
        $out = [];
        foreach ($assets as $a) {
            if ($a->getAcquisitionDate()->format('Y-m-d') > $postingDate) continue;
            $remaining = bcsub($a->depreciableBase(), $a->getAccumulatedDepreciation(), 2);
            if (bccomp($remaining, '0.00', 2) <= 0) continue;
            // Skip if already depreciated this period.
            $exists = $this->em->getRepository(DepreciationEntry::class)
                ->findOneBy(['asset' => $a->getId(), 'periodYear' => $year, 'periodMonth' => $month]);
            if ($exists !== null) continue;

            $charge = $a->monthlyDepreciation();
            if (bccomp($charge, $remaining, 2) > 0) $charge = $remaining; // final partial month
            if (bccomp($charge, '0.00', 2) <= 0) continue;
            $out[] = ['asset_id' => $a->getId(), 'asset_tag' => $a->getAssetTag(), 'amount' => $charge];
        }
        return $out;
    }

    private function gl(string $code): GeneralLedger
    {
        $gl = $this->em->getRepository(GeneralLedger::class)->findOneBy(['accountCode' => $code]);
        if ($gl === null) throw new DomainException("GL account '{$code}' not found. Run seeder.");
        return $gl;
    }

    private function money(string $v): string { return number_format((float) $v, 2, '.', ''); }
    private function abs(string $n): string { return str_starts_with($n, '-') ? substr($n, 1) : $n; }

    private function assertDate(string $d): void
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) throw new DomainException('Invalid date — expected YYYY-MM-DD');
    }

    /** @return array{0:string,1:string} */
    private function normalisePeriod(string $year, string $month): array
    {
        $y = preg_replace('/\D/', '', $year);
        $m = str_pad(preg_replace('/\D/', '', $month), 2, '0', STR_PAD_LEFT);
        if (!preg_match('/^\d{4}$/', $y) || !preg_match('/^(0[1-9]|1[0-2])$/', $m)) {
            throw new DomainException('Invalid period — expected year YYYY and month 01-12');
        }
        return [$y, $m];
    }

    private function lastDay(string $year, string $month): string
    {
        return (new \DateTimeImmutable("{$year}-{$month}-01"))->modify('last day of this month')->format('Y-m-d');
    }
}
