<?php

declare(strict_types=1);

namespace App\Domain\Exception;

class EntityNotFoundException extends DomainException
{
    public function __construct(string $entity, string $identifier)
    {
        parent::__construct("{$entity} not found with identifier: {$identifier}", 404);
    }
}
