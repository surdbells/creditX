import { Component, Input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-auth-shell',
  imports: [LucideAngularModule],
  template: `
    <div class="min-h-screen grid lg:grid-cols-2" style="background: var(--cx-bg)">
      <!-- Brand panel -->
      <div class="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden"
        style="background: linear-gradient(160deg, var(--cx-primary-700) 0%, var(--cx-primary-600) 55%, var(--cx-primary-800) 100%)">
        <div class="flex items-center gap-2.5">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center"
            style="background: var(--cx-accent-500); color: var(--cx-accent-900)">
            <lucide-icon name="wallet" [size]="22"></lucide-icon>
          </div>
          <span class="text-white text-xl font-bold tracking-tight">CreditX</span>
        </div>

        <div class="max-w-md">
          <h1 class="text-white text-3xl font-bold leading-tight mb-4">
            Borrow smarter. Track everything in one place.
          </h1>
          <p class="text-base leading-relaxed" style="color: rgba(255,255,255,0.78)">
            Apply for loans, follow your application in real time, and view your
            repayment schedule — all from your secure customer portal.
          </p>
        </div>

        <div class="flex items-center gap-2 text-sm" style="color: rgba(255,255,255,0.65)">
          <lucide-icon name="shield-check" [size]="16"></lucide-icon>
          Bank-grade security. Your data stays private.
        </div>

        <div class="absolute -bottom-24 -right-24 w-80 h-80 rounded-full opacity-20"
          style="background: radial-gradient(circle, var(--cx-accent-500), transparent 70%)"></div>
      </div>

      <!-- Form panel -->
      <div class="flex items-center justify-center p-6 sm:p-12">
        <div class="w-full max-w-sm cx-animate-in">
          <div class="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center"
              style="background: var(--cx-primary-600); color: #fff">
              <lucide-icon name="wallet" [size]="20"></lucide-icon>
            </div>
            <span class="text-lg font-bold tracking-tight" style="color: var(--cx-text)">CreditX</span>
          </div>

          <h2 class="cx-heading cx-heading-lg mb-1.5">{{ title }}</h2>
          @if (subtitle) {
            <p class="text-sm mb-6" style="color: var(--cx-text-secondary)">{{ subtitle }}</p>
          }

          <ng-content></ng-content>
        </div>
      </div>
    </div>
  `,
})
export class AuthShell {
  @Input() title = '';
  @Input() subtitle = '';
}
