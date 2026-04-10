import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, FileText, CreditCard, Users, Banknote, TrendingUp, AlertTriangle, CheckCircle, Clock } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, StatCardComponent, StatusBadgeComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  loading = signal(true);
  portfolio: any = null;
  recentLoans: any[] = [];

  constructor(public auth: AuthService, private api: ApiService) {}

  ngOnInit(): void {
    this.loadDashboard();
  }

  loadDashboard(): void {
    this.loading.set(true);
    this.api.get('/reports/portfolio').subscribe({
      next: res => {
        this.portfolio = res.data;
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.api.get('/loans', { per_page: 10, sort_by: 'created_at', sort_dir: 'DESC' }).subscribe({
      next: res => { this.recentLoans = res.data || []; },
    });
  }

  getStatusCount(status: string): number {
    if (!this.portfolio?.status_breakdown) return 0;
    const found = this.portfolio.status_breakdown.find((s: any) => s.status === status);
    return found ? Number(found.count) : 0;
  }
}
