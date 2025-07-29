import { api } from '../lib/api';
import type { User } from '../types';

export interface LoginResponse {
  user: User;
  token: string;
  refreshToken: string;
}

export interface RefreshTokenResponse {
  token: string;
  refreshToken: string;
}

export const authService = {
  // Initiate X OAuth login
  initiateXLogin: (): void => {
    window.location.href = '/api/auth/x/oauth';
  },

  // Handle OAuth callback
  handleOAuthCallback: async (code: string, state?: string): Promise<LoginResponse> => {
    return api.post<LoginResponse>('/auth/x/callback', { code, state });
  },

  // Refresh access token
  refreshToken: async (refreshToken: string): Promise<RefreshTokenResponse> => {
    return api.post<RefreshTokenResponse>('/auth/refresh', { refreshToken });
  },

  // Get current user profile
  getCurrentUser: async (): Promise<User> => {
    return api.get<User>('/auth/me');
  },

  // Update user settings
  updateUserSettings: async (settings: Partial<User['settings']>): Promise<User> => {
    return api.put<User>('/auth/settings', settings);
  },

  // Logout
  logout: async (): Promise<void> => {
    return api.post('/auth/logout');
  },

  // Check if user is authenticated
  checkAuth: async (): Promise<{ authenticated: boolean; user?: User }> => {
    try {
      const user = await authService.getCurrentUser();
      return { authenticated: true, user };
    } catch {
      return { authenticated: false };
    }
  },
};