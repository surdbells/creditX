// ─── API Response Envelope ───
export interface ApiResponse<T = any> {
  status: 'success' | 'error';
  message: string;
  data?: T;
  errors?: Record<string, any>;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

// ─── Auth ───
export interface PortalTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface AuthResponse {
  customer: Customer;
  tokens: PortalTokens;
}

export interface RegisterRequest {
  full_name: string;
  email: string;
  phone: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ─── Customer ───
export interface Customer {
  id: string;
  full_name?: string;
  email: string;
  phone?: string | null;
  alt_phone?: string | null;
  home_address?: string | null;
  permanent_address?: string | null;
  state_of_origin?: string | null;
  lga?: string | null;
  hometown?: string | null;
  marital_status?: string | null;
  gender?: string | null;
  employment_type?: string | null;
  business_name?: string | null;
  employer?: string | null;
  job_title?: string | null;
  gross_pay?: string | number | null;
  is_portal_enabled?: boolean;
  portal_status?: string | null;
  email_verified_at?: string | null;
  last_login_at?: string | null;
  created_at?: string;
  [key: string]: any;
}

// ─── Loan Product ───
export interface LoanProduct {
  id: string;
  name: string;
  code?: string;
  description?: string | null;
  min_amount?: string | number;
  max_amount?: string | number;
  min_tenure?: number;
  max_tenure?: number;
  interest_rate?: string | number;
  [key: string]: any;
}

// ─── Loan ───
export interface Loan {
  id: string;
  application_id?: string;
  status: string;
  product_id?: string;
  product_name?: string;
  customer_id?: string;
  customer_name?: string;
  amount_requested?: string | number;
  gross_loan?: string | number;
  net_disbursed?: string | number;
  tenure?: number;
  interest_rate?: string | number;
  loan_purpose?: string | null;
  applicant_monthly_income?: string | number | null;
  dsr?: string | number | null;
  affordability?: Affordability;
  disbursed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

// ─── Repayment Schedule (mirrors RepaymentSchedule::toArray) ───
export interface RepaymentScheduleItem {
  id: string;
  installment_number?: number;
  due_date?: string;
  principal_amount?: string | number;
  interest_amount?: string | number;
  total_amount?: string | number;
  paid_amount?: string | number;
  outstanding?: string | number;
  status?: string;
  paid_at?: string | null;
  [key: string]: any;
}

// ─── Employment & affordability ───
export type EmploymentType = 'EMPLOYED' | 'SELF_EMPLOYED' | 'BUSINESS_OWNER' | 'OTHER';

/** Mirrors AffordabilityService::assess() output returned by the apply endpoint. */
export interface Affordability {
  monthly_income: number;
  monthly_installment: number;
  dsr: number | null;
  max_dsr: number;
  within_limit: boolean;
  disposable_income: number | null;
  has_income: boolean;
}

// ─── Loan apply ───
export interface ApplyLoanRequest {
  product_id: string;
  amount: string;
  tenure: number;
  loan_purpose: string;
  employment_type: EmploymentType;
  monthly_income: string;
  employer?: string;
  job_title?: string;
  business_name?: string;
}
