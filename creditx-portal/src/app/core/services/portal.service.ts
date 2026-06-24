import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ApiResponse, ApplyLoanRequest, Customer, Loan, LoanProduct, RepaymentScheduleItem } from '../models';

@Injectable({ providedIn: 'root' })
export class PortalService {
  private api = inject(ApiService);

  me(): Observable<ApiResponse<Customer>> {
    return this.api.get<Customer>('/portal/me');
  }

  updateProfile(payload: Record<string, any>): Observable<ApiResponse<Customer>> {
    return this.api.patch<Customer>('/portal/me', payload);
  }

  listProducts(): Observable<ApiResponse<LoanProduct[]>> {
    return this.api.get<LoanProduct[]>('/portal/products');
  }

  applyLoan(payload: ApplyLoanRequest): Observable<ApiResponse<Loan>> {
    return this.api.post<Loan>('/portal/loans', payload);
  }

  listLoans(params?: Record<string, any>): Observable<ApiResponse<Loan[]>> {
    return this.api.get<Loan[]>('/portal/loans', params);
  }

  getLoan(id: string): Observable<ApiResponse<Loan>> {
    return this.api.get<Loan>(`/portal/loans/${id}`);
  }

  getSchedule(id: string): Observable<ApiResponse<RepaymentScheduleItem[]>> {
    return this.api.get<RepaymentScheduleItem[]>(`/portal/loans/${id}/schedule`);
  }
}
