<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\GlAccountMapping;

class GlAccountMappingRepository extends BaseRepository
{
    protected function getEntityClass(): string { return GlAccountMapping::class; }

    public function findByRoleKey(string $roleKey): ?GlAccountMapping
    {
        return $this->findOneBy(['roleKey' => $roleKey]);
    }

    /**
     * All override rows keyed by role key, GL eagerly joined.
     *
     * @return array<string, GlAccountMapping>
     */
    public function allByRoleKey(): array
    {
        $rows = $this->em->createQueryBuilder()->select('m', 'g')->from(GlAccountMapping::class, 'm')
            ->leftJoin('m.glAccount', 'g')
            ->getQuery()->getResult();
        $out = [];
        foreach ($rows as $r) {
            $out[$r->getRoleKey()] = $r;
        }
        return $out;
    }
}
