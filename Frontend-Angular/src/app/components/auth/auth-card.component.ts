import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-auth-card',
  standalone: true,
  template: `
    <article class="auth-card">
      <div class="auth-header">
        <h2>{{ title }}</h2>
        @if (subtitle) {
          <p>{{ subtitle }}</p>
        }
      </div>

      <ng-content></ng-content>
    </article>
  `,
  styles: [
    `
      .auth-card {
        width: 100%;
        background: #ffffff;
        border: 1px solid rgba(228, 228, 231, 0.8);
        border-radius: 0.75rem;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
        padding: 2.5rem;
        color: #18181b;
      }

      .auth-header {
        text-align: center;
        margin-bottom: 1.75rem;
      }

      .auth-header h2 {
        margin: 0;
        font-size: 2.25rem;
        line-height: 1.1;
        font-weight: 700;
        letter-spacing: -0.03em;
      }

      .auth-header p {
        margin: 0.5rem 0 0;
        color: #71717a;
        font-size: 0.875rem;
      }
    `
  ]
})
export class AuthCardComponent {
  @Input({ required: true }) title = '';
  @Input() subtitle = '';
}