import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../core/services/api.service';

type ModuleResponse = {
  success: boolean;
  message?: string;
  data: unknown;
};

@Component({
  selector: 'app-module-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './module-page.component.html',
  styleUrl: './module-page.component.scss'
})
export class ModulePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);

  title = this.route.snapshot.data['title'] ?? 'Module';
  description = this.route.snapshot.data['description'] ?? '';
  endpoint = this.route.snapshot.data['endpoint'] ?? '';
  loading = true;
  error = '';
  payload: unknown = null;

  constructor() {
    if (!this.endpoint) {
      this.loading = false;
      return;
    }

    this.api.get<ModuleResponse>(this.endpoint).subscribe({
      next: (response) => {
        this.payload = response.data;
        this.loading = false;
      },
      error: (error) => {
        this.error = error?.error?.message ?? 'Unable to load module data';
        this.loading = false;
      }
    });
  }

  get isArrayPayload() {
    return Array.isArray(this.payload);
  }

  get arrayPayload() {
    return Array.isArray(this.payload) ? this.payload : [];
  }

  get objectEntries() {
    return this.payload && !Array.isArray(this.payload)
      ? Object.entries(this.payload as Record<string, unknown>)
      : [];
  }

  objectEntriesOf(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.entries(value as Record<string, unknown>)
      : [];
  }

  formatValue(value: unknown) {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') return value.toLocaleString();
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return `${value.length} item(s)`;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}