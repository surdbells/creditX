<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity]
#[ORM\Table(name: 'customers')]
#[ORM\Index(name: 'idx_customers_staff_id', columns: ['staff_id'])]
#[ORM\Index(name: 'idx_customers_bvn', columns: ['bvn'])]
#[ORM\Index(name: 'idx_customers_phone', columns: ['phone'])]
#[ORM\Index(name: 'idx_customers_full_name', columns: ['full_name'])]
#[ORM\HasLifecycleCallbacks]
class Customer
{
    use TimestampsTrait;
    use SoftDeleteTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $staffId = null;

    #[ORM\Column(type: 'string', length: 200)]
    private string $fullName;

    #[ORM\Column(type: 'string', length: 30, nullable: true)]
    private ?string $phone = null;

    #[ORM\Column(type: 'string', length: 30, nullable: true)]
    private ?string $altPhone = null;

    #[ORM\Column(type: 'string', length: 255, nullable: true)]
    private ?string $email = null;

    #[ORM\Column(type: 'date', nullable: true)]
    private ?\DateTimeInterface $dateOfBirth = null;

    #[ORM\Column(type: 'string', length: 10, nullable: true)]
    private ?string $gender = null;

    #[ORM\Column(type: 'string', length: 20, nullable: true)]
    private ?string $maritalStatus = null;

    #[ORM\Column(type: 'string', length: 500, nullable: true)]
    private ?string $homeAddress = null;

    #[ORM\Column(type: 'string', length: 500, nullable: true)]
    private ?string $permanentAddress = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $stateOfOrigin = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $lga = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $hometown = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $mothersMaidenName = null;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $religion = null;

    #[ORM\Column(type: 'string', length: 20, nullable: true)]
    private ?string $bvn = null;

    #[ORM\Column(type: 'integer', nullable: true)]
    private ?int $numberOfChildren = null;

    // ─── Banking ───
    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $bankName = null;

    #[ORM\Column(type: 'string', length: 20, nullable: true)]
    private ?string $accountNumber = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $altBankName = null;

    #[ORM\Column(type: 'string', length: 20, nullable: true)]
    private ?string $altAccountNumber = null;

    /**
     * Resolved alternate account holder name. Populated by bank-account
     * validation (Paystack resolve endpoint) when the agent clicks the
     * VALIDATE ACCOUNT button during loan capture. Not edited directly.
     */
    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $altAccountName = null;

    // ─── Employment (populated from the Employment Information step of
    //     the loan capture wizard. All nullable — existing customer rows
    //     predate these columns). ───

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $jobTitle = null;

    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $employer = null;

    /** Sub-organization, ministry, agency, parastatal, etc. */
    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $organization = null;

    /** For armed forces / police — e.g. "3 Division". Nullable for civilians. */
    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $command = null;

    #[ORM\Column(type: 'date', nullable: true)]
    private ?\DateTimeInterface $employmentDate = null;

    /**
     * Type of ID presented: WorkID, NIN, DriversLicense, VotersCard,
     * NigerianIntPassport, BirthCertificate, etc. Free text (50 chars)
     * rather than an enum so legacy data and new ID types can be added
     * without schema changes.
     */
    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $idType = null;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $workIdNumber = null;

    #[ORM\Column(type: 'date', nullable: true)]
    private ?\DateTimeInterface $workIdIssuedDate = null;

    #[ORM\Column(type: 'date', nullable: true)]
    private ?\DateTimeInterface $workIdExpiryDate = null;

    /**
     * Legacy calls this "Net Pay" in the form label but stores it in a
     * column named gross_pay. Kept as grossPay here to match the legacy
     * DB column name for compatibility with any reporting that reads it.
     */
    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $grossPay = null;

    // ─── Relations ───

    /** @var Collection<int, NextOfKin> */
    #[ORM\OneToMany(targetEntity: NextOfKin::class, mappedBy: 'customer', cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $nextOfKins;

