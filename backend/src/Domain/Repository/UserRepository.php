<?php

declare(strict_types=1);

namespace App\Domain\Repository;

use App\Domain\Entity\User;

class UserRepository extends BaseRepository
{
    protected function getEntityClass(): string
    {
        return User::class;
    }

    public function findByEmail(string $email): ?User
    {
        return $this->findOneBy(['email' => strtolower($email)]);
    }

    public function findByResetToken(string $token): ?User
    {
        return $this->findOneBy(['resetToken' => $token]);
    }

    public function emailExists(string $email, ?string $excludeId = null): bool
    {
        $qb = $this->em->createQueryBuilder()
            ->select('COUNT(u.id)')
            ->from(User::class, 'u')
            ->where('LOWER(u.email) = :email')
            ->setParameter('email', strtolower($email));

        if ($excludeId !== null) {
            $qb->andWhere('u.id != :excludeId')
               ->setParameter('excludeId', $excludeId);
        }

        return (int) $qb->getQuery()->getSingleScalarResult() > 0;
    }

    /**
     * @return array{items: User[], total: int}
     */
    public function paginated(
        int $offset,
        int $limit,
        string $sortBy = 'createdAt',
        string $sortDir = 'DESC',
        ?string $search = null,
        ?string $status = null,
        ?string $roleSlug = null,
    ): array {
        $qb = $this->em->createQueryBuilder()
            ->select('u')
            ->from(User::class, 'u')
            ->where('u.deletedAt IS NULL');

        if ($status !== null) {
            $qb->andWhere('u.status = :status')
               ->setParameter('status', $status);
        }

        if ($roleSlug !== null) {
            $qb->innerJoin('u.roles', 'r')
               ->andWhere('r.slug = :roleSlug')
               ->setParameter('roleSlug', $roleSlug);
        }

        return $this->paginatedQuery(
            $qb, 'u', $offset, $limit, $sortBy, $sortDir,
            $search, ['firstName', 'lastName', 'email', 'phone']
        );
    }
}
