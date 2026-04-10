<?php
declare(strict_types=1);
namespace App\Action\Accounting;

use App\Domain\Entity\GeneralLedger;
use App\Domain\Enum\{AccountType, LedgerType};
use App\Domain\Repository\GeneralLedgerRepository;
use App\Infrastructure\Service\{ApiResponse, AuditService, InputValidator};
use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};

final class CreateGlAccountAction
{
    use ApiResponse;
    public function __construct(private readonly GeneralLedgerRepository $repo, private readonly AuditService $audit) {}

    public function __invoke(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = (array) ($request->getParsedBody() ?? []);
        $v = InputValidator::validate($data, [
            'account_name'   => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 200],
            'account_number' => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 20],
            'account_code'   => ['required' => true, 'type' => 'string', 'min' => 1, 'max' => 20],
            'account_type'   => ['required' => true, 'type' => 'string', 'in' => array_column(AccountType::cases(), 'value')],
            'ledger_type'    => ['required' => false, 'type' => 'string', 'in' => array_column(LedgerType::cases(), 'value'), 'default' => LedgerType::GENERAL->value],
            'parent_id'      => ['required' => false, 'type' => 'string'],
            'description'    => ['required' => false, 'type' => 'string', 'max' => 500],
        ]);
        if (!empty($v['errors'])) return $this->validationError($v['errors']);

        if ($this->repo->codeExists($v['clean']['account_code'])) return $this->validationError(['account_code' => 'Account code already exists']);
        if ($this->repo->accountNumberExists($v['clean']['account_number'])) return $this->validationError(['account_number' => 'Account number already exists']);

        $gl = new GeneralLedger();
        $gl->setAccountName($v['clean']['account_name']);
        $gl->setAccountNumber($v['clean']['account_number']);
        $gl->setAccountCode($v['clean']['account_code']);
        $gl->setAccountType(AccountType::from($v['clean']['account_type']));
        $gl->setLedgerType(LedgerType::from($v['clean']['ledger_type']));
        $gl->setDescription($v['clean']['description'] ?? null);

        if (isset($v['clean']['parent_id']) && $v['clean']['parent_id']) {
            $parent = $this->repo->find($v['clean']['parent_id']);
            if ($parent) $gl->setParent($parent);
        }

        $this->repo->save($gl);
        $this->audit->logCreate($request->getAttribute('user_id'), 'GeneralLedger', $gl->getId(), $gl->toArray(), $this->getClientIp($request), $this->getUserAgent($request));
        return $this->created($gl->toArray(), 'GL account created successfully');
    }
}
