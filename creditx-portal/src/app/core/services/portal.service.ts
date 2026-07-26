import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import {
  ApiResponse, ApplyLoanRequest, Customer, Investment, InvestmentPerformance,
  InvestmentPortfolio, InvestmentTransaction, Loan, LoanProduct, RepaymentScheduleItem,
} from '../models';

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

  /** Public (pre-auth) calculator — active products, no customer token needed. */
  calculatorProducts(): Observable<ApiResponse<LoanProduct[]>> {
    return this.api.get<LoanProduct[]>('/portal/calculator/products');
  }

  /** Public (pre-auth) repayment estimate for a product/amount/tenure. */
  calculate(payload: { product_id: string; amount: number | string; tenure: number }): Observable<ApiResponse<any>> {
    return this.api.post<any>('/portal/calculator/calculate', payload);
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

  /**
   * The signed-in investor's own investments, each with its performance block
   * plus a portfolio summary. Scoped server-side to the token's customer.
   */
  listInvestments(): Observable<ApiResponse<InvestmentPortfolio>> {
    return this.api.get<InvestmentPortfolio>('/portal/investments');
  }

  /** One investment with performance and the full statement. */
  getInvestment(id: string): Observable<ApiResponse<{
    investment: Investment;
    performance: InvestmentPerformance;
    transactions: InvestmentTransaction[];
  }>> {
    return this.api.get<any>(`/portal/investments/${id}`);
  }
}
