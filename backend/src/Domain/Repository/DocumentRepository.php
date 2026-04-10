<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\Document;

class DocumentRepository extends BaseRepository
{
    protected function getEntityClass(): string { return Document::class; }

    /** @return Document[] */
    public function findByCustomer(string $customerId): array
    {
        return $this->findBy(['customer' => $customerId], ['createdAt' => 'DESC']);
    }

    /** @return Document[] */
    public function findByLoan(string $loanId): array
    {
        return $this->findBy(['loanId' => $loanId], ['createdAt' => 'DESC']);
    }
}
