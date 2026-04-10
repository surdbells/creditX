<?php

declare(strict_types=1);

namespace App\Infrastructure\Service;

use App\Domain\Entity\BulkUpload;
use App\Domain\Entity\BulkUploadItem;
use App\Domain\Enum\BulkUploadItemStatus;
use App\Domain\Enum\BulkUploadStatus;
use App\Domain\Enum\PaymentChannel;
use App\Domain\Repository\BulkUploadRepository;
use App\Domain\Repository\CustomerLedgerRepository;
use App\Domain\Repository\LoanRepository;
use Doctrine\ORM\EntityManagerInterface;

final class BulkRepaymentService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly BulkUploadRepository $uploadRepo,
        private readonly CustomerLedgerRepository $clRepo,
        private readonly LoanRepository $loanRepo,
        private readonly RepaymentService $repaymentService,
    ) {
    }

    /**
     * Process a bulk repayment CSV file.
     * Expected columns: staff_id, customer_name, amount
     */
    public function process(string $filePath, string $fileName, ?string $userId): BulkUpload
    {
        $rows = $this->parseCsv($filePath);

        $upload = new BulkUpload();
        $upload->setFilePath($filePath);
        $upload->setFileName($fileName);
        $upload->setTotalRecords(count($rows));
        $upload->setUploadedBy($userId);
        $upload->setStatus(BulkUploadStatus::PROCESSING);

        $this->em->persist($upload);
        $this->em->flush();

        foreach ($rows as $row) {
            $staffId = trim($row['staff_id'] ?? '');
            $customerName = trim($row['customer_name'] ?? '');
            $amount = trim($row['amount'] ?? '0');

            $item = new BulkUploadItem();
            $item->setStaffId($staffId);
            $item->setCustomerName($customerName);
            $item->setAmount($amount);

            if ($staffId === '' || bccomp($amount, '0.00', 2) <= 0) {
                $item->setStatus(BulkUploadItemStatus::FAILED);
                $item->setErrorMessage('Missing staff_id or invalid amount');
                $upload->addItem($item);
                $upload->incrementFailed();
                continue;
            }

            // Find active loan by staff ID
            $loans = $this->loanRepo->findDisbursedByStaffId($staffId);
            // Also check active loans
            $activeLoans = $this->em->createQueryBuilder()
                ->select('l')->from(\App\Domain\Entity\Loan::class, 'l')
                ->innerJoin('l.customer', 'c')
                ->where('c.staffId = :sid')
                ->andWhere('l.status IN (:statuses)')
                ->setParameter('sid', $staffId)
                ->setParameter('statuses', ['active', 'overdue'])
                ->getQuery()->getResult();

            if (empty($activeLoans)) {
                $item->setStatus(BulkUploadItemStatus::FAILED);
                $item->setErrorMessage('No active/overdue loan found for staff ID');
                $upload->addItem($item);
                $upload->incrementFailed();
                continue;
            }

            $loan = $activeLoans[0];
            $customerLedger = $this->clRepo->findByLoan($loan->getId());

            if ($customerLedger === null) {
                $item->setStatus(BulkUploadItemStatus::FAILED);
                $item->setErrorMessage('Customer ledger not found');
                $upload->addItem($item);
                $upload->incrementFailed();
                continue;
            }

            $item->setLedgerId($customerLedger->getId());
            $item->setStatus(BulkUploadItemStatus::MATCHED);

            try {
                $this->repaymentService->postRepayment(
                    $loan, $amount, PaymentChannel::BULK_UPLOAD, $upload->getCallbackReference(), $userId
                );
                $item->setStatus(BulkUploadItemStatus::POSTED);
                $upload->incrementProcessed();
                $upload->addToTotal($amount);
            } catch (\Exception $e) {
                $item->setStatus(BulkUploadItemStatus::FAILED);
                $item->setErrorMessage($e->getMessage());
                $upload->incrementFailed();
            }

            $upload->addItem($item);
        }

        $upload->setStatus(BulkUploadStatus::COMPLETED);
        $this->em->flush();

        return $upload;
    }

    private function parseCsv(string $filePath): array
    {
        if (!file_exists($filePath)) {
            throw new \RuntimeException('File not found: ' . $filePath);
        }

        $handle = fopen($filePath, 'r');
        $headers = fgetcsv($handle);
        if (!$headers) { fclose($handle); return []; }

        $headers = array_map(fn($h) => strtolower(str_replace([' ', '-'], '_', trim($h))), $headers);
        $rows = [];
        while (($data = fgetcsv($handle)) !== false) {
            if (count($data) === count($headers)) {
                $rows[] = array_combine($headers, $data);
            }
        }
        fclose($handle);
        return $rows;
    }
}
