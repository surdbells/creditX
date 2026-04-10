import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonGrid, IonRow, IonCol, IonCard, IonCardHeader,
  IonCardTitle, IonCardSubtitle
} from '@ionic/angular/standalone';
import { AuthService } from '../../core/services/auth.service';
import { addIcons } from 'ionicons';
import { logOutOutline } from 'ionicons/icons';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
    IonIcon, IonGrid, IonRow, IonCol, IonCard, IonCardHeader,
    IonCardTitle, IonCardSubtitle
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Dashboard</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="logout()">
            <ion-icon name="log-out-outline" slot="icon-only"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <h2>Welcome, {{ authService.user()?.first_name }}!</h2>
      <ion-grid>
        <ion-row>
          <ion-col size="6">
            <ion-card>
              <ion-card-header>
                <ion-card-title>0</ion-card-title>
                <ion-card-subtitle>Captured</ion-card-subtitle>
              </ion-card-header>
            </ion-card>
          </ion-col>
          <ion-col size="6">
            <ion-card>
              <ion-card-header>
                <ion-card-title>0</ion-card-title>
                <ion-card-subtitle>Submitted</ion-card-subtitle>
              </ion-card-header>
            </ion-card>
          </ion-col>
          <ion-col size="6">
            <ion-card>
              <ion-card-header>
                <ion-card-title>0</ion-card-title>
                <ion-card-subtitle>Approved</ion-card-subtitle>
              </ion-card-header>
            </ion-card>
          </ion-col>
          <ion-col size="6">
            <ion-card>
              <ion-card-header>
                <ion-card-title>0</ion-card-title>
                <ion-card-subtitle>Disbursed</ion-card-subtitle>
              </ion-card-header>
            </ion-card>
          </ion-col>
        </ion-row>
      </ion-grid>
      <p style="text-align:center;color:var(--ion-color-medium);margin-top:2rem;">
        Loan capture and tracking available in Phase 10.
      </p>
    </ion-content>
  `
})
export class DashboardPage {
  constructor(public authService: AuthService) {
    addIcons({ logOutOutline });
  }
  logout(): void { this.authService.logout(); }
}