    /** @var Collection<int, Document> */
    #[ORM\OneToMany(targetEntity: Document::class, mappedBy: 'customer', cascade: ['persist'])]
    private Collection $documents;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
        $this->nextOfKins = new ArrayCollection();
        $this->documents = new ArrayCollection();
    }

    // ─── Getters ───

    public function getId(): string { return $this->id; }
    public function getStaffId(): ?string { return $this->staffId; }
    public function getFullName(): string { return $this->fullName; }
    public function getPhone(): ?string { return $this->phone; }
    public function getAltPhone(): ?string { return $this->altPhone; }
    public function getEmail(): ?string { return $this->email; }
    public function getDateOfBirth(): ?\DateTimeInterface { return $this->dateOfBirth; }
    public function getGender(): ?string { return $this->gender; }
    public function getMaritalStatus(): ?string { return $this->maritalStatus; }
    public function getHomeAddress(): ?string { return $this->homeAddress; }
    public function getPermanentAddress(): ?string { return $this->permanentAddress; }
    public function getStateOfOrigin(): ?string { return $this->stateOfOrigin; }
    public function getLga(): ?string { return $this->lga; }
    public function getHometown(): ?string { return $this->hometown; }
    public function getMothersMaidenName(): ?string { return $this->mothersMaidenName; }
    public function getReligion(): ?string { return $this->religion; }
    public function getBvn(): ?string { return $this->bvn; }
    public function getNumberOfChildren(): ?int { return $this->numberOfChildren; }
    public function getBankName(): ?string { return $this->bankName; }
    public function getAccountNumber(): ?string { return $this->accountNumber; }
    public function getAltBankName(): ?string { return $this->altBankName; }
    public function getAltAccountNumber(): ?string { return $this->altAccountNumber; }
    public function getAltAccountName(): ?string { return $this->altAccountName; }
    public function getJobTitle(): ?string { return $this->jobTitle; }
    public function getEmployer(): ?string { return $this->employer; }
    public function getOrganization(): ?string { return $this->organization; }
    public function getCommand(): ?string { return $this->command; }
    public function getEmploymentDate(): ?\DateTimeInterface { return $this->employmentDate; }
    public function getIdType(): ?string { return $this->idType; }
    public function getWorkIdNumber(): ?string { return $this->workIdNumber; }
    public function getWorkIdIssuedDate(): ?\DateTimeInterface { return $this->workIdIssuedDate; }
    public function getWorkIdExpiryDate(): ?\DateTimeInterface { return $this->workIdExpiryDate; }
    public function getGrossPay(): ?string { return $this->grossPay; }
    /** @return Collection<int, NextOfKin> */
    public function getNextOfKins(): Collection { return $this->nextOfKins; }
    /** @return Collection<int, Document> */
    public function getDocuments(): Collection { return $this->documents; }

    // ─── Setters ───

    public function setStaffId(?string $v): void { $this->staffId = $v; }
    public function setFullName(string $v): void { $this->fullName = trim($v); }
    public function setPhone(?string $v): void { $this->phone = $v; }
    public function setAltPhone(?string $v): void { $this->altPhone = $v; }
    public function setEmail(?string $v): void { $this->email = $v ? strtolower(trim($v)) : null; }
    public function setDateOfBirth(?\DateTimeInterface $v): void { $this->dateOfBirth = $v; }
    public function setGender(?string $v): void { $this->gender = $v; }
    public function setMaritalStatus(?string $v): void { $this->maritalStatus = $v; }
    public function setHomeAddress(?string $v): void { $this->homeAddress = $v; }
    public function setPermanentAddress(?string $v): void { $this->permanentAddress = $v; }
    public function setStateOfOrigin(?string $v): void { $this->stateOfOrigin = $v; }
    public function setLga(?string $v): void { $this->lga = $v; }
    public function setHometown(?string $v): void { $this->hometown = $v; }
    public function setMothersMaidenName(?string $v): void { $this->mothersMaidenName = $v; }
    public function setReligion(?string $v): void { $this->religion = $v; }
    public function setBvn(?string $v): void { $this->bvn = $v; }
    public function setNumberOfChildren(?int $v): void { $this->numberOfChildren = $v; }
    public function setBankName(?string $v): void { $this->bankName = $v; }
    public function setAccountNumber(?string $v): void { $this->accountNumber = $v; }
    public function setAltBankName(?string $v): void { $this->altBankName = $v; }
    public function setAltAccountNumber(?string $v): void { $this->altAccountNumber = $v; }
    public function setAltAccountName(?string $v): void { $this->altAccountName = $v; }
    public function setJobTitle(?string $v): void { $this->jobTitle = $v; }
    public function setEmployer(?string $v): void { $this->employer = $v; }
    public function setOrganization(?string $v): void { $this->organization = $v; }
    public function setCommand(?string $v): void { $this->command = $v; }
    public function setEmploymentDate(?\DateTimeInterface $v): void { $this->employmentDate = $v; }
    public function setIdType(?string $v): void { $this->idType = $v; }
    public function setWorkIdNumber(?string $v): void { $this->workIdNumber = $v; }
    public function setWorkIdIssuedDate(?\DateTimeInterface $v): void { $this->workIdIssuedDate = $v; }
    public function setWorkIdExpiryDate(?\DateTimeInterface $v): void { $this->workIdExpiryDate = $v; }
    public function setGrossPay(?string $v): void { $this->grossPay = $v; }

    // ─── NextOfKin management ───

    public function addNextOfKin(NextOfKin $nok): void
    {
        if (!$this->nextOfKins->contains($nok)) {
            $nok->setCustomer($this);
            $this->nextOfKins->add($nok);
        }
    }

    public function removeNextOfKin(NextOfKin $nok): void
    {
        $this->nextOfKins->removeElement($nok);
    }

    /**
     * Populate from a GovernmentRecord.
     */
    public function fillFromRecord(GovernmentRecord $record): void
    {
        $this->staffId = $record->getStaffId();
        $this->fullName = $record->getEmployeeName();
        $this->phone = $record->getTelephoneNumber();
        $this->dateOfBirth = $record->getDateOfBirth();
        $this->gender = $record->getGender();
        $this->maritalStatus = $record->getMaritalStatus();
        $this->bankName = $record->getBankName();
        $this->accountNumber = $record->getAccountNumber();
        $this->stateOfOrigin = $record->getStateOfOrigin();
        $this->lga = $record->getLga();
    }

    /**
     * Populate from an associative array (for create/update from API input).
     */
    public function fillFromArray(array $data): void
    {
        if (isset($data['staff_id'])) $this->setStaffId($data['staff_id']);
        if (isset($data['full_name'])) $this->setFullName($data['full_name']);
        if (isset($data['phone'])) $this->setPhone($data['phone']);
        if (isset($data['alt_phone'])) $this->setAltPhone($data['alt_phone']);
        if (isset($data['email'])) $this->setEmail($data['email']);
        if (isset($data['home_address'])) $this->setHomeAddress($data['home_address']);
        if (isset($data['permanent_address'])) $this->setPermanentAddress($data['permanent_address']);
        if (isset($data['state_of_origin'])) $this->setStateOfOrigin($data['state_of_origin']);
        if (isset($data['lga'])) $this->setLga($data['lga']);
        if (isset($data['hometown'])) $this->setHometown($data['hometown']);
        if (isset($data['mothers_maiden_name'])) $this->setMothersMaidenName($data['mothers_maiden_name']);
        if (isset($data['religion'])) $this->setReligion($data['religion']);
        if (isset($data['marital_status'])) $this->setMaritalStatus($data['marital_status']);
        if (isset($data['gender'])) $this->setGender($data['gender']);
        if (isset($data['bvn'])) $this->setBvn($data['bvn']);
        if (isset($data['number_of_children'])) $this->setNumberOfChildren((int) $data['number_of_children']);
        if (isset($data['bank_name'])) $this->setBankName($data['bank_name']);
        if (isset($data['account_number'])) $this->setAccountNumber($data['account_number']);
        if (isset($data['alt_bank_name'])) $this->setAltBankName($data['alt_bank_name']);
        if (isset($data['alt_account_number'])) $this->setAltAccountNumber($data['alt_account_number']);
        if (isset($data['alt_account_name'])) $this->setAltAccountName($data['alt_account_name']);

        // Employment fields
        if (isset($data['job_title'])) $this->setJobTitle($data['job_title']);
        if (isset($data['employer'])) $this->setEmployer($data['employer']);
        if (isset($data['organization'])) $this->setOrganization($data['organization']);
        if (isset($data['command'])) $this->setCommand($data['command']);
        if (isset($data['id_type'])) $this->setIdType($data['id_type']);
        if (isset($data['work_id_number'])) $this->setWorkIdNumber($data['work_id_number']);
        if (isset($data['gross_pay'])) $this->setGrossPay((string) $data['gross_pay']);

        // Date fields — all use the same safe-parse pattern. Silently
        // ignore unparseable strings rather than throwing; validator
        // should catch malformed input at the action layer.
        foreach ([
            'employment_date' => 'setEmploymentDate',
            'work_id_issued_date' => 'setWorkIdIssuedDate',
            'work_id_expiry_date' => 'setWorkIdExpiryDate',
        ] as $key => $setter) {
            if (!empty($data[$key])) {
                try { $this->$setter(new \DateTime($data[$key])); } catch (\Exception) {}
            }
        }

        if (isset($data['dob']) && $data['dob']) {
            try { $this->setDateOfBirth(new \DateTime($data['dob'])); } catch (\Exception) {}
        }
        if (isset($data['date_of_birth']) && $data['date_of_birth']) {
            try { $this->setDateOfBirth(new \DateTime($data['date_of_birth'])); } catch (\Exception) {}
        }
    }

    public function toArray(bool $includeRelations = false): array
    {
        $data = [
            'id'                 => $this->id,
            'staff_id'           => $this->staffId,
            'full_name'          => $this->fullName,
            'phone'              => $this->phone,
            'alt_phone'          => $this->altPhone,
            'email'              => $this->email,
            'date_of_birth'      => $this->dateOfBirth?->format('Y-m-d'),
            'gender'             => $this->gender,
            'marital_status'     => $this->maritalStatus,
            'home_address'       => $this->homeAddress,
            'permanent_address'  => $this->permanentAddress,
            'state_of_origin'    => $this->stateOfOrigin,
            'lga'                => $this->lga,
            'hometown'           => $this->hometown,
            'mothers_maiden_name' => $this->mothersMaidenName,
            'religion'           => $this->religion,
            'bvn'                => $this->bvn,
            'number_of_children' => $this->numberOfChildren,
            'bank_name'          => $this->bankName,
            'account_number'     => $this->accountNumber,
            'alt_bank_name'      => $this->altBankName,
            'alt_account_number' => $this->altAccountNumber,
            'alt_account_name'   => $this->altAccountName,
            'job_title'          => $this->jobTitle,
            'employer'           => $this->employer,
            'organization'       => $this->organization,
            'command'            => $this->command,
            'employment_date'    => $this->employmentDate?->format('Y-m-d'),
            'id_type'            => $this->idType,
            'work_id_number'     => $this->workIdNumber,
            'work_id_issued_date' => $this->workIdIssuedDate?->format('Y-m-d'),
            'work_id_expiry_date' => $this->workIdExpiryDate?->format('Y-m-d'),
            'gross_pay'          => $this->grossPay,
            'created_at'         => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at'         => $this->updatedAt->format('Y-m-d H:i:s'),
        ];

        if ($includeRelations) {
            $data['next_of_kins'] = $this->nextOfKins->map(fn(NextOfKin $n) => $n->toArray())->toArray();
            $data['documents'] = $this->documents->map(fn(Document $d) => $d->toArray())->toArray();
        }

        return $data;
    }
}
