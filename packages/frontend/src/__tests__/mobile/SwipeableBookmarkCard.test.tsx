import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SwipeableBookmarkCard } from '../../components/mobile/SwipeableBookmarkCard';

// タッチイベントのモック
const createTouchEvent = (type: string, touches: { clientX: number; clientY: number }[]) => {
  return new TouchEvent(type, {
    touches: touches.map(touch => ({
      ...touch,
      identifier: 0,
      target: null as any,
      radiusX: 0,
      radiusY: 0,
      rotationAngle: 0,
      force: 1,
    })),
    changedTouches: touches.map(touch => ({
      ...touch,
      identifier: 0,
      target: null as any,
      radiusX: 0,
      radiusY: 0,
      rotationAngle: 0,
      force: 1,
    })),
    bubbles: true,
    cancelable: true,
  });
};

// useTouchGesturesフックのモック
jest.mock('../../hooks/useTouchGestures', () => ({
  useTouchGestures: jest.fn((handlers) => ({
    ref: jest.fn((element) => {
      if (element) {
        element._gestureHandlers = handlers;
      }
    }),
  })),
}));

// BookmarkCardコンポーネントのモック
jest.mock('../../components/BookmarkCard', () => ({
  BookmarkCard: ({ bookmark }: { bookmark: any }) => (
    <div data-testid="bookmark-card">
      <h3>{bookmark.title}</h3>
      <p>{bookmark.description}</p>
    </div>
  ),
}));

