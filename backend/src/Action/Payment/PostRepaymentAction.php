<?php
declare(strict_types=1);
namespace App\Action\Payment;

use App\Domain\Enum\PaymentChannel;
use App\Domain\Repository\LoanRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, NotificationDispatchService, RepaymentService};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class PostRepaymentAction
{
    use ApiResponse;
    public function __construct(
        private readonly LoanRepository $loanRepo,
        private readonly RepaymentService $repaymentService,
        private readonly AuditService $audit,
        private readonly NotificationDispatchService $notifService,
    ) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $loanId = $data['loan_id'] ?? '';
        $amount = $data['amount'] ?? '';
        $channel = $data['channel'] ?? PaymentChannel::CASH->value;

        if ($loanId === '' || $amount === '' || bccomp($amount, '0.00', 2) <= 0) {
            return $this->validationError(['loan_id' => 'Required', 'amount' => 'Must be greater than 0']);
        }

        $loan = $this->loanRepo->find($loanId);
        if ($loan === null) return $this->notFound('Loan not found');

        $userId = $request->getAttribute('user_id');

        try {
            $payment = $this->repaymentService->postRepayment(
                $loan, $amount, PaymentChannel::from($channel), $data['gateway_reference'] ?? null, $userId
            );
        } catch (\App\Domain\Exception\DomainException $e) {
            return $this->error($e->getMessage(), 400);
        }

        $this->audit->logCreate($userId, 'Payment', $payment->getId(), $payment->toArray(), $this->getClientIp($request), $this->getUserAgent($request));

        // Fire payment_received — route to agent's devices for PUSH.
        // Use loan->amount_requested context shape for consistency with
        // other loan events; payment amount in its own variable.
        $agentId = $loan->getAgent()?->getId();
        if ($agentId) {
            $customer = $loan->getCustomer();
            $this->notifService->dispatchEvent('payment_received', [
                'customer_name'  => $customer->getFullName(),
                'customer_email' => $customer->getEmail(),
                'customer_phone' => $customer->getPhone(),
                'application_id' => $loan->getApplicationId(),
                'loan_amount'    => $loan->getAmountRequested(),
                'payment_amount' => $amount,
                'user_id'        => $agentId,
            ], $agentId, $customer->getId());
        }

        return $this->created($payment->toArray(), 'Repayment posted successfully');
    }
}
