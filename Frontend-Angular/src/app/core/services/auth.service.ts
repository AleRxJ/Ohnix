import { inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import { ApiEnvelope, LoginResponse, User } from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  readonly user = signal<User | null>(null);
  readonly loading = signal(true);

  constructor() {
    const token = this.getToken();
    if (token) {
      this.refreshUser().subscribe({
        next: (response) => {
          if (response.success) {
            this.user.set(response.data);
          }
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
    } else {
      this.loading.set(false);
    }
  }

  login(credentials: { email: string; password: string }) {
    return this.api.post<ApiEnvelope<LoginResponse>>('/users/login', credentials);
  }

  refreshUser() {
    return this.api.get<ApiEnvelope<User>>('/users/current-user');
  }

  setSession(user: User, accessToken: string) {
    this.user.set(user);
    localStorage.setItem('accessToken', accessToken);
  }

  clearSession() {
    this.user.set(null);
    localStorage.removeItem('accessToken');
  }

  setUser(user: User | null) {
    this.user.set(user);
  }

  getToken() {
    return localStorage.getItem('accessToken');
  }
}