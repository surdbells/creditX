import { Component } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonRouterOutlet } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { homeOutline, documentTextOutline, calculatorOutline, chatbubbleEllipsesOutline, personOutline } from 'ionicons/icons';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom" color="light">
        <ion-tab-button tab="dashboard">
          <ion-icon name="home-outline"></ion-icon>
          <ion-label>Home</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="loans">
          <ion-icon name="document-text-outline"></ion-icon>
          <ion-label>Loans</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="calculator">
          <ion-icon name="calculator-outline"></ion-icon>
          <ion-label>Calculator</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="messages">
          <ion-icon name="chatbubble-ellipses-outline"></ion-icon>
          <ion-label>Messages</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="profile">
          <ion-icon name="person-outline"></ion-icon>
          <ion-label>Profile</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage {
  constructor() {
    addIcons({ homeOutline, documentTextOutline, calculatorOutline, chatbubbleEllipsesOutline, personOutline });
  }
}
