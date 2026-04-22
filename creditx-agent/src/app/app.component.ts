import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { PushService } from './core/services/push.service';
import { AuthService } from './core/services/auth.service';
import { FontScaleService } from './core/services/font-scale.service';
import { ToastContainerComponent } from './shared/components/toast/toast-container.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet, ToastContainerComponent],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
      <cxm-toast-container></cxm-toast-container>
    </ion-app>
  `,
})
export class AppComponent implements OnInit {
  constructor(private push: PushService, private auth: AuthService, private _fs: FontScaleService) {}

  ngOnInit(): void {
    // Init push notifications if user is already logged in
    if (this.auth.isAuthenticated()) {
      this.push.init();
    }
  }
}
