import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-dashboard', standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, StatCardComponent, StatusBadgeComponent],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  loading = signal(true);
  portfolio: any = null;
  recentLoans: any[] = [];
  greeting = '';

  constructor(public auth: AuthService, private api: ApiService) {
    const h = new Date().getHours();
    this.greeting = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  }

  ngOnInit(): void {
    this.api.get('/reports/portfolio').subscribe({
      next: res => { this.portfolio = res.data; this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.api.get('/loans', { per_page: 10, sort_by: 'createdAt', sort_dir: 'DESC' }).subscribe({
      next: res => this.recentLoans = res.data || [],
    });
  }

  getStatusCount(status: string): number {
    return this.portfolio?.status_breakdown?.find((s: any) => s.status === status)?.count || 0;
  }

  formatNum(v: any): string {
    if (!v) return '0';
    return Number(v).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  }

  statusDotColor(status: string): string {
    const m: Record<string, string> = { active: '#16a34a', overdue: '#dc2626', pending: '#f59e0b', approved: '#2563eb', completed: '#0891b2', rejected: '#6b7280', disbursed: '#059669' };
    return m[status] || '#94a3b8';
  }

  statusBarWidth(item: any): string {
    const total = this.portfolio?.status_breakdown?.reduce((s: number, i: any) => s + (i.count || 0), 0) || 1;
    return Math.max(2, (item.count / total) * 100) + '%';
  }
}
