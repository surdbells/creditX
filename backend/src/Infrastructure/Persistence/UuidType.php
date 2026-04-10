<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence;

use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\DBAL\Types\Type;
use Ramsey\Uuid\Uuid;
use Ramsey\Uuid\UuidInterface;

final class UuidType extends Type
{
    public const NAME = 'uuid';

    public function getSQLDeclaration(array $column, AbstractPlatform $platform): string
    {
        return $platform->getGuidTypeDeclarationSQL($column);
    }

    public function convertToPHPValue(mixed $value, AbstractPlatform $platform): ?UuidInterface
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($value instanceof UuidInterface) {
            return $value;
        }

        return Uuid::fromString((string) $value);
    }

    public function convertToDatabaseValue(mixed $value, AbstractPlatform $platform): ?string
    {
        if ($value === null) {
            return null;
        }

        if ($value instanceof UuidInterface) {
            return $value->toString();
        }

        return (string) $value;
    }

    public function getName(): string
    {
        return self::NAME;
    }
}
