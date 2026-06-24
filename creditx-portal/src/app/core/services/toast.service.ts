import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private counter = 0;
  private toastsSubject = new BehaviorSubject<Toast[]>([]);
  toasts$ = this.toastsSubject.asObservable();

  private show(type: Toast['type'], message: string, duration = 4000): void {
    const id = ++this.counter;
    const toast: Toast = { id, type, message, duration };
    this.toastsSubject.next([...this.toastsSubject.value, toast]);
    setTimeout(() => this.dismiss(id), duration);
  }

  dismiss(id: number): void {
    this.toastsSubject.next(this.toastsSubject.value.filter(t => t.id !== id));
  }

  success(message: string): void { this.show('success', message, 4000); }
  error(message: string): void { this.show('error', message, 6000); }
  info(message: string): void { this.show('info', message, 4000); }
  warning(message: string): void { this.show('warning', message, 5000); }
}
