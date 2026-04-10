<?php

declare(strict_types=1);

namespace App\Domain\Enum;

enum SettingType: string
{
    case STRING = 'string';
    case INTEGER = 'integer';
    case BOOLEAN = 'boolean';
    case JSON = 'json';
    case FLOAT = 'float';
}
