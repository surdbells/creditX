<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

use App\Domain\Entity\LedgerTransaction;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use App\Domain\Repository\LedgerTransactionRepository;
use Doctrine\ORM\EntityManagerInterface;

final class JournalReversalService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly LedgerTransactionRepository $txRepo,
    ) {}

    /**
     * Reverse a posted journal entry by creating mirror CR/DR entries.
     */
    public function reverse(string $transactionId, ?string $userId = null, ?string $reason = null): array
    {
        $original = $this->txRepo->find($transactionId);
        if ($original === null) throw new DomainException('Transaction not found');
        if ($original->getReversalOfId() !== null) throw new DomainException('Cannot reverse a reversal entry');

        // Check if already reversed
        $existing = $this->em->createQueryBuilder()
            ->select('COUNT(t.id)')->from(LedgerTransaction::class, 't')
            ->where('t.reversalOfId = :oid')->setParameter('oid', $transactionId)
            ->getQuery()->getSingleScalarResult();
        if ((int) $existing > 0) throw new DomainException('Transaction has already been reversed');

        // Also reverse all entries with the same callback (batch)
        $batchEntries = [];
        if ($original->getTransCallback()) {
            $batchEntries = $this->txRepo->findByCallback($original->getTransCallback());
        } else {
            $batchEntries = [$original];
        }

        $reversalCallback = 'REV-' . ($original->getTransCallback() ?? $original->getId()) . '-' . date('YmdHis');
        $dateParts = [date('Y'), date('m'), date('d')];
        $reversedIds = [];

        foreach ($batchEntries as $entry) {
            $reversal = new LedgerTransaction();
            $reversal->setGeneralLedger($entry->getGeneralLedger());
            $reversal->setCustomerLedger($entry->getCustomerLedger());
            // Swap CR/DR
            $reversal->setTransType($entry->getTransType() === TransactionType::CR ? TransactionType::DR : TransactionType::CR);
            $reversal->setTransAmount($entry->getTransAmount());
            $reversal->setTransNarration('REVERSAL: ' . ($reason ? $reason . ' — ' : '') . $entry->getTransNarration());
            $reversal->setTransReference($entry->getTransReference());
            $reversal->setTransCallback($reversalCallback);
            $reversal->setTransDate($dateParts[0], $dateParts[1], $dateParts[2]);
            $reversal->setPostedBy($userId);
            $reversal->setReversalOfId($entry->getId());
            $this->em->persist($reversal);
            $reversedIds[] = $entry->getId();
        }

        $this->em->flush();

        return [
            'reversal_callback' => $reversalCallback,
            'reversed_entries' => count($reversedIds),
            'original_callback' => $original->getTransCallback(),
        ];
    }
}
