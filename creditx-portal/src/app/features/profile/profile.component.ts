import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { PortalService } from '../../core/services/portal.service';
import { ToastService } from '../../core/services/toast.service';
import { Customer } from '../../core/models';

@Component({
  selector: 'app-profile',
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 class="cx-heading cx-heading-lg mb-1">Profile</h1>
        <p class="text-sm" style="color: var(--cx-text-secondary)">Keep your contact details up to date.</p>
      </div>

      <!-- Read-only identity -->
      <div class="cx-card flex items-center gap-4">
        <div class="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
          style="background: var(--cx-primary-100); color: var(--cx-primary-700)">
          {{ initials() }}
        </div>
        <div class="min-w-0">
          <p class="font-semibold truncate" style="color: var(--cx-text)">{{ form.full_name || customer()?.email }}</p>
          <p class="text-sm truncate" style="color: var(--cx-text-muted)">{{ customer()?.email }}</p>
        </div>
      </div>

      <form (ngSubmit)="save()" class="cx-card cx-form-stack">
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label" for="phone">Phone</label>
            <input id="phone" name="phone" type="tel" class="cx-input" [(ngModel)]="form.phone" />
          </div>
          <div>
            <label class="cx-label" for="alt_phone">Alternate phone</label>
            <input id="alt_phone" name="alt_phone" type="tel" class="cx-input" [(ngModel)]="form.alt_phone" />
          </div>
        </div>
        <div>
          <label class="cx-label" for="home_address">Home address</label>
          <input id="home_address" name="home_address" type="text" class="cx-input" [(ngModel)]="form.home_address" />
        </div>
        <div>
          <label class="cx-label" for="permanent_address">Permanent address</label>
          <input id="permanent_address" name="permanent_address" type="text" class="cx-input" [(ngModel)]="form.permanent_address" />
        </div>
        <div class="cx-form-row cx-form-row-3">
          <div>
            <label class="cx-label" for="state_of_origin">State of origin</label>
            <input id="state_of_origin" name="state_of_origin" type="text" class="cx-input" [(ngModel)]="form.state_of_origin" />
          </div>
          <div>
            <label class="cx-label" for="lga">LGA</label>
            <input id="lga" name="lga" type="text" class="cx-input" [(ngModel)]="form.lga" />
          </div>
          <div>
            <label class="cx-label" for="hometown">Hometown</label>
            <input id="hometown" name="hometown" type="text" class="cx-input" [(ngModel)]="form.hometown" />
          </div>
        </div>
        <div class="cx-form-row cx-form-row-2">
          <div>
            <label class="cx-label" for="marital_status">Marital status</label>
            <select id="marital_status" name="marital_status" class="cx-select" [(ngModel)]="form.marital_status">
              <option value="">—</option>
              <option value="single">Single</option>
              <option value="married">Married</option>
              <option value="divorced">Divorced</option>
              <option value="widowed">Widowed</option>
            </select>
          </div>
          <div>
            <label class="cx-label" for="gender">Gender</label>
            <select id="gender" name="gender" class="cx-select" [(ngModel)]="form.gender">
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>

        <div class="pt-1">
          <button type="submit" class="cx-btn cx-btn-primary cx-btn-lg" [disabled]="saving()">
            @if (saving()) { <lucide-icon name="loader-2" [size]="17" class="animate-spin"></lucide-icon> }
            Save changes
          </button>
        </div>
      </form>
    </div>
  `,
})
export class ProfileComponent implements OnInit {
  private auth = inject(AuthService);
  private portal = inject(PortalService);
  private toast = inject(ToastService);

  customer = this.auth.customer;
  saving = signal(false);

  form = {
    full_name: '',
    phone: '',
    alt_phone: '',
    home_address: '',
    permanent_address: '',
    state_of_origin: '',
    lga: '',
    hometown: '',
    marital_status: '',
    gender: '',
  };

  private readonly editable: (keyof typeof this.form)[] = [
    'phone', 'alt_phone', 'home_address', 'permanent_address',
    'state_of_origin', 'lga', 'hometown', 'marital_status', 'gender',
  ];

  ngOnInit(): void {
    this.hydrate(this.customer());
    // Refresh from server for the latest values.
    this.portal.me().subscribe({
      next: res => {
        if (res.data) {
          this.auth.setCustomer(res.data);
          this.hydrate(res.data);
        }
      },
      error: () => {},
    });
  }

  private hydrate(c: Customer | null): void {
    if (!c) {
      return;
    }
    this.form.full_name = c.full_name ?? '';
    for (const key of this.editable) {
      this.form[key] = (c[key] as string) ?? '';
    }
  }

  initials(): string {
    const name = this.form.full_name || this.customer()?.email || 'C';
    return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || 'C';
  }

  save(): void {
    const payload: Record<string, string> = {};
    for (const key of this.editable) {
      payload[key] = this.form[key];
    }
    this.saving.set(true);
    this.portal.updateProfile(payload).subscribe({
      next: res => {
        this.saving.set(false);
        if (res.status === 'success') {
          if (res.data) {
            this.auth.setCustomer(res.data);
          }
          this.toast.success('Profile updated.');
        } else {
          this.toast.error(res.message || 'Could not save changes.');
        }
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'Could not save changes.');
      },
    });
  }
}
