<?php
declare(strict_types=1);
namespace App\Action\Customer;

use App\Domain\Repository\CustomerRepository;
use App\Infrastructure\Service\ApiResponse;
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class GetCustomerAction
{
    use ApiResponse;
    public function __construct(private readonly CustomerRepository $repo) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $customer = $this->repo->find($args['id'] ?? '');
        if ($customer === null) return $this->notFound('Customer not found');
        return $this->success($customer->toArray(true));
    }
}
