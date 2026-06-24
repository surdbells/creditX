import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiUrl;
  private http = inject(HttpClient);

  get<T = any>(path: string, params?: Record<string, any>): Observable<ApiResponse<T>> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }
    return this.http.get<ApiResponse<T>>(`${this.base}${path}`, { params: httpParams });
  }

  post<T = any>(path: string, body?: any): Observable<ApiResponse<T>> {
    return this.http.post<ApiResponse<T>>(`${this.base}${path}`, body);
  }

  put<T = any>(path: string, body?: any): Observable<ApiResponse<T>> {
    return this.http.put<ApiResponse<T>>(`${this.base}${path}`, body);
  }

  patch<T = any>(path: string, body?: any): Observable<ApiResponse<T>> {
    return this.http.patch<ApiResponse<T>>(`${this.base}${path}`, body);
  }

  delete<T = any>(path: string): Observable<ApiResponse<T>> {
    return this.http.delete<ApiResponse<T>>(`${this.base}${path}`);
  }
}
