<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

final class ExportService
{
    /**
     * Generate CSV string from data.
     *
     * Fine for small, bounded result sets. For anything that could run to
     * thousands of rows use streamCsv() — this holds the rendered CSV in
     * memory twice (the temp stream, then the returned string) on top of
     * whatever the caller already holds in $rows.
     */
    public function toCsv(array $headers, array $rows): string
    {
        $handle = fopen('php://temp', 'r+');
        $this->writeCsvHeader($handle, $headers);
        $this->writeCsvRows($handle, $headers, $rows);
        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);
        return $csv;
    }

    /**
     * Render CSV into a stream, one batch at a time, and hand back the
     * rewound handle for use as a PSR-7 response body.
     *
     * php://temp spills to a temp file past a few megabytes, so the finished
     * CSV never has to fit in memory — and because batches are written and
     * released as they arrive, neither does the result set.
     *
     * @param array<int, string>                                    $headers
     * @param iterable<int, array<int, array<string, mixed>>>       $batches
     * @return resource
     */
    public function streamCsv(array $headers, iterable $batches)
    {
        // Spill to disk past 4MB rather than growing the request's memory.
        $handle = fopen('php://temp/maxmemory:4194304', 'r+');
        if ($handle === false) {
            throw new \RuntimeException('Could not open a temporary stream for the CSV export');
        }

        $this->writeCsvHeader($handle, $headers);
        foreach ($batches as $batch) {
            $this->writeCsvRows($handle, $headers, $batch);
        }

        rewind($handle);
        return $handle;
    }

    /** @param resource $handle */
    private function writeCsvHeader($handle, array $headers): void
    {
        // $escape is passed explicitly: PHP 8.4 deprecates relying on the
        // default, and an emitted deprecation would corrupt the CSV body.
        fputcsv($handle, $headers, ',', '"', '\\');
    }

    /**
     * @param resource                            $handle
     * @param array<int, string>                  $headers
     * @param iterable<int, array<string, mixed>> $rows
     */
    private function writeCsvRows($handle, array $headers, iterable $rows): void
    {
        foreach ($rows as $row) {
            fputcsv($handle, array_map(fn($h) => $row[$h] ?? '', $headers), ',', '"', '\\');
        }
    }

    /**
     * Generate CSV and save to file.
     */
    public function exportCsv(array $headers, array $rows, string $filename): string
    {
        $dir = $_ENV['STORAGE_PATH'] ?? 'storage/exports';
        $dir = rtrim($dir, '/') . '/../exports';
        if (!is_dir($dir)) mkdir($dir, 0755, true);

        $path = $dir . '/' . $filename;
        $handle = fopen($path, 'w');
        fputcsv($handle, $headers);
        foreach ($rows as $row) {
            fputcsv($handle, array_map(fn($h) => $row[$h] ?? '', $headers));
        }
        fclose($handle);
        return $path;
    }
}
