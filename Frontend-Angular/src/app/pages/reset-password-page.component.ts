import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthCardComponent } from '../components/auth/auth-card.component';
import { AuthLayoutComponent } from '../components/auth/auth-layout.component';
import { ApiService } from '../core/services/api.service';

@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, AuthCardComponent],
  templateUrl: './reset-password-page.component.html',
  styleUrl: './reset-password-page.component.scss'
})
export class ResetPasswordPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly emailForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]]
  });

  readonly resetForm = this.fb.nonNullable.group({
    otp: ['', [Validators.required, Validators.minLength(6)]],
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required, Validators.minLength(6)]]
  });

  step = 0;
  loading = false;
  errorMessage = '';
  email = '';

  sendOtp() {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.email = this.emailForm.controls.email.value;

    this.api.post<any>('/users/send-reset-otp', { email: this.email }).subscribe({
      next: (response) => {
        if (response?.success) {
          this.step = 1;
          this.loading = false;
          return;
        }

        this.errorMessage = response?.message ?? 'Failed to send OTP';
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message ?? 'Something went wrong';
        this.loading = false;
      }
    });
  }

  resetPassword() {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    const { otp, newPassword, confirmPassword } = this.resetForm.getRawValue();

    if (newPassword !== confirmPassword) {
      this.errorMessage = 'Passwords do not match';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.api.post<any>('/users/reset-password', {
      email: this.email,
      otp,
      newPassword
    }).subscribe({
      next: (response) => {
        if (response?.success) {
          this.router.navigateByUrl('/login');
          return;
        }

        this.errorMessage = response?.message ?? 'Reset failed';
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message ?? 'Something went wrong';
        this.loading = false;
      }
    });
  }
}