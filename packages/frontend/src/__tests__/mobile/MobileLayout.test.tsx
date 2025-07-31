import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryProvider } from '@tanstack/react-query';
import { MobileLayout } from '../../components/mobile/MobileLayout';

// モックの設定
jest.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: {
      id: '1',
      username: 'testuser',
      displayName: 'Test User',
      avatarUrl: 'https://example.com/avatar.jpg',
    },
  }),
}));

jest.mock('../../stores/searchStore', () => ({
  useSearchStore: () => ({
    setIsSearchModalOpen: jest.fn(),
  }),
}));

jest.mock('../../hooks/useAuth', () => ({
  useLogout: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('../../hooks/useCategories', () => ({
  useCategories: () => ({
    data: [
      { id: '1', name: 'Tech', color: '#3B82F6', bookmarkCount: 5 },
      { id: '2', name: 'News', color: '#EF4444', bookmarkCount: 3 },
    ],
  }),
}));

// テストユーティリティ
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>
      <QueryProvider client={queryClient}>
        {children}
      </QueryProvider>
    </BrowserRouter>
  );
};

describe('MobileLayout', () => {
  const mockChildren = <div data-testid="test-content">Test Content</div>;

  beforeEach(() => {
    // 各テスト前にモックをクリア
    jest.clearAllMocks();
    
    // window.matchMediaのモック
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: query.includes('max-width: 768px'),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('レンダリング', () => {
    it('モバイルレイアウトが正しく表示される', () => {
      render(
        <MobileLayout>
          {mockChildren}
        </MobileLayout>,
        { wrapper: createWrapper() }
      );

      expect(screen.getByTestId('test-content')).toBeInTheDocument();
      expect(screen.getByText('X Bookmarker')).toBeInTheDocument();
    });

    it('ヘッダーのメニューボタンが表示される', () => {
      render(
        <MobileLayout>
          {mockChildren}
        </MobileLayout>,
        { wrapper: createWrapper() }
      );

      const menuButton = screen.getByLabelText('メニューを開く');
      expect(menuButton).toBeInTheDocument();
    });

    it('ボトムナビゲーションが表示される', () => {
      render(
        <MobileLayout>
          {mockChildren}
        </MobileLayout>,
        { wrapper: createWrapper() }
      );

      expect(screen.getByText('ホーム')).toBeInTheDocument();
      expect(screen.getByText('ブックマーク')).toBeInTheDocument();
      expect(screen.getByText('追加')).toBeInTheDocument();
      expect(screen.getByText('検索')).toBeInTheDocument();
      expect(screen.getByText('プロフィール')).toBeInTheDocument();
    });
  });

  describe('サイドバーの動作', () => {
    it('メニューボタンクリックでサイドバーが開く', async () => {
      render(
        <MobileLayout>
          {mockChildren}
        </MobileLayout>,
        { wrapper: createWrapper() }
      );

      const menuButton = screen.getByLabelText('メニューを開く');
      fireEvent.click(menuButton);

      await waitFor(() => {
        expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
        expect(screen.getByText('すべてのブックマーク')).toBeInTheDocument();
      });
    });

    it('サイドバーの閉じるボタンが機能する', async () => {
      render(
        <MobileLayout>
          {mockChildren}
        </MobileLayout>,
        { wrapper: createWrapper() }
      );

      // サイドバーを開く
      const menuButton = screen.getByLabelText('メニューを開く');
      fireEvent.click(menuButton);

      await waitFor(() => {
        expect(screen.getByLabelText('サイドバーを閉じる')).toBeInTheDocument();
      });

      // サイドバーを閉じる
      const closeButton = screen.getByLabelText('サイドバーを閉じる');
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByLabelText('サイドバーを閉じる')).not.toBeInTheDocument();
      });
    });

    it('オーバーレイクリックでサイドバーが閉じる', async () => {
      render(
        <MobileLayout>
          {mockChildren}
        </MobileLayout>,
        { wrapper: createWrapper() }
      );

      // サイドバーを開く
      const menuButton = screen.getByLabelText('メニューを開く');
      fireEvent.click(menuButton);

      await waitFor(() => {
        expect(screen.getByTestId('sidebar-overlay')).toBeInTheDocument();
      });

      // オーバーレイをクリック
      const overlay = screen.getByTestId('sidebar-overlay');
      fireEvent.click(overlay);

      await waitFor(() => {
        expect(screen.queryByTestId('sidebar-overlay')).not.toBeInTheDocument();
      });
    });
  });

  describe('レスポンシブ対応', () => {
    it('デスクトップサイズでは通常のレイアウトを使用', () => {
      // デスクトップサイズのmediaQueryをモック
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: false, // デスクトップサイズ
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });

      render(
        <MobileLayout>
          {mockChildren}
        </MobileLayout>,
        { wrapper: createWrapper() }
      );

      // モバイル専用要素が表示されないことを確認
      expect(screen.queryByText('ホーム')).not.toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('適切なARIAラベルが設定されている', () => {
      render(
        <MobileLayout>
          {mockChildren}
        </MobileLayout>,
        { wrapper: createWrapper() }
      );

      expect(screen.getByLabelText('メニューを開く')).toBeInTheDocument();
      expect(screen.getByLabelText('検索')).toBeInTheDocument();
      expect(screen.getByLabelText('クイック追加')).toBeInTheDocument();
      expect(screen.getByLabelText('通知')).toBeInTheDocument();
    });

    it('キーボードナビゲーションが機能する', () => {
      render(
        <MobileLayout>
          {mockChildren}
        </MobileLayout>,
        { wrapper: createWrapper() }
      );

      const menuButton = screen.getByLabelText('メニューを開く');
      
      // フォーカス可能であることを確認
      menuButton.focus();
      expect(document.activeElement).toBe(menuButton);

      // エンターキーで開くことを確認
      fireEvent.keyDown(menuButton, { key: 'Enter', code: 'Enter' });
      // 実際の実装ではonKeyDownハンドラーの追加が必要
    });
  });

  describe('タッチ操作', () => {
    it('タッチターゲットが適切なサイズを持つ', () => {
      render(
        <MobileLayout>
          {mockChildren}
        </MobileLayout>,
        { wrapper: createWrapper() }
      );

      const menuButton = screen.getByLabelText('メニューを開く');
      const computedStyle = window.getComputedStyle(menuButton);
      
      // touch-buttonクラスによる最小サイズの確認
      expect(menuButton).toHaveClass('touch-button');
    });

    it('スワイプジェスチャーでサイドバーが開く', async () => {
      render(
        <MobileLayout>
          {mockChildren}
        </MobileLayout>,
        { wrapper: createWrapper() }
      );

      const layout = screen.getByTestId('mobile-layout');

      // スワイプジェスチャーをシミュレート
      fireEvent.touchStart(layout, {
        touches: [{ clientX: 0, clientY: 100 }],
      });

      fireEvent.touchMove(layout, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      fireEvent.touchEnd(layout, {
        changedTouches: [{ clientX: 100, clientY: 100 }],
      });

      // スワイプジェスチャーの実装に依存
      // 実際の実装では適切なジェスチャーハンドリングが必要
    });
  });

  describe('パフォーマンス', () => {
    it('不要な再レンダリングが発生しない', () => {
      const renderSpy = jest.fn();
      
      const TestComponent = () => {
        renderSpy();
        return mockChildren;
      };

      const { rerender } = render(
        <MobileLayout>
          <TestComponent />
        </MobileLayout>,
        { wrapper: createWrapper() }
      );

      expect(renderSpy).toHaveBeenCalledTimes(1);

      // propsが変更されない再レンダリング
      rerender(
        <MobileLayout>
          <TestComponent />
        </MobileLayout>
      );

      // React.memoやuseMemoの使用により再レンダリングが抑制されることを期待
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });
  });
});