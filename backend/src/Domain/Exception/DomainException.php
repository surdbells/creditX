<?php

declare(strict_types=1);

namespace App\Domain\Exception;

class DomainException extends \RuntimeException
{
    protected int $statusCode;

    public function __construct(string $message = '', int $statusCode = 400, ?\Throwable $previous = null)
    {
        $this->statusCode = $statusCode;
        parent::__construct($message, 0, $previous);
    }

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}