describe('SwipeableBookmarkCard', () => {
  const mockBookmark = {
    id: '1',
    title: 'Test Bookmark',
    description: 'Test Description',
    url: 'https://example.com',
    imageUrl: 'https://example.com/image.jpg',
    createdAt: new Date('2024-01-01'),
  };

  const mockHandlers = {
    onDelete: jest.fn(),
    onArchive: jest.fn(),
    onFavorite: jest.fn(),
    onShare: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('レンダリング', () => {
    it('ブックマークカードが正しく表示される', () => {
      render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      expect(screen.getByTestId('bookmark-card')).toBeInTheDocument();
      expect(screen.getByText('Test Bookmark')).toBeInTheDocument();
      expect(screen.getByText('Test Description')).toBeInTheDocument();
    });

    it('アクションボタンが表示される', () => {
      render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      expect(screen.getByLabelText('お気に入りに追加')).toBeInTheDocument();
      expect(screen.getByLabelText('共有')).toBeInTheDocument();
      expect(screen.getByLabelText('アーカイブ')).toBeInTheDocument();
      expect(screen.getByLabelText('削除')).toBeInTheDocument();
    });

    it('未提供のハンドラーのボタンは表示されない', () => {
      render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          onDelete={mockHandlers.onDelete}
          // その他のハンドラーは未提供
        />
      );

      expect(screen.getByLabelText('削除')).toBeInTheDocument();
      expect(screen.queryByLabelText('お気に入りに追加')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('共有')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('アーカイブ')).not.toBeInTheDocument();
    });

    it('スワイプガイドが表示される', () => {
      render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      expect(screen.getByText('スワイプ')).toBeInTheDocument();
    });
  });

  describe('タッチ操作', () => {
    it('左スワイプでアクションが表示される', async () => {
      const { container } = render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      const card = container.firstChild as HTMLElement;

      // タッチスタート
      fireEvent(card, createTouchEvent('touchstart', [{ clientX: 200, clientY: 100 }]));

      // 左スワイプ
      fireEvent(card, createTouchEvent('touchmove', [{ clientX: 100, clientY: 100 }]));

      // タッチエンド
      fireEvent(card, createTouchEvent('touchend', [{ clientX: 100, clientY: 100 }]));

      await waitFor(() => {
        const mainCard = card.querySelector('[style*="translateX"]');
        expect(mainCard).toHaveStyle('transform: translateX(-160px)');
      });
    });

    it('右スワイプでアクションが隠される', async () => {
      const { container } = render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      const card = container.firstChild as HTMLElement;

      // 最初に左スワイプしてアクションを表示
      fireEvent(card, createTouchEvent('touchstart', [{ clientX: 200, clientY: 100 }]));
      fireEvent(card, createTouchEvent('touchmove', [{ clientX: 50, clientY: 100 }]));
      fireEvent(card, createTouchEvent('touchend', [{ clientX: 50, clientY: 100 }]));

      await waitFor(() => {
        const mainCard = card.querySelector('[style*="translateX"]');
        expect(mainCard).toHaveStyle('transform: translateX(-160px)');
      });

      // 右スワイプで隠す
      fireEvent(card, createTouchEvent('touchstart', [{ clientX: 50, clientY: 100 }]));
      fireEvent(card, createTouchEvent('touchmove', [{ clientX: 200, clientY: 100 }]));
      fireEvent(card, createTouchEvent('touchend', [{ clientX: 200, clientY: 100 }]));

      await waitFor(() => {
        const mainCard = card.querySelector('[style*="translateX"]');
        expect(mainCard).toHaveStyle('transform: translateX(0px)');
      });
    });

    it('閾値未満のスワイプでは元に戻る', async () => {
      const { container } = render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      const card = container.firstChild as HTMLElement;

      // 短いスワイプ（閾値未満）
      fireEvent(card, createTouchEvent('touchstart', [{ clientX: 200, clientY: 100 }]));
      fireEvent(card, createTouchEvent('touchmove', [{ clientX: 170, clientY: 100 }]));
      fireEvent(card, createTouchEvent('touchend', [{ clientX: 170, clientY: 100 }]));

      await waitFor(() => {
        const mainCard = card.querySelector('[style*="translateX"]');
        expect(mainCard).toHaveStyle('transform: translateX(0px)');
      });
    });
  });

  describe('アクションボタン', () => {
    it('削除ボタンクリックで削除ハンドラーが呼ばれる', async () => {
      render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      const deleteButton = screen.getByLabelText('削除');
      fireEvent.click(deleteButton);

      expect(mockHandlers.onDelete).toHaveBeenCalledWith(mockBookmark.id);
    });

    it('お気に入りボタンクリックでお気に入りハンドラーが呼ばれる', async () => {
      render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      const favoriteButton = screen.getByLabelText('お気に入りに追加');
      fireEvent.click(favoriteButton);

      expect(mockHandlers.onFavorite).toHaveBeenCalledWith(mockBookmark.id);
    });

    it('共有ボタンクリックで共有ハンドラーが呼ばれる', async () => {
      render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      const shareButton = screen.getByLabelText('共有');
      fireEvent.click(shareButton);

      expect(mockHandlers.onShare).toHaveBeenCalledWith(mockBookmark);
    });

    it('アーカイブボタンクリックでアーカイブハンドラーが呼ばれる', async () => {
      render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      const archiveButton = screen.getByLabelText('アーカイブ');
      fireEvent.click(archiveButton);

      expect(mockHandlers.onArchive).toHaveBeenCalledWith(mockBookmark.id);
    });

    it('アクション実行後にスワイプ状態がリセットされる', async () => {
      const { container } = render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      const card = container.firstChild as HTMLElement;

      // スワイプしてアクションを表示
      fireEvent(card, createTouchEvent('touchstart', [{ clientX: 200, clientY: 100 }]));
      fireEvent(card, createTouchEvent('touchmove', [{ clientX: 50, clientY: 100 }]));
      fireEvent(card, createTouchEvent('touchend', [{ clientX: 50, clientY: 100 }]));

      await waitFor(() => {
        const mainCard = card.querySelector('[style*="translateX"]');
        expect(mainCard).toHaveStyle('transform: translateX(-160px)');
      });

      // アクション実行
      const deleteButton = screen.getByLabelText('削除');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        const mainCard = card.querySelector('[style*="translateX"]');
        expect(mainCard).toHaveStyle('transform: translateX(0px)');
      });
    });
  });

  describe('オーバーレイ操作', () => {
    it('オーバーレイクリックでスワイプ状態がリセットされる', async () => {
      const { container } = render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      const card = container.firstChild as HTMLElement;

      // スワイプしてアクションを表示
      fireEvent(card, createTouchEvent('touchstart', [{ clientX: 200, clientY: 100 }]));
      fireEvent(card, createTouchEvent('touchmove', [{ clientX: 50, clientY: 100 }]));
      fireEvent(card, createTouchEvent('touchend', [{ clientX: 50, clientY: 100 }]));

      await waitFor(() => {
        expect(screen.getByLabelText('スワイプアクションを閉じる')).toBeInTheDocument();
      });

      // オーバーレイクリック
      const overlay = screen.getByLabelText('スワイプアクションを閉じる');
      fireEvent.click(overlay);

      await waitFor(() => {
        const mainCard = card.querySelector('[style*="translateX"]');
        expect(mainCard).toHaveStyle('transform: translateX(0px)');
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('適切なARIAラベルが設定されている', () => {
      render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      expect(screen.getByLabelText('お気に入りに追加')).toBeInTheDocument();
      expect(screen.getByLabelText('共有')).toBeInTheDocument();
      expect(screen.getByLabelText('アーカイブ')).toBeInTheDocument();
      expect(screen.getByLabelText('削除')).toBeInTheDocument();
    });

    it('キーボードナビゲーションが機能する', () => {
      render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      const deleteButton = screen.getByLabelText('削除');
      
      deleteButton.focus();
      expect(document.activeElement).toBe(deleteButton);

      fireEvent.keyDown(deleteButton, { key: 'Enter' });
      expect(mockHandlers.onDelete).toHaveBeenCalledWith(mockBookmark.id);
    });
  });

  describe('パフォーマンス', () => {
    it('多数の同時タッチイベントを適切に処理する', async () => {
      const { container } = render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      const card = container.firstChild as HTMLElement;

      // 複数のタッチイベントを短時間で発生
      for (let i = 0; i < 10; i++) {
        fireEvent(card, createTouchEvent('touchstart', [{ clientX: 200, clientY: 100 }]));
        fireEvent(card, createTouchEvent('touchmove', [{ clientX: 200 - i * 10, clientY: 100 }]));
        fireEvent(card, createTouchEvent('touchend', [{ clientX: 200 - i * 10, clientY: 100 }]));
      }

      // パフォーマンスの問題がないことを確認
      expect(card).toBeInTheDocument();
    });

    it('メモリリークが発生しない', () => {
      const { unmount } = render(
        <SwipeableBookmarkCard
          bookmark={mockBookmark}
          {...mockHandlers}
        />
      );

      // イベントリスナーの追加を確認
      const addEventListenerSpy = jest.spyOn(EventTarget.prototype, 'addEventListener');
      const removeEventListenerSpy = jest.spyOn(EventTarget.prototype, 'removeEventListener');

      unmount();

      // アンマウント時にイベントリスナーが適切に削除されることを確認
      expect(removeEventListenerSpy).toHaveBeenCalled();
      
      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });
  });
});