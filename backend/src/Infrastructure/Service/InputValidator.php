<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

final class InputValidator
{
    /**
     * Validate required fields exist in data.
     *
     * @param array $data Input data
     * @param string[] $fields Required field names
     * @return string[] Error messages (empty = valid)
     */
    public static function required(array $data, array $fields): array
    {
        $errors = [];
        foreach ($fields as $field) {
            if (!isset($data[$field]) || (is_string($data[$field]) && trim($data[$field]) === '')) {
                $errors[$field] = ucfirst(str_replace('_', ' ', $field)) . ' is required';
            }
        }
        return $errors;
    }

    /**
     * Validate email format.
     */
    public static function email(string $value): bool
    {
        return filter_var($value, FILTER_VALIDATE_EMAIL) !== false;
    }

    /**
     * Validate string length range.
     */
    public static function length(string $value, int $min = 0, int $max = 255): bool
    {
        $len = mb_strlen($value);
        return $len >= $min && $len <= $max;
    }

    /**
     * Validate value is in allowed list.
     */
    public static function inList(mixed $value, array $allowed): bool
    {
        return in_array($value, $allowed, true);
    }

    /**
     * Sanitize string input.
     */
    public static function sanitize(string $value): string
    {
        return htmlspecialchars(strip_tags(trim($value)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    /**
     * Validate and sanitize an array of inputs against rules.
     *
     * @param array $data Raw input
     * @param array $rules ['field' => ['required' => bool, 'type' => 'string|email|int|bool', 'min' => int, 'max' => int, 'in' => array]]
     * @return array{clean: array, errors: array}
     */
    public static function validate(array $data, array $rules): array
    {
        $clean = [];
        $errors = [];

        foreach ($rules as $field => $rule) {
            $value = $data[$field] ?? null;
            $isRequired = $rule['required'] ?? false;

            // Required check
            if ($isRequired && ($value === null || (is_string($value) && trim($value) === ''))) {
                $errors[$field] = ucfirst(str_replace('_', ' ', $field)) . ' is required';
                continue;
            }

            // Skip optional empty fields
            if ($value === null || (is_string($value) && trim($value) === '')) {
                $clean[$field] = $rule['default'] ?? null;
                continue;
            }

            $type = $rule['type'] ?? 'string';

            switch ($type) {
                case 'email':
                    $value = strtolower(trim((string) $value));
                    if (!self::email($value)) {
                        $errors[$field] = 'Invalid email format';
                    }
                    $clean[$field] = $value;
                    break;

                case 'string':
                    $value = self::sanitize((string) $value);
                    $min = $rule['min'] ?? 0;
                    $max = $rule['max'] ?? 255;
                    if (!self::length($value, $min, $max)) {
                        $errors[$field] = ucfirst(str_replace('_', ' ', $field)) . " must be between {$min} and {$max} characters";
                    }
                    $clean[$field] = $value;
                    break;

                case 'int':
                    if (!is_numeric($value)) {
                        $errors[$field] = ucfirst(str_replace('_', ' ', $field)) . ' must be a number';
                    } else {
                        $value = (int) $value;
                        if (isset($rule['min']) && $value < $rule['min']) {
                            $errors[$field] = ucfirst(str_replace('_', ' ', $field)) . " must be at least {$rule['min']}";
                        }
                        if (isset($rule['max']) && $value > $rule['max']) {
                            $errors[$field] = ucfirst(str_replace('_', ' ', $field)) . " must not exceed {$rule['max']}";
                        }
                    }
                    $clean[$field] = (int) $value;
                    break;

                case 'bool':
                    $clean[$field] = filter_var($value, FILTER_VALIDATE_BOOLEAN);
                    break;

                case 'array':
                    if (!is_array($value)) {
                        $errors[$field] = ucfirst(str_replace('_', ' ', $field)) . ' must be an array';
                    }
                    $clean[$field] = $value;
                    break;

                default:
                    $clean[$field] = $value;
            }

            // In-list validation
            if (isset($rule['in']) && !isset($errors[$field])) {
                if (!self::inList($clean[$field], $rule['in'])) {
                    $errors[$field] = ucfirst(str_replace('_', ' ', $field)) . ' must be one of: ' . implode(', ', $rule['in']);
                }
            }
        }

        return ['clean' => $clean, 'errors' => $errors];
    }
}
