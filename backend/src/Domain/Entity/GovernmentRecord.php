<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

#[ORM\Entity(repositoryClass: \App\Domain\Repository\GovernmentRecordRepository::class)]
#[ORM\Table(name: 'government_records')]
#[ORM\Index(name: 'idx_govrecords_staff_id', columns: ['staff_id'])]
#[ORM\Index(name: 'idx_govrecords_record_type', columns: ['record_type_id'])]
#[ORM\Index(name: 'idx_govrecords_employee_name', columns: ['employee_name'])]
#[ORM\UniqueConstraint(name: 'uniq_govrecords_type_staff', columns: ['record_type_id', 'staff_id'])]
#[ORM\HasLifecycleCallbacks]
class GovernmentRecord
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: RecordType::class, inversedBy: 'records')]
    #[ORM\JoinColumn(name: 'record_type_id', referencedColumnName: 'id', nullable: false)]
    private RecordType $recordType;

    // ─── Core fields (present in ALL record types) ───

    #[ORM\Column(type: 'string', length: 50)]
    private string $staffId;

    #[ORM\Column(type: 'string', length: 200)]
    private string $employeeName;

    #[ORM\Column(type: 'date', nullable: true)]
    private ?\DateTimeInterface $hireDate = null;

    #[ORM\Column(type: 'date', nullable: true)]
    private ?\DateTimeInterface $dateOfBirth = null;

    #[ORM\Column(type: 'string', length: 20, nullable: true)]
    private ?string $maritalStatus = null;

    #[ORM\Column(type: 'string', length: 10, nullable: true)]
    private ?string $gender = null;

    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $jobTitle = null;

    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $location = null;

    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $organization = null;

    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $subOrganization = null;

    #[ORM\Column(type: 'string', length: 30, nullable: true)]
    private ?string $telephoneNumber = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $bankName = null;

    #[ORM\Column(type: 'string', length: 20, nullable: true)]
    private ?string $accountNumber = null;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $grossPay = null;

    // ─── Extended fields (nullable, type-specific) ───

    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $department = null;

    #[ORM\Column(type: 'string', length: 20, nullable: true)]
    private ?string $gradeLevel = null;

    #[ORM\Column(type: 'string', length: 10, nullable: true)]
    private ?string $step = null;

    #[ORM\Column(type: 'decimal', precision: 15, scale: 2, nullable: true)]
    private ?string $netPay = null;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $pensionNumber = null;

    #[ORM\Column(type: 'string', length: 50, nullable: true)]
    private ?string $taxId = null;

    #[ORM\Column(type: 'string', length: 200, nullable: true)]
    private ?string $ministry = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $stateOfOrigin = null;

    #[ORM\Column(type: 'string', length: 100, nullable: true)]
    private ?string $lga = null;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    private bool $isActive = true;

    public function __construct()
    {
        $this->id = Uuid::uuid4()->toString();
    }

    // ─── Getters ───

    public function getId(): string { return $this->id; }
    public function getRecordType(): RecordType { return $this->recordType; }
    public function getStaffId(): string { return $this->staffId; }
    public function getEmployeeName(): string { return $this->employeeName; }
    public function getHireDate(): ?\DateTimeInterface { return $this->hireDate; }
    public function getDateOfBirth(): ?\DateTimeInterface { return $this->dateOfBirth; }
    public function getMaritalStatus(): ?string { return $this->maritalStatus; }
    public function getGender(): ?string { return $this->gender; }
    public function getJobTitle(): ?string { return $this->jobTitle; }
    public function getLocation(): ?string { return $this->location; }
    public function getOrganization(): ?string { return $this->organization; }
    public function getSubOrganization(): ?string { return $this->subOrganization; }
    public function getTelephoneNumber(): ?string { return $this->telephoneNumber; }
    public function getBankName(): ?string { return $this->bankName; }
    public function getAccountNumber(): ?string { return $this->accountNumber; }
    public function getGrossPay(): ?string { return $this->grossPay; }
    public function getDepartment(): ?string { return $this->department; }
    public function getGradeLevel(): ?string { return $this->gradeLevel; }
    public function getStep(): ?string { return $this->step; }
    public function getNetPay(): ?string { return $this->netPay; }
    public function getPensionNumber(): ?string { return $this->pensionNumber; }
    public function getTaxId(): ?string { return $this->taxId; }
    public function getMinistry(): ?string { return $this->ministry; }
    public function getStateOfOrigin(): ?string { return $this->stateOfOrigin; }
    public function getLga(): ?string { return $this->lga; }
    public function isActive(): bool { return $this->isActive; }

    // ─── Setters ───

    public function setRecordType(RecordType $recordType): void { $this->recordType = $recordType; }
    public function setStaffId(string $staffId): void { $this->staffId = trim($staffId); }
    public function setEmployeeName(string $name): void { $this->employeeName = trim($name); }
    public function setHireDate(?\DateTimeInterface $date): void { $this->hireDate = $date; }
    public function setDateOfBirth(?\DateTimeInterface $date): void { $this->dateOfBirth = $date; }
    public function setMaritalStatus(?string $v): void { $this->maritalStatus = $v; }
    public function setGender(?string $v): void { $this->gender = $v; }
    public function setJobTitle(?string $v): void { $this->jobTitle = $v; }
    public function setLocation(?string $v): void { $this->location = $v; }
    public function setOrganization(?string $v): void { $this->organization = $v; }
    public function setSubOrganization(?string $v): void { $this->subOrganization = $v; }
    public function setTelephoneNumber(?string $v): void { $this->telephoneNumber = $v; }
    public function setBankName(?string $v): void { $this->bankName = $v; }
    public function setAccountNumber(?string $v): void { $this->accountNumber = $v; }
    public function setGrossPay(?string $v): void { $this->grossPay = $v; }
    public function setDepartment(?string $v): void { $this->department = $v; }
    public function setGradeLevel(?string $v): void { $this->gradeLevel = $v; }
    public function setStep(?string $v): void { $this->step = $v; }
    public function setNetPay(?string $v): void { $this->netPay = $v; }
    public function setPensionNumber(?string $v): void { $this->pensionNumber = $v; }
    public function setTaxId(?string $v): void { $this->taxId = $v; }
    public function setMinistry(?string $v): void { $this->ministry = $v; }
    public function setStateOfOrigin(?string $v): void { $this->stateOfOrigin = $v; }
    public function setLga(?string $v): void { $this->lga = $v; }
    public function setIsActive(bool $v): void { $this->isActive = $v; }

    // ─── Computed ───

    /**
     * Calculate age from DOB.
     */
    public function getAge(): ?int
    {
        if ($this->dateOfBirth === null) return null;
        return (int) $this->dateOfBirth->diff(new \DateTime())->y;
    }

    /**
     * Calculate years of service from hire date.
     */
    public function getYearsOfService(): ?int
    {
        if ($this->hireDate === null) return null;
        return (int) $this->hireDate->diff(new \DateTime())->y;
    }

    /**
     * Calculate projected retirement date (hire + 35 years or DOB + 60 years, whichever comes first).
     */
    public function getRetirementDate(): ?\DateTimeInterface
    {
        $dates = [];
        if ($this->hireDate !== null) {
            $dates[] = (clone $this->hireDate)->modify('+35 years');
        }
        if ($this->dateOfBirth !== null) {
            $dates[] = (clone $this->dateOfBirth)->modify('+60 years');
        }
        if (empty($dates)) return null;
        return min($dates);
    }

    /**
     * Populate fields from an associative array (for bulk import).
     */
    public function fillFromArray(array $data): void
    {
        if (isset($data['staff_id'])) $this->setStaffId($data['staff_id']);
        if (isset($data['employee_name'])) $this->setEmployeeName($data['employee_name']);
        if (isset($data['hire_date']) && $data['hire_date']) {
            try { $this->setHireDate(new \DateTime($data['hire_date'])); } catch (\Exception) {}
        }
        if (isset($data['date_of_birth']) && $data['date_of_birth']) {
            try { $this->setDateOfBirth(new \DateTime($data['date_of_birth'])); } catch (\Exception) {}
        }
        if (isset($data['marital_status'])) $this->setMaritalStatus($data['marital_status']);
        if (isset($data['gender'])) $this->setGender($data['gender']);
        if (isset($data['job_title'])) $this->setJobTitle($data['job_title']);
        if (isset($data['location'])) $this->setLocation($data['location']);
        if (isset($data['organization'])) $this->setOrganization($data['organization']);
        if (isset($data['sub_organization'])) $this->setSubOrganization($data['sub_organization']);
        if (isset($data['telephone_number'])) $this->setTelephoneNumber($data['telephone_number']);
        if (isset($data['bank_name'])) $this->setBankName($data['bank_name']);
        if (isset($data['account_number'])) $this->setAccountNumber($data['account_number']);
        if (isset($data['gross_pay'])) $this->setGrossPay($data['gross_pay']);
        if (isset($data['department'])) $this->setDepartment($data['department']);
        if (isset($data['grade_level'])) $this->setGradeLevel($data['grade_level']);
        if (isset($data['step'])) $this->setStep($data['step']);
        if (isset($data['net_pay'])) $this->setNetPay($data['net_pay']);
        if (isset($data['pension_number'])) $this->setPensionNumber($data['pension_number']);
        if (isset($data['tax_id'])) $this->setTaxId($data['tax_id']);
        if (isset($data['ministry'])) $this->setMinistry($data['ministry']);
        if (isset($data['state_of_origin'])) $this->setStateOfOrigin($data['state_of_origin']);
        if (isset($data['lga'])) $this->setLga($data['lga']);
    }

    public function toArray(): array
    {
        return [
            'id'               => $this->id,
            'record_type_id'   => $this->recordType->getId(),
            'record_type_name' => $this->recordType->getName(),
            'record_type_code' => $this->recordType->getCode(),
            'staff_id'         => $this->staffId,
            'employee_name'    => $this->employeeName,
            'hire_date'        => $this->hireDate?->format('Y-m-d'),
            'date_of_birth'    => $this->dateOfBirth?->format('Y-m-d'),
            'marital_status'   => $this->maritalStatus,
            'gender'           => $this->gender,
            'job_title'        => $this->jobTitle,
            'location'         => $this->location,
            'organization'     => $this->organization,
            'sub_organization' => $this->subOrganization,
            'telephone_number' => $this->telephoneNumber,
            'bank_name'        => $this->bankName,
            'account_number'   => $this->accountNumber,
            'gross_pay'        => $this->grossPay,
            'department'       => $this->department,
            'grade_level'      => $this->gradeLevel,
            'step'             => $this->step,
            'net_pay'          => $this->netPay,
            'pension_number'   => $this->pensionNumber,
            'tax_id'           => $this->taxId,
            'ministry'         => $this->ministry,
            'state_of_origin'  => $this->stateOfOrigin,
            'lga'              => $this->lga,
            'is_active'        => $this->isActive,
            'age'              => $this->getAge(),
            'years_of_service' => $this->getYearsOfService(),
            'retirement_date'  => $this->getRetirementDate()?->format('Y-m-d'),
            'created_at'       => $this->createdAt->format('Y-m-d H:i:s'),
            'updated_at'       => $this->updatedAt->format('Y-m-d H:i:s'),
        ];
    }
}
