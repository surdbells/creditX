// ─── API Response Envelope ───
export interface ApiResponse<T = any> {
  status: 'success' | 'error';
  message: string;
  data?: T;
  errors?: Record<string, string>;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

// ─── Auth ───
export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface LoginResponse {
  user: User;
  tokens: TokenResponse;
}

// ─── User ───
export interface User {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  roles?: Role[];
  locations?: Location[];
}

// ─── Role ───
export interface Role {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  permissions?: Permission[];
}

// ─── Permission ───
export interface Permission {
  id: string;
  name: string;
  slug: string;
  module: string;
}

export interface PermissionGroup {
  module: string;
  permissions: Permission[];
}

// ─── Location ───
export interface Location {
  id: string;
  name: string;
  code: string;
  address: string | null;
  state: string | null;
  type: string;
  is_active: boolean;
  created_at: string;
}

// ─── SystemSetting ───
export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  type: string;
  category: string;
  description: string | null;
  is_encrypted: boolean;
  created_at: string;
}

// ─── Audit Log ───
export interface AuditLog {
  id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  old_values: any;
  new_values: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}
