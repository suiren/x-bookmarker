import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  settings: {
    theme: 'light' | 'dark' | 'system';
    viewMode: 'grid' | 'list';
    defaultCategory?: string;
    autoSync: boolean;
    aiSuggestions: boolean;
  };
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  
  // Actions
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  updateSettings: (settings: Partial<User['settings']>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      token: null,

      login: (user, token) => {
        set({
          user,
          token,
          isAuthenticated: true,
        });
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },

      updateUser: (updates) => {
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: {
              ...currentUser,
              ...updates,
            },
          });
        }
      },

      updateSettings: (settings) => {
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: {
              ...currentUser,
              settings: {
                ...currentUser.settings,
                ...settings,
              },
            },
          });
        }
      },
    }),
    {
      name: 'x-bookmarker-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);