import { Component } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  imports: [],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  constructor(public authService: AuthService) {}
}
