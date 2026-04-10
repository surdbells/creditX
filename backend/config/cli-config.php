<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Infrastructure\Persistence\DoctrineEntityManagerFactory;
use Doctrine\ORM\Tools\Console\ConsoleRunner;
use Doctrine\ORM\Tools\Console\EntityManagerProvider\SingleManagerProvider;

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

$entityManager = DoctrineEntityManagerFactory::create();

ConsoleRunner::run(new SingleManagerProvider($entityManager));
