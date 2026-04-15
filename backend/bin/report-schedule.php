<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

if (file_exists(__DIR__ . '/../.env')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->load();
}

$container = require __DIR__ . '/../config/container.php';

$builder = new \DI\ContainerBuilder();
$builder->addDefinitions($container);
$dic = $builder->build();

$em = $dic->get(\Doctrine\ORM\EntityManagerInterface::class);

echo "[" . date('Y-m-d H:i:s') . "] Running scheduled reports...\n";

try {
    $schedules = $em->getRepository(\App\Domain\Entity\ReportSchedule::class)
        ->findBy(['isActive' => true]);

    $now = new \DateTimeImmutable('now', new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos'));
    $processed = 0;

    foreach ($schedules as $schedule) {
        $nextRun = $schedule->getNextRunAt();
        if ($nextRun !== null && $nextRun > $now) {
            continue;
        }

        // Execute report (placeholder — would generate and email)
        echo "  Running report: {$schedule->getReportType()} ({$schedule->getFrequency()})\n";

        // Update last_run and next_run
        $schedule->setLastRunAt($now);
        $interval = match ($schedule->getFrequency()) {
            'daily' => '+1 day',
            'weekly' => '+1 week',
            'monthly' => '+1 month',
            default => '+1 day',
        };
        $schedule->setNextRunAt(new \DateTimeImmutable($interval, new \DateTimeZone($_ENV['APP_TIMEZONE'] ?? 'Africa/Lagos')));
        $processed++;
    }

    $em->flush();
    echo "  Processed: {$processed} reports\n";
    echo "  Done.\n";
} catch (\Exception $e) {
    echo "  ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
