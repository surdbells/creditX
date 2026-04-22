import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Single toast payload.
 *
 * Duration is in milliseconds. Default flow: toast renders, the
 * progress bar animates from 100% to 0 over `duration`, then the
 * service auto-dismisses. User can also tap the toast body or the
 * X button to dismiss immediately.
 */
export interface Toast {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration: number;
}

/**
 * Agent-app toast service. Mirrors the admin app's ToastService API
 * (success / error / info / warning methods returning void + a
 * toasts$ observable for the container component to render against)
 * but tuned for mobile:
 *
 *   - Toasts stack from the BOTTOM of the screen (not the top — on
 *     mobile, top-anchored toasts fight with status bar + the
 *     Ionic ion-header).
 *   - Safe-area-bottom padding so toasts don't hide behind the
 *     tab bar or iOS home indicator.
 *   - No audio cue (admin has one; on mobile this is obtrusive and
 *     many agents work with the device silenced).
 *
 * Usage in any component:
 *
 *   constructor(private toast: ToastService) {}
 *   this.toast.error('Customer already has a loan in progress');
 *
 * Or via the HTTP interceptor — see core/interceptors/error.interceptor.ts
 * which auto-toasts any 4xx/5xx with the server's message field.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private counter = 0;
  private toastsSubject = new BehaviorSubject<Toast[]>([]);
  toasts$ = this.toastsSubject.asObservable();

  success(message: string, duration = 3500): void { this.show('success', message, duration); }
  error(message: string, duration = 5000): void { this.show('error', message, duration); }
  info(message: string, duration = 4000): void { this.show('info', message, duration); }
  warning(message: string, duration = 4500): void { this.show('warning', message, duration); }

  private show(type: Toast['type'], message: string, duration: number): void {
    const id = ++this.counter;
    const toast: Toast = { id, type, message, duration };
    this.toastsSubject.next([...this.toastsSubject.value, toast]);
    setTimeout(() => this.dismiss(id), duration);
  }

  dismiss(id: number): void {
    this.toastsSubject.next(this.toastsSubject.value.filter(t => t.id !== id));
  }
}
