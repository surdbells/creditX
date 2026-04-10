<?php
declare(strict_types=1);
namespace App\Infrastructure\Service;

final class ExportService
{
    /**
     * Generate CSV string from data.
     */
    public function toCsv(array $headers, array $rows): string
    {
        $output = fopen('php://temp', 'r+');
        fputcsv($output, $headers);
        foreach ($rows as $row) {
            fputcsv($output, array_map(fn($h) => $row[$h] ?? '', $headers));
        }
        rewind($output);
        $csv = stream_get_contents($output);
        fclose($output);
        return $csv;
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
