/**
 * テスト用ヘルパー関数とコンポーネント
 */

import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { createTestQueryClient } from './setup';

// テスト用プロバイダー
interface TestProvidersProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
}

export const TestProviders: React.FC<TestProvidersProps> = ({ 
  children, 
  queryClient = createTestQueryClient() 
}) => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

// カスタムレンダー関数
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
}

export const renderWithProviders = (
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) => {
  const { queryClient, ...renderOptions } = options;

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <TestProviders queryClient={queryClient}>
      {children}
    </TestProviders>
  );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

// モックデータファクトリー
export const createMockBookmark = (overrides = {}) => ({
  id: 'bookmark-1',
  xTweetId: '1234567890',
  content: 'テストブックマークの内容です',
  authorUsername: 'testuser',
  authorDisplayName: 'Test User',
  authorAvatarUrl: 'https://example.com/avatar.jpg',
  mediaUrls: [],
  links: ['https://example.com'],
  hashtags: ['test', 'bookmark'],
  mentions: [],
  categoryId: 'category-1',
  tags: ['テスト', 'サンプル'],
  isArchived: false,
  bookmarkedAt: '2024-01-15T10:30:00Z',
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T10:30:00Z',
  ...overrides,
});

export const createMockCategory = (overrides = {}) => ({
  id: 'category-1',
  name: 'テストカテゴリ',
  description: 'テスト用のカテゴリです',
  color: '#3B82F6',
  icon: 'folder',
  parentId: undefined,
  order: 1,
  isDefault: false,
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T10:30:00Z',
  ...overrides,
});

export const createMockTag = (overrides = {}) => ({
  id: 'tag-1',
  name: 'テストタグ',
  color: '#10B981',
  usageCount: 5,
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T10:30:00Z',
  ...overrides,
});

export const createMockUser = (overrides = {}) => ({
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  avatarUrl: 'https://example.com/avatar.jpg',
  settings: {
    theme: 'light' as const,
    viewMode: 'grid' as const,
    defaultCategory: undefined,
    autoSync: true,
    aiSuggestions: true,
  },
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T10:30:00Z',
  ...overrides,
});

// API レスポンスモック
export const createMockApiResponse = <T,>(data: T, overrides = {}) => ({
  success: true,
  data,
  message: 'Success',
  ...overrides,
});

export const createMockApiError = (message = 'エラーが発生しました', code = 'UNKNOWN_ERROR') => ({
  success: false,
  error: message,
  code,
});

// イベントハンドラーモック
export const createMockHandlers = () => ({
  onClick: vi.fn(),
  onChange: vi.fn(),
  onSubmit: vi.fn(),
  onClose: vi.fn(),
  onSelect: vi.fn(),
  onDelete: vi.fn(),
  onUpdate: vi.fn(),
});

// ストアの初期状態モック
export const createMockBookmarkStore = (overrides = {}) => ({
  bookmarks: [createMockBookmark()],
  categories: [createMockCategory()],
  selectedBookmarks: [],
  viewMode: 'grid' as const,
  filterCategory: undefined,
  searchQuery: '',
  sortBy: 'date' as const,
  sortOrder: 'desc' as const,
  currentPage: 1,
  totalPages: 1,
  totalItems: 1,
  itemsPerPage: 20,
  isLoading: false,
  error: undefined,
  ...overrides,
});

// ユーティリティ関数
export const waitForLoadingToFinish = () => 
  new Promise(resolve => setTimeout(resolve, 0));

export * from '@testing-library/react';
export * from '@testing-library/user-event';
export { vi } from 'vitest';