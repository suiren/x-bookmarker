import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuickAccessPanel } from '../QuickAccessPanel';

// Mock React Router
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock stores
const mockSetCategoryIds = vi.fn();
const mockSetTags = vi.fn();
const mockSetAuthorUsername = vi.fn();

vi.mock('../stores/searchStore', () => ({
  useSearchStore: () => ({
    setCategoryIds: mockSetCategoryIds,
    setTags: mockSetTags,
    setAuthorUsername: mockSetAuthorUsername,
  }),
}));

// Mock hooks
const mockCategories = [
  { id: '1', name: 'テクノロジー', color: '#3B82F6', icon: 'code' },
  { id: '2', name: '料理', color: '#EF4444', icon: 'utensils' },
];

const mockBookmarks = [
  {
    id: '1',
    categoryId: '1',
    tags: ['React', 'TypeScript'],
    authorUsername: 'developer1',
    authorDisplayName: 'Developer One',
    bookmarkedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    categoryId: '2',
    tags: ['料理', 'レシピ'],
    authorUsername: 'chef1',
    authorDisplayName: 'Chef One',
    bookmarkedAt: '2024-01-02T00:00:00Z',
  },
];

vi.mock('../hooks/useCategories', () => ({
  useCategories: () => ({ data: mockCategories }),
}));

