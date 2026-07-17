import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  template: `
    <div class="auth-layout">
      <div class="auth-visual">
        <div class="auth-visual-overlay"></div>
        <div class="auth-visual-content">
          <img [src]="imageSrc" alt="Authentication" />
        </div>
      </div>

      <div class="auth-content">
        <div class="auth-content-inner">
          <ng-content></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .auth-layout {
        min-height: 100vh;
        display: flex;
        background: linear-gradient(to bottom right, #f8fafc, #f1f5f9);
      }

      .auth-visual {
        position: relative;
        display: none;
        flex: 1;
        overflow: hidden;
        background: linear-gradient(to bottom right, #4f46e5, #4338ca, #6d28d9);
      }

      .auth-visual-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.1);
      }

      .auth-visual-content {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 3rem;
      }

      .auth-visual-content img {
        max-height: 85vh;
        width: auto;
        object-fit: contain;
        filter: drop-shadow(0 24px 48px rgba(15, 23, 42, 0.32));
      }

      .auth-content {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
      }

      .auth-content-inner {
        width: 100%;
        max-width: 28rem;
      }

      @media (min-width: 1024px) {
        .auth-visual {
          display: flex;
        }

        .auth-content {
          width: 50%;
          padding: 3rem;
        }
      }
    `
  ]
})
export class AuthLayoutComponent {
  @Input() imageSrc = '/Inventory-management-system.webp';
}