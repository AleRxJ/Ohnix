import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-feature-page',
  standalone: true,
  template: `
    <section class="feature-card">
      <p class="eyebrow">Module</p>
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
    </section>
  `,
  styles: [
    `
      .feature-card {
        padding: 24px;
        border-radius: 20px;
        border: 1px solid rgba(148, 163, 184, 0.12);
        background: rgba(2, 6, 23, 0.55);
        color: #e2e8f0;
      }
      .eyebrow {
        margin: 0 0 8px;
        color: #67e8f9;
        text-transform: uppercase;
        letter-spacing: 0.2em;
        font-size: 0.76rem;
      }
      h1 {
        margin: 0;
        font-size: 2rem;
      }
      p {
        margin: 12px 0 0;
        color: #cbd5e1;
      }
    `
  ]
})
export class FeaturePageComponent {
  private readonly route = inject(ActivatedRoute);

  get title() {
    return this.route.snapshot.data['title'] ?? 'Module';
  }

  get description() {
    return this.route.snapshot.data['description'] ?? '';
  }
}