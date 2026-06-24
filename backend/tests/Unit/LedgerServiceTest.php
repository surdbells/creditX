<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\Entity\GeneralLedger;
use App\Domain\Enum\AccountType;
use App\Domain\Enum\JournalEntryType;
use App\Domain\Enum\TransactionType;
use App\Domain\Exception\DomainException;
use App\Infrastructure\Service\LedgerService;
use App\Infrastructure\Service\RedisService;
use App\Infrastructure\Service\SettingsCacheService;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\TestCase;
use Predis\Client as RedisClient;

/**
 * Unit tests for LedgerService::postJournal's pre-flight validation —
 * the double-entry guard that protects every posting in the system.
 *
 * These exercise the validation that runs BEFORE any database access,
 * so no real EntityManager/connection is needed: an unbalanced or
 * malformed batch must throw before a single row is persisted. That
 * "fail before persist" property is itself part of the contract (a
 * rejected batch must not leave half-written rows behind).
 */
final class LedgerServiceTest extends TestCase
{
    private function service(): LedgerService
    {
        // postJournal's rejection paths never touch the EM or settings,
        // so strict mocks double as assertions that nothing was persisted.
        $em = $this->createMock(EntityManagerInterface::class);
        $em->expects($this->never())->method('persist');
        $em->expects($this->never())->method('flush');

        // SettingsCacheService and RedisService are both declared `final`, so
        // PHPUnit can't double them. The validation paths under test never
        // read a setting (and therefore never issue a Redis command), so a
        // real SettingsCacheService backed by a lazily-connecting Predis
        // client is safe — no live Redis is required.
        $settings = new SettingsCacheService($em, new RedisService(new RedisClient()));

        return new LedgerService($em, $settings);
    }

    private function gl(string $code): GeneralLedger
    {
        $gl = new GeneralLedger();
        $gl->setAccountName($code);
        $gl->setAccountNumber($code);
        $gl->setAccountCode($code);
        $gl->setAccountType(AccountType::ASSET);
        return $gl;
    }

    public function testRejectsEmptyLineArray(): void
    {
        $this->expectException(DomainException::class);
        $this->service()->postJournal(
            JournalEntryType::MANUAL, '2026-06-24', 'Empty', null, []
        );
    }

    public function testRejectsUnbalancedLines(): void
    {
        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/unbalanced/i');

        $this->service()->postJournal(
            JournalEntryType::MANUAL, '2026-06-24', 'Lopsided', null,
            [
                ['gl' => $this->gl('BANK'), 'type' => TransactionType::DR, 'amount' => '100.00', 'narration' => 'a'],
                ['gl' => $this->gl('II'),   'type' => TransactionType::CR, 'amount' => '90.00',  'narration' => 'b'],
            ]
        );
    }

    public function testRejectsZeroOrNegativeAmount(): void
    {
        $this->expectException(DomainException::class);
        $this->service()->postJournal(
            JournalEntryType::MANUAL, '2026-06-24', 'Bad amount', null,
            [
                ['gl' => $this->gl('BANK'), 'type' => TransactionType::DR, 'amount' => '0.00', 'narration' => 'a'],
                ['gl' => $this->gl('II'),   'type' => TransactionType::CR, 'amount' => '0.00', 'narration' => 'b'],
            ]
        );
    }

    public function testRejectsMissingNarration(): void
    {
        $this->expectException(DomainException::class);
        $this->service()->postJournal(
            JournalEntryType::MANUAL, '2026-06-24', 'No line narration', null,
            [
                ['gl' => $this->gl('BANK'), 'type' => TransactionType::DR, 'amount' => '10.00', 'narration' => ''],
                ['gl' => $this->gl('II'),   'type' => TransactionType::CR, 'amount' => '10.00', 'narration' => 'b'],
            ]
        );
    }

    public function testRejectsReversalWithoutReversalOfId(): void
    {
        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/reversalOfId/');

        $this->service()->postJournal(
            JournalEntryType::REVERSAL, '2026-06-24', 'Bad reversal', null,
            [
                ['gl' => $this->gl('BANK'), 'type' => TransactionType::DR, 'amount' => '10.00', 'narration' => 'a'],
                ['gl' => $this->gl('II'),   'type' => TransactionType::CR, 'amount' => '10.00', 'narration' => 'b'],
            ],
            isReversal: true,
            reversalOfId: null,
        );
    }

    public function testRejectsReversalOfIdWithoutReversalFlag(): void
    {
        $this->expectException(DomainException::class);
        $this->service()->postJournal(
            JournalEntryType::MANUAL, '2026-06-24', 'Mismatched', null,
            [
                ['gl' => $this->gl('BANK'), 'type' => TransactionType::DR, 'amount' => '10.00', 'narration' => 'a'],
                ['gl' => $this->gl('II'),   'type' => TransactionType::CR, 'amount' => '10.00', 'narration' => 'b'],
            ],
            isReversal: false,
            reversalOfId: 'some-id',
        );
    }

    public function testRejectsNonLedgerGlInLine(): void
    {
        $this->expectException(DomainException::class);
        $this->expectExceptionMessageMatches('/GeneralLedger/');

        $this->service()->postJournal(
            JournalEntryType::MANUAL, '2026-06-24', 'Bad gl', null,
            [
                ['gl' => 'not-an-entity', 'type' => TransactionType::DR, 'amount' => '10.00', 'narration' => 'a'],
                ['gl' => $this->gl('II'), 'type' => TransactionType::CR, 'amount' => '10.00', 'narration' => 'b'],
            ]
        );
    }
}
