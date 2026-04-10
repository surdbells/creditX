<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum LoanStatus: string
{
    case DRAFT = 'draft';
    case CAPTURED = 'captured';
    case SUBMITTED = 'submitted';
    case UNDER_REVIEW = 'under_review';
    case APPROVED = 'approved';
    case REJECTED = 'rejected';
    case DISBURSED = 'disbursed';
    case ACTIVE = 'active';
    case OVERDUE = 'overdue';
    case CLOSED = 'closed';
    case WRITTEN_OFF = 'written_off';
    case RESTRUCTURED = 'restructured';
    case CANCELLED = 'cancelled';

    /**
     * Valid transitions from this status.
     * @return LoanStatus[]
     */
    public function allowedTransitions(): array
    {
        return match ($this) {
            self::DRAFT => [self::CAPTURED, self::SUBMITTED, self::CANCELLED],
            self::CAPTURED => [self::SUBMITTED, self::CANCELLED],
            self::SUBMITTED => [self::UNDER_REVIEW, self::CANCELLED],
            self::UNDER_REVIEW => [self::APPROVED, self::REJECTED],
            self::APPROVED => [self::DISBURSED, self::CANCELLED],
            self::REJECTED => [self::DRAFT],
            self::DISBURSED => [self::ACTIVE],
            self::ACTIVE => [self::OVERDUE, self::CLOSED, self::RESTRUCTURED],
            self::OVERDUE => [self::ACTIVE, self::CLOSED, self::WRITTEN_OFF, self::RESTRUCTURED],
            self::CLOSED => [],
            self::WRITTEN_OFF => [],
            self::RESTRUCTURED => [self::ACTIVE],
            self::CANCELLED => [],
        };
    }

    public function canTransitionTo(LoanStatus $target): bool
    {
        return in_array($target, $this->allowedTransitions(), true);
    }
}
