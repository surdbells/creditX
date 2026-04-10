import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class ToastService {
  constructor(private snackBar: MatSnackBar) {}

  success(message: string): void {
    this.snackBar.open(message, '✕', {
      duration: 4000,
      panelClass: ['cx-toast-success'],
      horizontalPosition: 'end',
      verticalPosition: 'top',
    });
  }

  error(message: string): void {
    this.snackBar.open(message, '✕', {
      duration: 6000,
      panelClass: ['cx-toast-error'],
      horizontalPosition: 'end',
      verticalPosition: 'top',
    });
  }

  info(message: string): void {
    this.snackBar.open(message, '✕', {
      duration: 4000,
      horizontalPosition: 'end',
      verticalPosition: 'top',
    });
  }
}
