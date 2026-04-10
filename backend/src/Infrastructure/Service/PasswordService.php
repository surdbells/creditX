<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

final class PasswordService
{
    /**
     * Hash a plain-text password.
     */
    public static function hash(string $password): string
    {
        return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    /**
     * Verify a password against its hash.
     */
    public static function verify(string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }

    /**
     * Validate password strength.
     *
     * @return string[] Array of error messages (empty = valid)
     */
    public static function validate(string $password): array
    {
        $errors = [];

        if (strlen($password) < 8) {
            $errors[] = 'Password must be at least 8 characters long';
        }
        if (strlen($password) > 72) {
            $errors[] = 'Password must not exceed 72 characters';
        }
        if (!preg_match('/[a-z]/', $password)) {
            $errors[] = 'Password must contain at least one lowercase letter';
        }
        if (!preg_match('/[A-Z]/', $password)) {
            $errors[] = 'Password must contain at least one uppercase letter';
        }
        if (!preg_match('/[0-9]/', $password)) {
            $errors[] = 'Password must contain at least one digit';
        }
        if (!preg_match('/[^a-zA-Z0-9]/', $password)) {
            $errors[] = 'Password must contain at least one special character';
        }

        return $errors;
    }
}
