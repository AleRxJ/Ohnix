import { Component } from '@angular/core';

@Component({
  selector: 'app-demo-page',
  standalone: true,
  template: `
    <section class="demo-shell">
      <h1>Demo</h1>
      <p>Placeholder para la demo de Ohnix by iTCycle.</p>
    </section>
  `,
  styles: [
    `
      .demo-shell {
        max-width: 1200px;
        margin: 0 auto;
        color: #e2e8f0;
      }
    `
  ]
})
export class DemoPageComponent {}