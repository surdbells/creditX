<?php
declare(strict_types=1);
namespace App\Domain\Repository;

use App\Domain\Entity\CustomerLedger;

class CustomerLedgerRepository extends BaseRepository
{
    protected function getEntityClass(): string { return CustomerLedger::class; }

    public function findByLoan(string $loanId): ?CustomerLedger { return $this->findOneBy(['loan' => $loanId]); }

    public function findByCustomer(string $customerId): array { return $this->findBy(['customer' => $customerId], ['createdAt' => 'DESC']); }

    public function findByAccountNumber(string $num): ?CustomerLedger { return $this->findOneBy(['accountNumber' => $num]); }
}
