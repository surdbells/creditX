<?php

declare(strict_types=1);

namespace App\Domain\Repository;

use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\EntityRepository;
use Doctrine\ORM\QueryBuilder;

abstract class BaseRepository
{
    protected EntityRepository $repo;

    public function __construct(protected readonly EntityManagerInterface $em)
    {
        $this->repo = $em->getRepository($this->getEntityClass());
    }

    abstract protected function getEntityClass(): string;

    public function find(string $id): ?object
    {
        return $this->repo->find($id);
    }

    public function findOrFail(string $id): object
    {
        $entity = $this->find($id);
        if ($entity === null) {
            throw new \App\Domain\Exception\EntityNotFoundException(
                $this->getShortName() . ' not found'
            );
        }
        return $entity;
    }

    public function findAll(): array
    {
        return $this->repo->findAll();
    }

    public function findBy(array $criteria, ?array $orderBy = null, ?int $limit = null, ?int $offset = null): array
    {
        return $this->repo->findBy($criteria, $orderBy, $limit, $offset);
    }

    public function findOneBy(array $criteria): ?object
    {
        return $this->repo->findOneBy($criteria);
    }

    public function persist(object $entity): void
    {
        $this->em->persist($entity);
    }

    public function remove(object $entity): void
    {
        $this->em->remove($entity);
    }

    public function flush(): void
    {
        $this->em->flush();
    }

    public function save(object $entity): void
    {
        $this->em->persist($entity);
        $this->em->flush();
    }

    /**
     * Paginated listing with search and sort.
     *
     * @return array{items: array, total: int}
     */
    protected function paginatedQuery(
        QueryBuilder $qb,
        string $alias,
        int $offset,
        int $limit,
        string $sortBy = 'createdAt',
        string $sortDir = 'DESC',
        ?string $search = null,
        array $searchFields = [],
    ): array {
        // Search
        if ($search !== null && $search !== '' && !empty($searchFields)) {
            $orConditions = [];
            foreach ($searchFields as $i => $field) {
                $paramName = 'search_' . $i;
                $orConditions[] = $qb->expr()->like("LOWER({$alias}.{$field})", ":{$paramName}");
                $qb->setParameter($paramName, '%' . strtolower($search) . '%');
            }
            $qb->andWhere($qb->expr()->orX(...$orConditions));
        }

        // Count total
        $countQb = clone $qb;
        $countQb->select("COUNT({$alias}.id)");
        $countQb->resetDQLPart('orderBy');
        $total = (int) $countQb->getQuery()->getSingleScalarResult();

        // Sort and paginate
        $qb->orderBy("{$alias}.{$sortBy}", $sortDir)
           ->setFirstResult($offset)
           ->setMaxResults($limit);

        $items = $qb->getQuery()->getResult();

        return ['items' => $items, 'total' => $total];
    }

    private function getShortName(): string
    {
        $class = $this->getEntityClass();
        $parts = explode('\\', $class);
        return end($parts);
    }
}
