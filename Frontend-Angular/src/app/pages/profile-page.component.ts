import { Component } from '@angular/core';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  template: `
    <section class="profile-shell">
      <h1>Profile</h1>
      <p>Profile management placeholder mirroring the existing UI.</p>
    </section>
  `,
  styles: [
    `
      .profile-shell {
        min-height: 100vh;
        display: grid;
        place-items: center;
        color: #e2e8f0;
      }
    `
  ]
})
export class ProfilePageComponent {}