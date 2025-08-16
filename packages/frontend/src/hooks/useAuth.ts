import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { authService } from '../services/authService';
import type { User } from '../types';

// Query keys
export const authKeys = {
  all: ['auth'] as const,
  user: () => [...authKeys.all, 'user'] as const,
  check: () => [...authKeys.all, 'check'] as const,
};

// Check authentication status
export const useAuthCheck = () => {
  const { login, logout } = useAuthStore();

  return useQuery({
    queryKey: authKeys.check(),
    queryFn: async () => {
      const result = await authService.checkAuth();
      if (result.authenticated && result.user) {
        // Auto-login if valid token exists
        login(result.user, useAuthStore.getState().token || '');
      } else {
        logout();
      }
      return result;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry auth checks
  });
};

// Get current user
export const useCurrentUser = () => {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: authKeys.user(),
    queryFn: () => authService.getCurrentUser(),
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
  });
};

// Handle OAuth callback
export const useOAuthCallback = () => {
  const { login } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ code, state }: { code: string; state?: string }) =>
      authService.handleOAuthCallback(code, state),
    onSuccess: (response) => {
      // Login user with received token and user data
      login(response.user, response.token);
      
      // Update user cache
      queryClient.setQueryData(authKeys.user(), response.user);
      
      // Mark as authenticated
      queryClient.setQueryData(authKeys.check(), {
        authenticated: true,
        user: response.user,
      });
    },
  });
};

// Update user settings
export const useUpdateUserSettings = () => {
  const { updateSettings } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Partial<User['settings']>) =>
      authService.updateUserSettings(settings),
    onSuccess: (updatedUser) => {
      // Update auth store
      updateSettings(updatedUser.settings);
      
      // Update user cache
      queryClient.setQueryData(authKeys.user(), updatedUser);
    },
  });
};

// Logout mutation
export const useLogout = () => {
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authService.logout(),
    onSettled: () => {
      // Always logout from store and clear cache, regardless of API response
      logout();
      
      // Clear all cached data
      queryClient.clear();
      
      // Redirect to login
      window.location.href = '/login';
    },
  });
};

// Refresh token mutation
export const useRefreshToken = () => {
  const { login } = useAuthStore();

  return useMutation({
    mutationFn: (refreshToken: string) => authService.refreshToken(refreshToken),
    onSuccess: (response) => {
      // Update tokens in store
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        login(currentUser, response.token);
      }
    },
  });
};

// Hook to handle authentication state
export const useAuthState = () => {
  const { isAuthenticated, user, token } = useAuthStore();
  const { data: authCheck, isLoading: isCheckingAuth } = useAuthCheck();

  return {
    isAuthenticated,
    user,
    token,
    isCheckingAuth,
    authCheck,
  };
};

// Main useAuth hook for common authentication operations
export const useAuth = () => {
  const { isAuthenticated, user, token } = useAuthStore();
  const { data: authCheck, isLoading: isCheckingAuth } = useAuthCheck();
  const logoutMutation = useLogout();

  return {
    isAuthenticated,
    user,
    token,
    isCheckingAuth,
    authCheck,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
};