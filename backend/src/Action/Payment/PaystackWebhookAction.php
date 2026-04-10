<?php
declare(strict_types=1);
namespace App\Action\Payment;

use App\Domain\Enum\{PaymentChannel, PaymentStatus};
use App\Domain\Repository\{LoanRepository, PaymentRepository};
use App\Infrastructure\Service\{ApiResponse, RepaymentService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class PaystackWebhookAction
{
    use ApiResponse;
    public function __construct(
        private readonly PaymentRepository $paymentRepo,
        private readonly LoanRepository $loanRepo,
        private readonly RepaymentService $repaymentService,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        // Verify Paystack signature
        $paystackSecret = $_ENV['PAYSTACK_WEBHOOK_SECRET'] ?? '';
        $signature = $request->getHeaderLine('x-paystack-signature');
        $body = (string) $request->getBody();

        if ($paystackSecret !== '' && $signature !== '') {
            $computed = hash_hmac('sha512', $body, $paystackSecret);
            if (!hash_equals($computed, $signature)) {
                return $this->error('Invalid signature', 400);
            }
        }

        $payload = json_decode($body, true);
        if (!$payload || ($payload['event'] ?? '') !== 'charge.success') {
            return $this->success(null, 'Ignored');
        }

        $data = $payload['data'] ?? [];
        $reference = $data['reference'] ?? '';
        $amount = (string) (($data['amount'] ?? 0) / 100); // Paystack sends in kobo
        $gatewayRef = $data['id'] ?? '';
        $metadata = $data['metadata'] ?? [];
        $loanId = $metadata['loan_id'] ?? '';

        if ($reference === '' || $loanId === '') {
            return $this->success(null, 'Missing reference or loan_id in metadata');
        }

        // Check if already processed
        $existing = $this->paymentRepo->findByReference($reference);
        if ($existing !== null && $existing->getStatus() === PaymentStatus::SUCCESS) {
            return $this->success(null, 'Already processed');
        }

        $loan = $this->loanRepo->find($loanId);
        if ($loan === null) {
            return $this->success(null, 'Loan not found');
        }

        try {
            $this->repaymentService->postRepayment($loan, $amount, PaymentChannel::CARD, (string) $gatewayRef, null);
        } catch (\Exception $e) {
            // Log but don't fail webhook
        }

        return $this->success(null, 'Processed');
    }
}
