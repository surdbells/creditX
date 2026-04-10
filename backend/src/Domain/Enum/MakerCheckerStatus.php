<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum MakerCheckerStatus: string
{
    case PENDING = 'pending';
    case APPROVED = 'approved';
    case REJECTED = 'rejected';
}
