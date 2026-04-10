<?php

declare(strict_types=1);

namespace App\Domain\Exception;

class ValidationException extends DomainException
{
    /** @var array<string, string[]> */
    private array $errors;

    /** @param array<string, string[]> $errors */
    public function __construct(array $errors, string $message = 'Validation failed')
    {
        $this->errors = $errors;
        parent::__construct($message, 422);
    }

    /** @return array<string, string[]> */
    public function getErrors(): array
    {
        return $this->errors;
    }
}
