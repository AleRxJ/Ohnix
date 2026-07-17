import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthCardComponent } from '../components/auth/auth-card.component';
import { AuthLayoutComponent } from '../components/auth/auth-layout.component';
import { ApiService } from '../core/services/api.service';

@Component({
  selector: 'app-email-verify-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, AuthCardComponent],
  templateUrl: './email-verify-page.component.html',
  styleUrl: './email-verify-page.component.scss'
})
export class EmailVerifyPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    otp: ['', [Validators.required, Validators.minLength(6)]]
  });

  loading = false;
  sending = false;
  errorMessage = '';
  otpSent = false;

  sendOtp() {
    this.sending = true;
    this.errorMessage = '';

    this.api.post<any>('/users/send-verify-otp', {}).subscribe({
      next: (response) => {
        if (response?.success) {
          this.otpSent = true;
          this.sending = false;
          return;
        }

        this.errorMessage = response?.message ?? 'Failed to send OTP';
        this.sending = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message ?? 'Something went wrong';
        this.sending = false;
      }
    });
  }

  verifyOtp() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.api.post<any>('/users/verify-email', this.form.getRawValue()).subscribe({
      next: (response) => {
        if (response?.success) {
          this.router.navigateByUrl('/dashboard');
          return;
        }

        this.errorMessage = response?.message ?? 'Verification failed';
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message ?? 'Something went wrong';
        this.loading = false;
      }
    });
  }
}