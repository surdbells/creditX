# Phase C — Agent Loan Form Rewrite — Plan

Pinned on 2026-04-21 mid-session to survive context compaction.
All 5 commits below implement the agent-facing loan intake wizard that
replaces the thin loan-capture.page.ts with a full-fidelity form matching
the legacy CreditX PHP form (6 sections, 35+ fields), but restructured
as a modern wizard with a progress bar and Prev/Next navigation.

## User decisions driving the plan

- **Scope:** Match legacy 1:1 for fields; modernize UX (wizard, not accordions)
- **Prefill:** IPPIS lookup only. Agent types IPPIS into step 1, clicks
  "Search" button, and the Next button activates only if the lookup
  finds a customer OR the agent explicitly creates a new one.
- **Customer strategy:** Reuse existing Customer entity. Add missing
  employment columns. No new Applicant entity.
- **API shape:** `POST /api/loans` creates-or-reuses customer in ONE
  call via a nested `customer` payload. Atomic on the backend.
- **UX pattern:** Wizard with a progress bar showing all 6 steps at
  the top, Prev/Next buttons at the bottom of each step.

## Legacy → target field mapping

**6 wizard steps (matching legacy accordion sections):**

1. **Personal Information** — IPPIS search first, then full_name,
   date_of_birth, gender, marital_status, number_of_children, bvn
2. **Contact Information** — phone, alt_phone, home_address,
   permanent_address, state_of_origin, lga (cascading), hometown,
   mothers_maiden_name, religion
3. **Employment Information** — employee_id, job_title, employer,
   organization, command, employment_date, id_type, work_id_number,
   work_id_issued_date, work_id_expiry_date
4. **Loan Details** — gross_pay (Net Pay), loan_tenure, loan_amount,
   loan_amount_words, loan_purpose, repayment_method,
   bank_statement_mode, account_statement_id, account_statement_password
5. **Disbursement Bank Details** — account_number, account_name,
   bank_name, alt_bank_name, alt_account_number, alt_account_name,
   [Validate Bank Account button]
6. **Next of Kin** — next_full_name, next_phone_number, next_address,
   next_relationship

## Gap analysis — what exists vs what needs adding

### Customer entity — fields ALREADY PRESENT (no change)

staff_id, full_name, phone, alt_phone, email, date_of_birth, gender,
marital_status, home_address, permanent_address, state_of_origin, lga,
hometown, mothers_maiden_name, religion, bvn, number_of_children,
bank_name, account_number, alt_bank_name, alt_account_number

### Customer entity — fields TO ADD in C.1

(employment block)
- job_title (string 100)
- employer (string 200)
- organization (string 200) — sub-organization / ministry / agency
- command (string 100) — for armed forces / police / similar
- employment_date (date)
- id_type (string 50) — WorkID / NIN / DriversLicense / etc
- work_id_number (string 50)
- work_id_issued_date (date)
- work_id_expiry_date (date)
- gross_pay (decimal 15,2) — note: legacy label says "Net Pay" but
  stored as gross_pay

(missing banking)
- alt_account_name (string 200)

All nullable — existing customer rows don't have values.

### Loan entity — fields ALREADY PRESENT (no change)

application_id, customer, product, branch, agent, amount_requested,
tenure, gross_loan, net_disbursed, interest_rate, calculation_method,
status, loan_type, bank_statement_mode, top_up_balance, previous_loan_id

### Loan entity — fields TO ADD in C.1

- loan_amount_words (string 500) — "Five hundred thousand naira only"
- loan_purpose (string 200) — default "Public Sector" per legacy
- repayment_method (string 50) — Direct Debit / Cheques / Payroll
- account_statement_id (string 100, nullable)
- account_statement_password (string 100, nullable) — stored encrypted
  via a simple setter-side encrypt (out of scope if hashing proves
  tricky; can be plain for now with a TODO)

### NextOfKin entity — unchanged

All legacy fields present: full_name, phone, address, relationship.

## The 5 commits

### C.1 — Backend entity changes + IPPIS lookup endpoint

