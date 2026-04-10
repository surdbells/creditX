<?php
declare(strict_types=1);
namespace App\Domain\Enum;

enum ApprovalMode: string
{
    case SEQUENTIAL = 'sequential';
    case PARALLEL = 'parallel';
}
