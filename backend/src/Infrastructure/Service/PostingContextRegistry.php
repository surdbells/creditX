<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

/**
 * Request-scoped holder for the current PostingContext.
 *
 * Mirrors SettingsRegistry, which the codebase already uses for the same
 * problem: a value every layer needs but that cannot be threaded through
 * sixteen posting-service constructors without churning their signatures.
 *
 * Set once per request by PostingContextMiddleware, and explicitly by CLI
 * entry points via setSystem(). Never set means unknown(), which is the
 * least-privileged actor — so forgetting to establish context denies
 * backdating rather than granting it.
 */
final class PostingContextRegistry
{
    private static ?PostingContext $context = null;

    public static function set(PostingContext $context): void
    {
        self::$context = $context;
    }

    /** Declare this process a trusted system actor (cron, EOD, CLI). */
    public static function setSystem(?string $label = null): void
    {
        self::$context = PostingContext::system($label);
    }

    public static function get(): PostingContext
    {
        return self::$context ?? PostingContext::unknown();
    }

    /** Test/CLI helper — drop the context so the next caller starts clean. */
    public static function clear(): void
    {
        self::$context = null;
    }
}
