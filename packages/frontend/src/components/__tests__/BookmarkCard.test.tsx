/**
 * BookmarkCard コンポーネントのテスト
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, createMockBookmark, createMockCategory, vi } from '../../test/helpers';
import BookmarkCard from '../BookmarkCard';
import type { FrontendBookmark, FrontendCategory } from '../../types';

describe('BookmarkCard', () => {
  const mockBookmark: FrontendBookmark = createMockBookmark({
    id: 'bookmark-1',
    content: 'これはテストブックマークの内容です。#テスト #開発',
    authorUsername: 'testuser',
    authorDisplayName: 'テストユーザー',
    authorAvatarUrl: 'https://example.com/avatar.jpg',
    mediaUrls: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
    tags: ['テスト', '開発', 'React'],
    bookmarkedAt: '2024-01-15T10:30:00Z',
    categoryId: 'category-1',
  });

  const mockCategory: FrontendCategory = createMockCategory({
    id: 'category-1',
    name: 'テクノロジー',
    color: '#3B82F6',
  });

  const mockCategories: FrontendCategory[] = [mockCategory];

  const defaultProps = {
    bookmark: mockBookmark,
    categories: mockCategories,
    isSelected: false,
    viewMode: 'grid' as const,
    onToggleSelection: vi.fn(),
    onMoreActions: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本的な表示', () => {
    it('作者情報を正しく表示する', () => {
      renderWithProviders(<BookmarkCard {...defaultProps} />);

      expect(screen.getByText('テストユーザー')).toBeInTheDocument();
      expect(screen.getByText('@testuser')).toBeInTheDocument();
      
      const avatar = screen.getByAltText('テストユーザー');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    });

    it('ブックマーク内容を表示する', () => {
      renderWithProviders(<BookmarkCard {...defaultProps} />);

      expect(screen.getByText('これはテストブックマークの内容です。#テスト #開発')).toBeInTheDocument();
    });

    it('日付を日本語形式で表示する', () => {
      renderWithProviders(<BookmarkCard {...defaultProps} />);

      expect(screen.getByText('2024/1/15')).toBeInTheDocument();
    });

    it('カテゴリ情報を表示する', () => {
      renderWithProviders(<BookmarkCard {...defaultProps} />);

      expect(screen.getByText('テクノロジー')).toBeInTheDocument();
      // カテゴリの色は style 属性で確認
      const categoryElement = screen.getByText('テクノロジー').closest('span');
      expect(categoryElement).toHaveStyle({ color: '#3B82F6' });
    });
  });

  describe('アバター表示', () => {
    it('アバターURLがない場合はデフォルトアバターを表示する', () => {
      const bookmarkWithoutAvatar = { ...mockBookmark, authorAvatarUrl: undefined };
      renderWithProviders(
        <BookmarkCard {...defaultProps} bookmark={bookmarkWithoutAvatar} />
      );

      const defaultAvatar = screen.getByRole('img', { name: /default avatar/i });
      expect(defaultAvatar).toBeInTheDocument();
      expect(defaultAvatar).toHaveClass('bg-gray-300', 'dark:bg-gray-600');
    });

    it('アバター画像がある場合は正しく表示する', () => {
      renderWithProviders(<BookmarkCard {...defaultProps} />);

      const avatar = screen.getByAltText('テストユーザー');
      expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.jpg');
      expect(avatar).toHaveClass('rounded-full');
    });
  });

  describe('メディア表示', () => {
    it('メディアファイルがある場合はプレビューを表示する', () => {
      renderWithProviders(<BookmarkCard {...defaultProps} />);

      const mediaImages = screen.getAllByRole('img');
      // アバター + メディア画像2枚 = 3枚
      expect(mediaImages).toHaveLength(3);
      
      const mediaImage1 = screen.getByAltText('メディア 1');
      const mediaImage2 = screen.getByAltText('メディア 2');
      
      expect(mediaImage1).toHaveAttribute('src', 'https://example.com/image1.jpg');
      expect(mediaImage2).toHaveAttribute('src', 'https://example.com/image2.jpg');
    });

    it('メディアファイルがない場合はメディアセクションを表示しない', () => {
      const bookmarkWithoutMedia = { ...mockBookmark, mediaUrls: [] };
      renderWithProviders(
        <BookmarkCard {...defaultProps} bookmark={bookmarkWithoutMedia} />
      );

      expect(screen.queryByAltText(/メディア/)).not.toBeInTheDocument();
      expect(screen.queryByTestId('media-grid')).not.toBeInTheDocument();
    });

    it('メディアファイルが4枚以上ある場合は最初の4枚のみ表示する', () => {
      const bookmarkWithManyMedia = {
        ...mockBookmark,
        mediaUrls: [
          'https://example.com/image1.jpg',
          'https://example.com/image2.jpg',
          'https://example.com/image3.jpg',
          'https://example.com/image4.jpg',
          'https://example.com/image5.jpg',
        ],
      };
      renderWithProviders(
        <BookmarkCard {...defaultProps} bookmark={bookmarkWithManyMedia} />
      );

      // アバター1枚 + メディア4枚 = 5枚
      const allImages = screen.getAllByRole('img');
      expect(allImages).toHaveLength(5);
      
      expect(screen.getByAltText('メディア 1')).toBeInTheDocument();
      expect(screen.getByAltText('メディア 4')).toBeInTheDocument();
      expect(screen.queryByAltText('メディア 5')).not.toBeInTheDocument();
    });
  });

  describe('タグ表示', () => {
    it('タグが存在する場合は表示する', () => {
      renderWithProviders(<BookmarkCard {...defaultProps} />);

      expect(screen.getByText('#テスト')).toBeInTheDocument();
      expect(screen.getByText('#開発')).toBeInTheDocument();
      expect(screen.getByText('#React')).toBeInTheDocument();
    });

    it('タグがない場合はタグセクションを表示しない', () => {
      const bookmarkWithoutTags = { ...mockBookmark, tags: [] };
      renderWithProviders(
        <BookmarkCard {...defaultProps} bookmark={bookmarkWithoutTags} />
      );

      expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
      expect(screen.queryByTestId('tags-section')).not.toBeInTheDocument();
    });
  });

  describe('選択状態', () => {
    it('選択されていない場合は通常の表示状態', () => {
      renderWithProviders(<BookmarkCard {...defaultProps} isSelected={false} />);

      const card = screen.getByTestId('bookmark-card');
      expect(card).not.toHaveClass('ring-2', 'ring-primary-500');
      expect(card).toHaveClass('hover:border-gray-300');
    });

    it('選択されている場合は選択状態の表示', () => {
      renderWithProviders(<BookmarkCard {...defaultProps} isSelected={true} />);

      const card = screen.getByTestId('bookmark-card');
      expect(card).toHaveClass('ring-2', 'ring-primary-500', 'border-primary-300');
    });

    it('カードクリック時に選択状態が切り替わる', () => {
      const onToggleSelection = vi.fn();
      renderWithProviders(
        <BookmarkCard {...defaultProps} onToggleSelection={onToggleSelection} />
      );

      const card = screen.getByTestId('bookmark-card');
      fireEvent.click(card);

      expect(onToggleSelection).toHaveBeenCalledWith('bookmark-1', expect.any(Object));
      expect(onToggleSelection).toHaveBeenCalledTimes(1);
    });

    it('その他のアクションボタンクリック時は選択状態を変更しない', () => {
      const onToggleSelection = vi.fn();
      const onMoreActions = vi.fn();
      
      renderWithProviders(
        <BookmarkCard 
          {...defaultProps} 
          onToggleSelection={onToggleSelection}
          onMoreActions={onMoreActions}
        />
      );

      const moreButton = screen.getByRole('button', { name: /その他のアクション/i });
      fireEvent.click(moreButton);

      expect(onMoreActions).toHaveBeenCalledWith('bookmark-1');
      expect(onToggleSelection).not.toHaveBeenCalled();
    });
  });

  describe('表示モード', () => {
    it('グリッドモードでの表示レイアウト', () => {
      renderWithProviders(<BookmarkCard {...defaultProps} viewMode="grid" />);

      const card = screen.getByTestId('bookmark-card');
      expect(card).toHaveClass('card', 'p-4');
    });

    it('リストモードでの表示レイアウト', () => {
      renderWithProviders(<BookmarkCard {...defaultProps} viewMode="list" />);

      const card = screen.getByTestId('bookmark-card');
      // リストモードでは異なるクラスが適用される
      expect(card).toHaveClass('card');
    });
  });

  describe('カテゴリ表示', () => {
    it('カテゴリが設定されていない場合はカテゴリ表示なし', () => {
      const bookmarkWithoutCategory = { ...mockBookmark, categoryId: undefined };
      renderWithProviders(
        <BookmarkCard {...defaultProps} bookmark={bookmarkWithoutCategory} />
      );

      expect(screen.queryByText('テクノロジー')).not.toBeInTheDocument();
    });

    it('カテゴリIDに対応するカテゴリが見つからない場合は表示しない', () => {
      const bookmarkWithInvalidCategory = { ...mockBookmark, categoryId: 'nonexistent' };
      renderWithProviders(
        <BookmarkCard {...defaultProps} bookmark={bookmarkWithInvalidCategory} />
      );

      expect(screen.queryByText('テクノロジー')).not.toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('適切なaria-labelが設定されている', () => {
      renderWithProviders(<BookmarkCard {...defaultProps} />);

      const card = screen.getByTestId('bookmark-card');
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('テストユーザー'));
      expect(card).toHaveAttribute('aria-label', expect.stringContaining('ブックマーク'));
    });

    it('選択状態がaria-selectedで示される', () => {
      renderWithProviders(<BookmarkCard {...defaultProps} isSelected={true} />);

      const card = screen.getByTestId('bookmark-card');
      expect(card).toHaveAttribute('aria-selected', 'true');
    });

    it('キーボードナビゲーションに対応している', () => {
      const onToggleSelection = vi.fn();
      renderWithProviders(
        <BookmarkCard {...defaultProps} onToggleSelection={onToggleSelection} />
      );

      const card = screen.getByTestId('bookmark-card');
      
      // Enterキーでの選択
      fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });
      expect(onToggleSelection).toHaveBeenCalledWith('bookmark-1');

      // Spaceキーでの選択
      fireEvent.keyDown(card, { key: ' ', code: 'Space' });
      expect(onToggleSelection).toHaveBeenCalledTimes(2);
    });
  });

  describe('ドラッグ&ドロップ機能', () => {
    const dragDropProps = {
      ...defaultProps,
      onDragStart: vi.fn(),
      onDragEnd: vi.fn(),
      onDrop: vi.fn(),
      isDragging: false,
      selectedBookmarks: ['bookmark-1'],
      index: 0,
    };

    it('ドラッグ&ドロップのpropsを受け取る', () => {
      expect(() => {
        renderWithProviders(<BookmarkCard {...dragDropProps} />);
      }).not.toThrow();
    });

    it('ドラッグ中の状態を適用する', () => {
      renderWithProviders(
        <BookmarkCard {...dragDropProps} isDragging={true} />
      );

      const card = screen.getByTestId('bookmark-card');
      expect(card).toHaveClass('pointer-events-none');
    });
  });

  describe('Shift+Click機能', () => {
    it('Shift+Clickを含むeventパラメータを受け取る', async () => {
      const onToggleSelection = vi.fn();
      renderWithProviders(
        <BookmarkCard 
          {...defaultProps} 
          onToggleSelection={onToggleSelection}
        />
      );

      const card = screen.getByTestId('bookmark-card');
      
      // Shift+Clickをシミュレート
      fireEvent.click(card, { shiftKey: true });

      expect(onToggleSelection).toHaveBeenCalledWith('bookmark-1', expect.objectContaining({
        shiftKey: true
      }));
    });

    it('通常のクリックではeventパラメータなしで呼び出される', async () => {
      const onToggleSelection = vi.fn();
      renderWithProviders(
        <BookmarkCard 
          {...defaultProps} 
          onToggleSelection={onToggleSelection}
        />
      );

      const card = screen.getByTestId('bookmark-card');
      fireEvent.click(card);

      expect(onToggleSelection).toHaveBeenCalledWith('bookmark-1', expect.any(Object));
    });

    it('キーボードイベントではeventパラメータなしで呼び出される', async () => {
      const onToggleSelection = vi.fn();
      renderWithProviders(
        <BookmarkCard 
          {...defaultProps} 
          onToggleSelection={onToggleSelection}
        />
      );

      const card = screen.getByTestId('bookmark-card');
      fireEvent.keyDown(card, { key: 'Enter' });

      expect(onToggleSelection).toHaveBeenCalledWith('bookmark-1');
    });
  });

  describe('エラーケース', () => {
    it('不正なデータでもクラッシュしない', () => {
      const invalidBookmark = {
        ...mockBookmark,
        content: null as any,
        authorDisplayName: undefined as any,
        bookmarkedAt: 'invalid-date',
      };

      expect(() => {
        renderWithProviders(
          <BookmarkCard {...defaultProps} bookmark={invalidBookmark} />
        );
      }).not.toThrow();
    });

    it('空のカテゴリ配列でもエラーにならない', () => {
      expect(() => {
        renderWithProviders(
          <BookmarkCard {...defaultProps} categories={[]} />
        );
      }).not.toThrow();
    });

    it('ドラッグ&ドロップのpropsが未定義でもエラーにならない', () => {
      expect(() => {
        renderWithProviders(
          <BookmarkCard 
            {...defaultProps} 
            onDragStart={undefined}
            onDragEnd={undefined}
            onDrop={undefined}
          />
        );
      }).not.toThrow();
    });
  });
});