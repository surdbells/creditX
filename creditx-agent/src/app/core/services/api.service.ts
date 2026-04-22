import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpRequest, HttpEvent, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models';

/**
 * Options for requests that should not fire an error toast via
 * the error interceptor. Use `{ silent: true }` for background
 * polls where a transient failure would be a false positive
 * (pause-check polling, channel message polling, etc.).
 */
export interface RequestOptions {
  silent?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiUrl;
  constructor(private http: HttpClient) {}

  private silentHeaders(opts?: RequestOptions): HttpHeaders | undefined {
    return opts?.silent ? new HttpHeaders({ 'X-Skip-Error-Toast': '1' }) : undefined;
  }

  get<T = any>(path: string, params?: Record<string, any>, opts?: RequestOptions): Observable<ApiResponse<T>> {
    let hp = new HttpParams();
    if (params) Object.entries(params).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') hp = hp.set(k, String(v)); });
    return this.http.get<ApiResponse<T>>(`${this.base}${path}`, { params: hp, headers: this.silentHeaders(opts) });
  }

  post<T = any>(path: string, body?: any, opts?: RequestOptions): Observable<ApiResponse<T>> {
    return this.http.post<ApiResponse<T>>(`${this.base}${path}`, body, { headers: this.silentHeaders(opts) });
  }

  put<T = any>(path: string, body?: any, opts?: RequestOptions): Observable<ApiResponse<T>> {
    return this.http.put<ApiResponse<T>>(`${this.base}${path}`, body, { headers: this.silentHeaders(opts) });
  }

  patch<T = any>(path: string, body?: any, opts?: RequestOptions): Observable<ApiResponse<T>> {
    return this.http.patch<ApiResponse<T>>(`${this.base}${path}`, body, { headers: this.silentHeaders(opts) });
  }

  delete<T = any>(path: string, opts?: RequestOptions): Observable<ApiResponse<T>> {
    return this.http.delete<ApiResponse<T>>(`${this.base}${path}`, { headers: this.silentHeaders(opts) });
  }

  upload<T = any>(path: string, formData: FormData): Observable<ApiResponse<T>> {
    return this.http.post<ApiResponse<T>>(`${this.base}${path}`, formData);
  }

  /**
   * Upload with progress events. Emits HttpEvents — use reportProgress.
   * Subscriber gets UploadProgress (0-100) events and a final success event.
   */
  uploadWithProgress<T = any>(path: string, formData: FormData): Observable<HttpEvent<ApiResponse<T>>> {
    const req = new HttpRequest('POST', `${this.base}${path}`, formData, {
      reportProgress: true,
    });
    return this.http.request<ApiResponse<T>>(req);
  }
}
