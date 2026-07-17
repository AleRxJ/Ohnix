import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ApiService } from '../core/services/api.service';

type DashboardMetrics = {
  totalSales: number;
  totalPurchase: number;
  inventoryValue: number;
  totalProducts: number;
  totalStock: number;
  outOfStockCount: number;
  lowStockProducts: Array<{ _id?: string; product_name?: string; stock?: number }>;
  recentOrders: Array<{ _id?: string; order_no?: string; total?: number; order_status?: string }>;
};

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="dashboard-shell">
      <header class="hero panel">
        <div>
          <p class="eyebrow">Overview</p>
          <h1>Dashboard</h1>
          <p>Live inventory, sales, purchase, and stock data from the backend.</p>
        </div>
      </header>

      @if (loading) {
        <section class="panel state">Loading metrics…</section>
      } @else if (error) {
        <section class="panel state error">{{ error }}</section>
      } @else {
        <section class="metrics">
          <article class="metric-card"><span>Total sales</span><strong>{{ metrics.totalSales | number:'1.0-2' }}</strong></article>
          <article class="metric-card"><span>Total purchase</span><strong>{{ metrics.totalPurchase | number:'1.0-2' }}</strong></article>
          <article class="metric-card"><span>Inventory value</span><strong>{{ metrics.inventoryValue | number:'1.0-2' }}</strong></article>
          <article class="metric-card"><span>Total products</span><strong>{{ metrics.totalProducts }}</strong></article>
          <article class="metric-card"><span>Total stock</span><strong>{{ metrics.totalStock }}</strong></article>
          <article class="metric-card"><span>Out of stock</span><strong>{{ metrics.outOfStockCount }}</strong></article>
        </section>

        <section class="panel sections">
          <div>
            <h2>Low stock products</h2>
            <div class="list">
              @for (product of metrics.lowStockProducts; track product._id) {
                <div class="list-row">
                  <span>{{ product.product_name }}</span>
                  <strong>{{ product.stock }}</strong>
                </div>
              }
            </div>
          </div>

          <div>
            <h2>Recent orders</h2>
            <div class="list">
              @for (order of metrics.recentOrders; track order._id) {
                <div class="list-row">
                  <span>{{ order.order_no || order._id }}</span>
                  <strong>{{ order.total || 0 | number:'1.0-2' }}</strong>
                </div>
              }
            </div>
          </div>
        </section>
      }
    </section>
  `,
  styles: [
    `
      .dashboard-shell {
        display: grid;
        gap: 18px;
        color: #e2e8f0;
      }
      .panel {
        border: 1px solid rgba(148, 163, 184, 0.12);
        border-radius: 20px;
        background: rgba(2, 6, 23, 0.48);
      }
      .hero,
      .state {
        padding: 24px;
      }
      .eyebrow {
        margin: 0 0 8px;
        color: #67e8f9;
        text-transform: uppercase;
        letter-spacing: 0.2em;
        font-size: 0.75rem;
      }
      h1,
      h2,
      p {
        margin: 0;
      }
      p,
      span {
        color: #94a3b8;
      }
      .error {
        color: #fca5a5;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
      }
      .metric-card,
      .sections > div {
        padding: 16px;
        border-radius: 16px;
        border: 1px solid rgba(148, 163, 184, 0.12);
        background: rgba(15, 23, 42, 0.7);
      }
      .metric-card {
        display: grid;
        gap: 6px;
      }
      .metric-card strong {
        font-size: 1.5rem;
      }
      .sections {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 14px;
        padding: 16px;
      }
      .list {
        display: grid;
        gap: 10px;
        margin-top: 14px;
      }
      .list-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid rgba(148, 163, 184, 0.08);
      }
      .list-row:last-child {
        border-bottom: 0;
      }
    `
  ]
})
export class DashboardPageComponent {
  private readonly api = inject(ApiService);

  loading = true;
  error = '';
  metrics: DashboardMetrics = {
    totalSales: 0,
    totalPurchase: 0,
    inventoryValue: 0,
    totalProducts: 0,
    totalStock: 0,
    outOfStockCount: 0,
    lowStockProducts: [],
    recentOrders: []
  };

  constructor() {
    this.api.get<{ success: boolean; data: DashboardMetrics }>('/reports/dashboard').subscribe({
      next: (response) => {
        this.metrics = response.data;
        this.loading = false;
      },
      error: (error) => {
        this.error = error?.error?.message ?? 'Unable to load dashboard metrics';
        this.loading = false;
      }
    });
  }
}