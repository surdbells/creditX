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
  first_name?: string;
  last_name?: string;
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
  application_amount?: string | number;
  gross_loan?: string | number;
  net_disbursed?: string | number;
  tenure?: number;
  interest_rate?: string | number;
  loan_purpose?: string | null;
  monthly_repayment?: string | number;
  total_repayment?: string | number;
  outstanding_balance?: string | number;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

// ─── Repayment Schedule ───
export interface RepaymentScheduleItem {
  id: string;
  installment_number?: number;
  due_date?: string;
  principal_due?: string | number;
  interest_due?: string | number;
  total_due?: string | number;
  amount_paid?: string | number;
  status?: string;
  [key: string]: any;
}

// ─── Loan apply ───
export interface ApplyLoanRequest {
  product_id: string;
  amount: string;
  tenure: number;
  loan_purpose: string;
}
