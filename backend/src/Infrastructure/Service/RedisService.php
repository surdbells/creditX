<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use Predis\Client as RedisClient;

final class RedisService
{
    public function __construct(private readonly RedisClient $client)
    {
    }

    public function get(string $key): ?string
    {
        $value = $this->client->get($key);
        return is_string($value) ? $value : null;
    }

    public function set(string $key, string $value, ?int $ttl = null): void
    {
        if ($ttl !== null) {
            $this->client->setex($key, $ttl, $value);
        } else {
            $this->client->set($key, $value);
        }
    }

    public function delete(string $key): void
    {
        $this->client->del([$key]);
    }

    public function exists(string $key): bool
    {
        return (bool) $this->client->exists($key);
    }

    public function getJson(string $key): ?array
    {
        $value = $this->get($key);
        if ($value === null) {
            return null;
        }
        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : null;
    }

    public function setJson(string $key, array $data, ?int $ttl = null): void
    {
        $this->set($key, json_encode($data, JSON_THROW_ON_ERROR), $ttl);
    }

    public function increment(string $key): int
    {
        return $this->client->incr($key);
    }

    public function expire(string $key, int $seconds): void
    {
        $this->client->expire($key, $seconds);
    }

    public function ttl(string $key): int
    {
        return $this->client->ttl($key);
    }

    /**
     * Delete keys matching a pattern (use sparingly).
     */
    public function deletePattern(string $pattern): int
    {
        $prefix = $this->client->getOptions()->prefix?->getPrefix() ?? '';
        $keys = $this->client->keys($pattern);
        if (empty($keys)) {
            return 0;
        }
        // Strip prefix since the client auto-adds it
        $stripped = array_map(fn(string $k) => str_starts_with($k, $prefix) ? substr($k, strlen($prefix)) : $k, $keys);
        return $this->client->del($stripped);
    }
}