Files:
- backend/src/Domain/Entity/Customer.php (add 10 columns + getters/
  setters + fillFromArray + toArray)
- backend/src/Domain/Entity/Loan.php (add 5 columns + getters/setters)
- backend/src/Domain/Repository/CustomerRepository.php (add
  findByStaffId method if not present)
- backend/src/Action/Customer/FindByIppisAction.php (new file)
- backend/config/routes.php (add GET /api/customers/by-ippis/{ippis})

Endpoint:
  GET /api/customers/by-ippis/{ippis}
    returns { found: bool, customer: Customer|null }

No schema update runs in this commit — server operator runs
`orm:schema-tool:update` on deploy. Columns default NULL so existing
rows are unaffected.

### C.2 — Backend CreateLoanAction: accept nested customer payload

Change `POST /api/loans` to accept either:
  { customer_id, product_id, amount, ... }              (existing path)
OR
  { customer: { staff_id, full_name, ... }, product_id, ... }  (new path)

If `customer_id` is present, use it. Otherwise, use the `customer`
payload to:
  - Look up by staff_id; if found, use that customer
  - Otherwise, create a new Customer with fillFromArray

All in a single DB transaction. Never leaves orphaned customer
records if the loan creation fails.

Files:
- backend/src/Action/Loan/CreateLoanAction.php (extend)
- backend/src/Infrastructure/Service/InputValidator.php (maybe — if
  nested-object validation isn't supported, add a helper)

### C.3 — Frontend wizard scaffold

Files:
- creditx-agent/src/app/pages/loan-capture/loan-capture.page.ts
  (full rewrite)
- creditx-agent/src/app/pages/loan-capture/loan-capture.types.ts
  (form state + step definitions — new file)

The page will be structured as:
  - Top: progress bar (segments for 6 steps, current highlighted)
  - Middle: currently active step's fields
  - Bottom: Prev button, Next/Submit button, cancel link

Uses Angular signals for step state + form state. No reactive forms —
`ngModel` throughout for consistency with the rest of the agent app.

This commit ships the scaffolding + step 1 (Personal Information
with IPPIS search). Steps 2-6 come in C.4.

### C.4 — Frontend wizard steps 2-6

Files:
- creditx-agent/src/app/pages/loan-capture/loan-capture.page.ts
  (add step 2-6 sections)

Each step:
- renders its fields from form state
- validates locally before allowing Next
- for Loan Details (step 4), pre-populate loan_amount_words from
  loan_amount using a small number-to-words helper

### C.5 — Frontend submit flow + final polish

Files:
- creditx-agent/src/app/pages/loan-capture/loan-capture.page.ts
  (wire submit, connect calculator preview, nav guards)

On submit:
  - Assemble the payload per the C.2 shape
  - Show the calculated breakdown one more time for confirmation
  - Submit to POST /api/loans
  - On success, navigate to loan detail page
  - On error, show field-level validation feedback

Nav guard: prompt if agent tries to leave mid-wizard with unsaved data.

## Assumptions I'm making

- IPPIS = Customer.staff_id (same field, different name). Legacy uses
  "IPPIS NUMBER" label; DB column is staff_id.
- State → LGA cascade data is already available via existing
  endpoints (need to verify when writing C.4)
- Bank account validation endpoint already exists (Paystack etc.) —
  will gracefully degrade the Validate button if not
- Password storage for account_statement_password is plain text for
  now. Will flag as a security TODO.

## What NOT to do

- Don't add participants/channels to Conversation (Item 6 was out of
  scope for this phase)
- Don't wire push notifications (Item 5 was out of scope)
- Don't add @capacitor/camera (Item 4 works without it, deferred)
- Don't rewrite the customer list or customer detail pages — those
  continue to work with the existing Customer entity, now with extra
  nullable columns

## Resume cue after context compaction

If a transcript summary pops up:
  - Plan file: /home/claude/creditx/PHASE-C-PLAN.md (this file)
  - Current commit head: will be at whatever C.N has just shipped
  - Resume from the next C.N+1 commit described above
  - User has approved all 5 commits; no need to re-ask
