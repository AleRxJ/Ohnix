import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthCardComponent } from '../components/auth/auth-card.component';
import { AuthLayoutComponent } from '../components/auth/auth-layout.component';
import { ApiService } from '../core/services/api.service';

@Component({
  selector: 'app-signup-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, AuthCardComponent],
  templateUrl: './signup-page.component.html',
  styleUrl: './signup-page.component.scss'
})
export class SignupPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    avatar: [null as File | null, [Validators.required]]
  });

  loading = false;
  errorMessage = '';

  onAvatarChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.form.controls.avatar.setValue(file);
  }

  submit() {
    if (this.form.invalid || !this.form.value.avatar) {
      this.form.markAllAsTouched();
      this.errorMessage = 'Please complete all fields and upload an avatar.';
      return;
    }

    const formData = new FormData();
    formData.append('username', this.form.controls.username.value);
    formData.append('email', this.form.controls.email.value);
    formData.append('password', this.form.controls.password.value);
    formData.append('avatar', this.form.controls.avatar.value as File);

    this.loading = true;
    this.errorMessage = '';

    this.api.post<any>('/users/register', formData).subscribe({
      next: (response) => {
        if (response?.success) {
          this.router.navigateByUrl('/login');
          return;
        }

        this.errorMessage = response?.message ?? 'Signup failed';
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message ?? 'Something went wrong';
        this.loading = false;
      }
    });
  }
}