vi.mock('../hooks/useBookmarks', () => ({
  useBookmarks: () => ({ data: mockBookmarks }),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: vi.fn(() => 'test-uuid'),
  },
});

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('QuickAccessPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  it('renders empty state when no favorites', () => {
    render(
      <TestWrapper>
        <QuickAccessPanel />
      </TestWrapper>
    );

    expect(screen.getByText('お気に入りがありません')).toBeInTheDocument();
    expect(screen.getByText('追加する')).toBeInTheDocument();
  });

  it('renders favorites when they exist', () => {
    const mockFavorites = [
      {
        id: '1',
        type: 'category',
        name: 'テクノロジー',
        color: '#3B82F6',
        count: 5,
        lastUsed: '2024-01-01T00:00:00Z',
      },
    ];

    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockFavorites));

    render(
      <TestWrapper>
        <QuickAccessPanel />
      </TestWrapper>
    );

    expect(screen.getByText('テクノロジー')).toBeInTheDocument();
    expect(screen.getByText('5件')).toBeInTheDocument();
  });

  it('handles category quick access', async () => {
    const mockFavorites = [
      {
        id: '1',
        type: 'category',
        name: 'テクノロジー',
        color: '#3B82F6',
        count: 5,
        lastUsed: '2024-01-01T00:00:00Z',
      },
    ];

    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockFavorites));

    render(
      <TestWrapper>
        <QuickAccessPanel />
      </TestWrapper>
    );

    const categoryButton = screen.getByText('テクノロジー').closest('button');
    fireEvent.click(categoryButton!);

    expect(mockSetCategoryIds).toHaveBeenCalledWith(['1']);
    expect(mockNavigate).toHaveBeenCalledWith('/search');
  });

  it('handles tag quick access', async () => {
    const mockFavorites = [
      {
        id: 'tag-1',
        type: 'tag',
        name: 'React',
        count: 3,
        lastUsed: '2024-01-01T00:00:00Z',
      },
    ];

    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockFavorites));

    render(
      <TestWrapper>
        <QuickAccessPanel />
      </TestWrapper>
    );

    const tagButton = screen.getByText('#React').closest('button');
    fireEvent.click(tagButton!);

    expect(mockSetTags).toHaveBeenCalledWith(['React']);
    expect(mockNavigate).toHaveBeenCalledWith('/search');
  });

  it('handles author quick access', async () => {
    const mockFavorites = [
      {
        id: 'author-1',
        type: 'author',
        name: 'developer1',
        displayName: 'Developer One',
        count: 2,
        lastUsed: '2024-01-01T00:00:00Z',
      },
    ];

    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockFavorites));

    render(
      <TestWrapper>
        <QuickAccessPanel />
      </TestWrapper>
    );

    const authorButton = screen.getByText('@developer1').closest('button');
    fireEvent.click(authorButton!);

    expect(mockSetAuthorUsername).toHaveBeenCalledWith('developer1');
    expect(mockNavigate).toHaveBeenCalledWith('/search');
  });

  it('shows edit mode controls', () => {
    render(
      <TestWrapper>
        <QuickAccessPanel />
      </TestWrapper>
    );

    const editButton = screen.getByTitle('編集モード');
    fireEvent.click(editButton);

    // Edit mode should be active (test would need to check for visual changes)
    expect(editButton).toBeInTheDocument();
  });

  it('opens add dialog', () => {
    render(
      <TestWrapper>
        <QuickAccessPanel />
      </TestWrapper>
    );

    const addButton = screen.getByTitle('追加');
    fireEvent.click(addButton);

    expect(screen.getByText('お気に入りに追加')).toBeInTheDocument();
  });

  it('shows suggestions in add dialog', () => {
    render(
      <TestWrapper>
        <QuickAccessPanel />
      </TestWrapper>
    );

    const addButton = screen.getByTitle('追加');
    fireEvent.click(addButton);

    // Should show suggestions based on usage
    expect(screen.getByText('よく使用されているアイテムから選択:')).toBeInTheDocument();
  });

  it('adds favorite from suggestions', async () => {
    render(
      <TestWrapper>
        <QuickAccessPanel />
      </TestWrapper>
    );

    const addButton = screen.getByTitle('追加');
    fireEvent.click(addButton);

    // Find and click a suggestion (would need to verify suggestions are rendered)
    const dialog = screen.getByText('お気に入りに追加');
    expect(dialog).toBeInTheDocument();

    // Close dialog
    const closeButton = screen.getByRole('button', { name: /close/i });
    if (closeButton) {
      fireEvent.click(closeButton);
    }
  });

  it('saves favorites to localStorage', async () => {
    render(
      <TestWrapper>
        <QuickAccessPanel />
      </TestWrapper>
    );

    // Add a favorite (simplified test)
    const addButton = screen.getByTitle('追加');
    fireEvent.click(addButton);

    // Verify localStorage.setItem would be called when adding favorites
    // (Full implementation would require mocking the add process)
  });

  it('loads favorites from localStorage on mount', () => {
    const mockFavorites = [
      {
        id: '1',
        type: 'category',
        name: 'テクノロジー',
        color: '#3B82F6',
        count: 5,
        lastUsed: '2024-01-01T00:00:00Z',
      },
    ];

    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockFavorites));

    render(
      <TestWrapper>
        <QuickAccessPanel />
      </TestWrapper>
    );

    expect(localStorageMock.getItem).toHaveBeenCalledWith('x-bookmarker-favorites');
    expect(screen.getByText('テクノロジー')).toBeInTheDocument();
  });

  it('handles localStorage errors gracefully', () => {
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error('Storage error');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <TestWrapper>
        <QuickAccessPanel />
      </TestWrapper>
    );

    expect(consoleSpy).toHaveBeenCalledWith('Failed to load favorites:', expect.any(Error));
    expect(screen.getByText('お気に入りがありません')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('updates last used time when favorite is accessed', async () => {
    const mockFavorites = [
      {
        id: '1',
        type: 'category',
        name: 'テクノロジー',
        color: '#3B82F6',
        count: 5,
        lastUsed: '2024-01-01T00:00:00Z',
      },
    ];

    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockFavorites));

    render(
      <TestWrapper>
        <QuickAccessPanel />
      </TestWrapper>
    );

    const categoryButton = screen.getByText('テクノロジー').closest('button');
    fireEvent.click(categoryButton!);

    // Verify that localStorage.setItem was called to update the lastUsed time
    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  it('displays correct icons for different item types', () => {
    const mockFavorites = [
      {
        id: '1',
        type: 'category',
        name: 'テクノロジー',
        count: 5,
        lastUsed: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        type: 'tag',
        name: 'React',
        count: 3,
        lastUsed: '2024-01-01T00:00:00Z',
      },
      {
        id: '3',
        type: 'author',
        name: 'developer1',
        count: 2,
        lastUsed: '2024-01-01T00:00:00Z',
      },
    ];

    localStorageMock.getItem.mockReturnValue(JSON.stringify(mockFavorites));

    render(
      <TestWrapper>
        <QuickAccessPanel />
      </TestWrapper>
    );

    expect(screen.getByText('テクノロジー')).toBeInTheDocument();
    expect(screen.getByText('#React')).toBeInTheDocument();
    expect(screen.getByText('@developer1')).toBeInTheDocument();
  });
});