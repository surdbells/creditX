import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { personOutline, mailOutline, callOutline, shieldCheckmarkOutline, logOutOutline, moonOutline, informationCircleOutline } from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonHeader, IonToolbar, IonTitle, IonIcon],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar><ion-title>Profile</ion-title></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true" class="ion-padding">
      <div class="flex flex-col items-center pt-4 pb-6">
        <div class="w-20 h-20 rounded-full bg-[#0A4F2A] flex items-center justify-center text-white text-2xl font-bold">
          {{ auth.user()?.first_name?.[0] }}{{ auth.user()?.last_name?.[0] }}
        </div>
        <h2 class="text-lg font-semibold text-gray-800 mt-3">{{ auth.user()?.full_name }}</h2>
        <p class="text-xs text-gray-500">{{ auth.user()?.roles?.[0]?.name || 'Agent' }}</p>
      </div>

      <div class="space-y-2">
        <div class="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
          @for (field of profileFields; track field.label) {
            <div class="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
              <ion-icon [name]="field.icon" class="text-[#0A4F2A] text-lg"></ion-icon>
              <div class="flex-1">
                <div class="text-xs text-gray-500">{{ field.label }}</div>
                <div class="text-sm font-medium text-gray-800">{{ field.value || '—' }}</div>
              </div>
            </div>
          }
        </div>

        <button class="w-full py-3 rounded-xl bg-red-50 text-red-600 font-medium text-sm flex items-center justify-center gap-2 mt-4" (click)="logout()">
          <ion-icon name="log-out-outline"></ion-icon> Sign Out
        </button>

        <p class="text-center text-[10px] text-gray-400 mt-6">CreditX Agent v2.0 &bull; Kodek Innovations Limited</p>
      </div>
    </ion-content>
  `,
})
export class ProfilePage {
  constructor(public auth: AuthService, private router: Router) {
    addIcons({ personOutline, mailOutline, callOutline, shieldCheckmarkOutline, logOutOutline, moonOutline, informationCircleOutline });
  }

  get profileFields(): {label:string;value:string;icon:string}[] {
    const u = this.auth.user();
    return [
      { label: 'Full Name', value: u?.full_name || '', icon: 'person-outline' },
      { label: 'Email', value: u?.email || '', icon: 'mail-outline' },
      { label: 'Phone', value: u?.phone || '', icon: 'call-outline' },
      { label: 'Role', value: u?.roles?.[0]?.name || 'Agent', icon: 'shield-checkmark-outline' },
    ];
  }

  logout(): void { this.auth.logout(); }
}
