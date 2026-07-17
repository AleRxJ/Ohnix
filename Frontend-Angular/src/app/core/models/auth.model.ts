export interface User {
  _id?: string;
  username?: string;
  email?: string;
  avatar?: string;
  role?: string;
  isVerified?: boolean;
}

export interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
}