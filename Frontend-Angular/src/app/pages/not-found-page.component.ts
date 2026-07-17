import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="not-found">
      <h1>404</h1>
      <p>Page not found.</p>
      <a routerLink="/">Back home</a>
    </section>
  `,
  styles: [
    `
      .not-found {
        max-width: 1200px;
        margin: 0 auto;
        color: #e2e8f0;
      }
      a {
        color: #67e8f9;
      }
    `
  ]
})
export class NotFoundPageComponent {}