<?php
declare(strict_types=1);
namespace App\Action\FeeType;

use App\Domain\Entity\FeeType;
use App\Domain\Repository\FeeTypeRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateFeeTypeAction
{
    use ApiResponse;
    public function __construct(private readonly FeeTypeRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'name' => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 100],
            'code' => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 20],
            'description' => ['required' => false, 'type' => 'string', 'max' => 500],
            'gl_account_id' => ['required' => false, 'type' => 'string'],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);
        if ($this->repo->codeExists($v['clean']['code'])) return $this->validationError(['code' => 'Fee type code already exists']);

        $ft = new FeeType();
        $ft->setName($v['clean']['name']);
        $ft->setCode($v['clean']['code']);
        $ft->setDescription($v['clean']['description'] ?? null);
        $ft->setGlAccountId($v['clean']['gl_account_id'] ?? null);
        $this->repo->save($ft);

        $this->audit->logCreate($request->getAttribute('user_id'), 'FeeType', $ft->getId(), $ft->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($ft->toArray(), 'Fee type created successfully');
    }
}
