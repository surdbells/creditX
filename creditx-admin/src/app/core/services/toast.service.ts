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
  private audio: HTMLAudioElement | null = null;

  constructor() {
    try {
      this.audio = new Audio();
      this.audio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7v///////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+1DEAAAH+ANntAAAAR8gbPc/EAAAAAA3/+MYxA0AAADSAAAAABn///8AAAAAGf///4AAAAAMYxA0AAADSAAAAABn///8AAAAAGf///wAAAAA=';
    } catch (e) {}
  }

  private show(type: Toast['type'], message: string, duration = 4000): void {
    const id = ++this.counter;
    const toast: Toast = { id, type, message, duration };
    this.toastsSubject.next([...this.toastsSubject.value, toast]);
    this.playSound();
    setTimeout(() => this.dismiss(id), duration);
  }

  dismiss(id: number): void {
    this.toastsSubject.next(this.toastsSubject.value.filter(t => t.id !== id));
  }

  private playSound(): void {
    try {
      if (this.audio) { this.audio.currentTime = 0; this.audio.volume = 0.25; this.audio.play().catch(() => {}); }
    } catch (e) {}
  }

  success(message: string): void { this.show('success', message, 4000); }
  error(message: string): void { this.show('error', message, 6000); }
  info(message: string): void { this.show('info', message, 4000); }
  warning(message: string): void { this.show('warning', message, 5000); }
}
