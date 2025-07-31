import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useKeyboardShortcuts, useGlobalKeyboardShortcuts } from '../useKeyboardShortcuts';

// Mock React Router
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock stores
const mockSetIsSearchModalOpen = vi.fn();
const mockUser = { id: '1', username: 'testuser' };

vi.mock('../stores/searchStore', () => ({
  useSearchStore: () => ({
    setIsSearchModalOpen: mockSetIsSearchModalOpen,
  }),
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: () => ({
    user: mockUser,
  }),
}));

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any existing event listeners
    document.removeEventListener('keydown', () => {});
  });

  it('should register keyboard shortcuts', () => {
    const mockAction = vi.fn();
    const shortcuts = [
      {
        key: 'k',
        ctrlKey: true,
        description: 'Test shortcut',
        action: mockAction,
      },
    ];

    const { result } = renderHook(() =>
      useKeyboardShortcuts({ shortcuts, enabled: true })
    );

    expect(result.current.shortcuts).toHaveLength(1);
    expect(result.current.shortcuts[0].key).toBe('k');
  });

  it('should execute shortcut action when key combination is pressed', () => {
    const mockAction = vi.fn();
    const shortcuts = [
      {
        key: 'k',
        ctrlKey: true,
        description: 'Test shortcut',
        action: mockAction,
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: true }));

    // Simulate Ctrl+K keypress
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);
    });

    expect(mockAction).toHaveBeenCalledTimes(1);
  });

  it('should not execute shortcut when disabled', () => {
    const mockAction = vi.fn();
    const shortcuts = [
      {
        key: 'k',
        ctrlKey: true,
        description: 'Test shortcut',
        action: mockAction,
        disabled: true,
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: true }));

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);
    });

    expect(mockAction).not.toHaveBeenCalled();
  });

  it('should not execute shortcut when hook is disabled', () => {
    const mockAction = vi.fn();
    const shortcuts = [
      {
        key: 'k',
        ctrlKey: true,
        description: 'Test shortcut',
        action: mockAction,
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: false }));

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);
    });

    expect(mockAction).not.toHaveBeenCalled();
  });

  it('should not execute shortcut when target is input field', () => {
    const mockAction = vi.fn();
    const shortcuts = [
      {
        key: 'k',
        ctrlKey: true,
        description: 'Test shortcut',
        action: mockAction,
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: true }));

    // Create a fake input element
    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: input });
      document.dispatchEvent(event);
    });

    expect(mockAction).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('should handle multiple modifier keys', () => {
    const mockAction = vi.fn();
    const shortcuts = [
      {
        key: 'k',
        ctrlKey: true,
        shiftKey: true,
        description: 'Test shortcut',
        action: mockAction,
      },
    ];

    renderHook(() => useKeyboardShortcuts({ shortcuts, enabled: true }));

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);
    });

    expect(mockAction).toHaveBeenCalledTimes(1);
  });
});

describe('useGlobalKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.removeEventListener('keydown', () => {});
  });

  it('should register global shortcuts', () => {
    const { result } = renderHook(() => useGlobalKeyboardShortcuts());

    expect(result.current.shortcuts.length).toBeGreaterThan(0);
    
    // Check for some expected shortcuts
    const searchShortcut = result.current.shortcuts.find(s => s.key === '/');
    expect(searchShortcut).toBeDefined();
    expect(searchShortcut?.description).toContain('検索');
  });

  it('should handle search modal shortcut', () => {
    renderHook(() => useGlobalKeyboardShortcuts());

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: '/',
        bubbles: true,
      });
      document.dispatchEvent(event);
    });

    expect(mockSetIsSearchModalOpen).toHaveBeenCalledWith(true);
  });

  it('should handle navigation shortcuts', () => {
    renderHook(() => useGlobalKeyboardShortcuts());

    // Test home navigation
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'h',
        bubbles: true,
      });
      document.dispatchEvent(event);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');

    // Test bookmarks navigation
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'b',
        bubbles: true,
      });
      document.dispatchEvent(event);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/bookmarks');
  });

  it('should handle Ctrl+S shortcut', () => {
    renderHook(() => useGlobalKeyboardShortcuts());

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/search');
  });

  it('should disable certain shortcuts when user is not authenticated', () => {
    // Mock unauthenticated user
    vi.mocked(vi.importActual('../stores/authStore')).useAuthStore = () => ({
      user: null,
    });

    const { result } = renderHook(() => useGlobalKeyboardShortcuts());

    // Find shortcuts that should be disabled
    const bookmarkShortcut = result.current.shortcuts.find(s => s.key === 'b');
    expect(bookmarkShortcut?.disabled).toBe(true);
  });

  it('should cleanup event listeners on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    
    const { unmount } = renderHook(() => useGlobalKeyboardShortcuts());
    
    unmount();
    
    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});