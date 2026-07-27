<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\CreditCheck;

class CreditCheckRepository extends BaseRepository
{
    protected function getEntityClass(): string { return CreditCheck::class; }

    /** Most recent check for a loan (used by the approval step + loan detail). */
    public function findLatestForLoan(string $loanId): ?CreditCheck
    {
        return $this->em->createQueryBuilder()->select('c')->from(CreditCheck::class, 'c')
            ->where('c.loan = :l')->setParameter('l', $loanId)
            ->orderBy('c.createdAt', 'DESC')->setMaxResults(1)
            ->getQuery()->getOneOrNullResult();
    }

    /**
     * Enquiry history with the module's filter set.
     *
     * @param array{status?:?string, subject_type?:?string, risk_band?:?string, provider?:?string,
     *              decision?:?string, linked?:?string, date_from?:?string, date_to?:?string} $filters
     *        linked: 'loan' (raised inside a loan workflow) | 'standalone' (Credit Bureau module).
     * @return array{items: CreditCheck[], total: int}
     */
    public function findPaginated(
        int $offset,
        int $limit,
        ?string $search = null,
        array $filters = [],
        string $sortBy = 'createdAt',
        string $sortDir = 'DESC',
    ): array {
        $qb = $this->em->createQueryBuilder()->select('c')->from(CreditCheck::class, 'c')
            ->leftJoin('c.customer', 'cu')
            ->leftJoin('c.loan', 'l')
            ->leftJoin('c.initiatedBy', 'u');

        foreach (['status' => 'c.status', 'subject_type' => 'c.subjectType', 'provider' => 'c.provider', 'decision' => 'c.decision'] as $key => $field) {
            $v = trim((string) ($filters[$key] ?? ''));
            if ($v !== '') {
                $qb->andWhere("{$field} = :{$key}")->setParameter($key, $v);
            }
        }

        // Risk band is provider free-text ("LOW RISK", "HIGH RISK"…), so match
        // case-insensitively rather than on an exact enum we don't control.
        $band = trim((string) ($filters['risk_band'] ?? ''));
        if ($band !== '') {
            $qb->andWhere('LOWER(c.riskBand) = :band')->setParameter('band', strtolower($band));
        }

        $linked = trim((string) ($filters['linked'] ?? ''));
        if ($linked === 'loan') {
            $qb->andWhere('c.loan IS NOT NULL');
        } elseif ($linked === 'standalone') {
            $qb->andWhere('c.loan IS NULL');
        }

        $from = trim((string) ($filters['date_from'] ?? ''));
        if ($from !== '') {
            $qb->andWhere('c.createdAt >= :from')->setParameter('from', new \DateTime($from . ' 00:00:00'));
        }
        $to = trim((string) ($filters['date_to'] ?? ''));
        if ($to !== '') {
            $qb->andWhere('c.createdAt <= :to')->setParameter('to', new \DateTime($to . ' 23:59:59'));
        }

        if ($search !== null && $search !== '') {
            $qb->andWhere($qb->expr()->orX(
                $qb->expr()->like('LOWER(c.identifier)', ':q'),
                // The bureau's own name for the subject — for a standalone
                // enquiry this is the only name there is to search on.
                $qb->expr()->like('LOWER(c.subjectName)', ':q'),
                $qb->expr()->like('LOWER(cu.fullName)', ':q'),
                $qb->expr()->like('LOWER(l.applicationId)', ':q'),
                $qb->expr()->like('LOWER(c.providerRef)', ':q'),
                // User has no fullName column — it is composed in PHP.
                $qb->expr()->like('LOWER(u.firstName)', ':q'),
                $qb->expr()->like('LOWER(u.lastName)', ':q'),
            ))->setParameter('q', '%' . strtolower($search) . '%');
        }

        $countQb = clone $qb;
        $total = (int) $countQb->select('COUNT(c.id)')->getQuery()->getSingleScalarResult();

        // Whitelist: sort keys arrive camelCased by getPaginationParams().
        $dir = strtoupper($sortDir) === 'ASC' ? 'ASC' : 'DESC';
        $orderCol = match ($sortBy) {
            'score'        => 'c.score',
            'status'       => 'c.status',
            'riskBand'     => 'c.riskBand',
            'identifier'   => 'c.identifier',
            'subjectType'  => 'c.subjectType',
            'customerName' => 'cu.fullName',
            'initiatedBy'  => 'u.lastName',
            default        => 'c.createdAt',
        };

        $qb->orderBy($orderCol, $dir)->setFirstResult($offset)->setMaxResults($limit);
        return ['items' => $qb->getQuery()->getResult(), 'total' => $total];
    }

    /**
     * Distinct values actually present in the history, so the filter dropdowns
     * only offer options that can return rows (bands are provider text).
     *
     * @return array{statuses: string[], subject_types: string[], risk_bands: string[], decisions: string[]}
     */
    public function facets(): array
    {
        $col = function (string $field): array {
            // Bound parameter rather than a '' literal: DQL literals are quoted
            // through the connection at SQL-generation time.
            $rows = $this->em->createQueryBuilder()
                ->select("DISTINCT c.{$field} AS v")->from(CreditCheck::class, 'c')
                ->where("c.{$field} IS NOT NULL")->andWhere("c.{$field} <> :blank")
                ->setParameter('blank', '')
                ->orderBy("c.{$field}", 'ASC')
                ->getQuery()->getScalarResult();
            return array_values(array_map(static fn($r) => (string) $r['v'], $rows));
        };

        return [
            'statuses'      => $col('status'),
            'subject_types' => $col('subjectType'),
            'risk_bands'    => $col('riskBand'),
            'decisions'     => $col('decision'),
        ];
    }
}
