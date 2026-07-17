import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthCardComponent } from '../components/auth/auth-card.component';
import { AuthLayoutComponent } from '../components/auth/auth-layout.component';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, AuthCardComponent],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss'
})
export class LoginPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  loading = false;
  errorMessage = '';

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.authService.login(this.form.getRawValue()).subscribe({
      next: (response) => {
        if (response.success) {
          this.authService.setSession(response.data.user, response.data.accessToken);
          this.router.navigateByUrl('/dashboard');
          return;
        }

        this.errorMessage = response.message ?? 'Login failed';
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message ?? 'Something went wrong';
        this.loading = false;
      }
    });
  }
}