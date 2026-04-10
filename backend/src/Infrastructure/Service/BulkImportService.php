<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\GovernmentRecord;
use App\Domain\Entity\RecordType;
use App\Domain\Repository\GovernmentRecordRepository;
use Doctrine\ORM\EntityManagerInterface;

final class BulkImportService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly GovernmentRecordRepository $recordRepo,
    ) {
    }

    /**
     * Import government records from parsed CSV data.
     *
     * @param array $rows Array of associative arrays (one per CSV row)
     * @param RecordType $recordType The target record type
     * @param bool $upsert If true, update existing records by staff_id; if false, skip duplicates
     * @return array{imported: int, updated: int, skipped: int, errors: array}
     */
    public function importRecords(array $rows, RecordType $recordType, bool $upsert = true): array
    {
        $imported = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];
        $batchSize = 50;

        foreach ($rows as $index => $row) {
            $rowNum = $index + 2; // +2 because index 0 = row 2 in CSV (row 1 is header)

            // Normalize keys to snake_case lowercase
            $normalized = $this->normalizeRow($row);

            // Validate required fields
            $staffId = trim($normalized['staff_id'] ?? '');
            $employeeName = trim($normalized['employee_name'] ?? '');

            if ($staffId === '') {
                $errors[] = ['row' => $rowNum, 'error' => 'Missing staff_id'];
                $skipped++;
                continue;
            }

            if ($employeeName === '') {
                $errors[] = ['row' => $rowNum, 'error' => 'Missing employee_name'];
                $skipped++;
                continue;
            }

            try {
                // Check for existing record
                $existing = $this->recordRepo->findOneByTypeAndStaffId($recordType->getId(), $staffId);

                if ($existing !== null) {
                    if ($upsert) {
                        $existing->fillFromArray($normalized);
                        $updated++;
                    } else {
                        $skipped++;
                    }
                } else {
                    $record = new GovernmentRecord();
                    $record->setRecordType($recordType);
                    $record->fillFromArray($normalized);
                    $this->em->persist($record);
                    $imported++;
                }

                // Flush in batches
                if (($imported + $updated) % $batchSize === 0) {
                    $this->em->flush();
                    $this->em->clear(GovernmentRecord::class);
                }
            } catch (\Exception $e) {
                $errors[] = ['row' => $rowNum, 'error' => $e->getMessage()];
                $skipped++;
            }
        }

        // Final flush
        $this->em->flush();

        return [
            'imported' => $imported,
            'updated'  => $updated,
            'skipped'  => $skipped,
            'errors'   => $errors,
            'total'    => count($rows),
        ];
    }

    /**
     * Parse a CSV file into rows.
     *
     * @param string $filePath Path to CSV file
     * @return array{headers: string[], rows: array}
     * @throws \RuntimeException
     */
    public function parseCsv(string $filePath): array
    {
        if (!file_exists($filePath)) {
            throw new \RuntimeException('File not found: ' . $filePath);
        }

        $handle = fopen($filePath, 'r');
        if ($handle === false) {
            throw new \RuntimeException('Could not open file: ' . $filePath);
        }

        $headers = fgetcsv($handle);
        if ($headers === false || empty($headers)) {
            fclose($handle);
            throw new \RuntimeException('CSV file is empty or has no headers');
        }

        // Normalize headers
        $headers = array_map(fn(string $h) => $this->toSnakeCase(trim($h)), $headers);

        $rows = [];
        while (($data = fgetcsv($handle)) !== false) {
            if (count($data) !== count($headers)) {
                continue; // Skip malformed rows
            }
            $rows[] = array_combine($headers, $data);
        }

        fclose($handle);

        return ['headers' => $headers, 'rows' => $rows];
    }

    /**
     * Normalize a row's keys to snake_case.
     */
    private function normalizeRow(array $row): array
    {
        $normalized = [];
        foreach ($row as $key => $value) {
            $normalized[$this->toSnakeCase($key)] = is_string($value) ? trim($value) : $value;
        }
        return $normalized;
    }

    /**
     * Convert a string to snake_case.
     */
    private function toSnakeCase(string $input): string
    {
        $result = preg_replace('/[A-Z]/', '_$0', $input);
        $result = strtolower(trim($result ?? $input, '_'));
        return preg_replace('/[\s\-]+/', '_', $result) ?? $result;
    }
}
