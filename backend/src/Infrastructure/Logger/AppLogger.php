<?php

declare(strict_types=1);

namespace App\Infrastructure\Logger;

use Monolog\Handler\RotatingFileHandler;
use Monolog\Handler\StreamHandler;
use Monolog\Level;
use Monolog\Logger;
use Psr\Log\LoggerInterface;

final class AppLogger
{
    public static function create(string $name, string $path, string $level): LoggerInterface
    {
        $logger = new Logger($name);

        $logLevel = Level::fromName(strtoupper($level));

        // Rotating daily file handler
        $dir = dirname($path);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $logger->pushHandler(new RotatingFileHandler($path, 30, $logLevel));

        // Also log to stderr in development
        if (($_ENV['APP_ENV'] ?? 'development') !== 'production') {
            $logger->pushHandler(new StreamHandler('php://stderr', $logLevel));
        }

        return $logger;
    }
}
