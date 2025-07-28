/**
 * TagManager コンポーネントのテスト
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, createMockTag, vi } from '../../test/helpers';
import TagManager from '../TagManager';
import type { FrontendTag } from '../../types';

describe('TagManager', () => {
  const mockTags: FrontendTag[] = [
    createMockTag({
      id: 'tag-1',
      name: 'React',
      color: '#61DAFB',
      usageCount: 10,
    }),
    createMockTag({
      id: 'tag-2', 
      name: 'TypeScript',
      color: '#3178C6',
      usageCount: 8,
    }),
    createMockTag({
      id: 'tag-3',
      name: 'JavaScript',
      color: '#F7DF1E',
      usageCount: 15,
    }),
  ];

  const defaultProps = {
    tags: mockTags,
    selectedTags: ['React', 'TypeScript'],
    onTagAdd: vi.fn(),
    onTagRemove: vi.fn(),
    onTagUpdate: vi.fn(),
    onTagDelete: vi.fn(),
    onTagToggle: vi.fn(),
    onTagColorChange: vi.fn(),
    isEditable: true,
    showUsageCount: true,
    maxTags: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本的な表示', () => {
    it('タグ一覧を正しく表示する', () => {
      renderWithProviders(<TagManager {...defaultProps} />);

      expect(screen.getByText('#React')).toBeInTheDocument();
      expect(screen.getByText('#TypeScript')).toBeInTheDocument();
      expect(screen.getByText('#JavaScript')).toBeInTheDocument();
    });

    it('使用回数を表示する', () => {
      renderWithProviders(<TagManager {...defaultProps} />);

      expect(screen.getByText('(10)')).toBeInTheDocument();
      expect(screen.getByText('(8)')).toBeInTheDocument();
      expect(screen.getByText('(15)')).toBeInTheDocument();
    });

    it('使用回数非表示設定を適用する', () => {
      renderWithProviders(
        <TagManager {...defaultProps} showUsageCount={false} />
      );

      expect(screen.queryByText('(10)')).not.toBeInTheDocument();
      expect(screen.queryByText('(8)')).not.toBeInTheDocument();
      expect(screen.queryByText('(15)')).not.toBeInTheDocument();
    });

    it('タグの色を正しく表示する', () => {
      renderWithProviders(<TagManager {...defaultProps} />);

      const reactTag = screen.getByText('#React').closest('[data-testid="tag-item"]');
      expect(reactTag).toHaveStyle({ 'background-color': 'rgba(97, 218, 251, 0.1)' });
    });
  });

  describe('選択状態の管理', () => {
    it('選択されたタグを強調表示する', () => {
      renderWithProviders(<TagManager {...defaultProps} />);

      const reactTag = screen.getByText('#React').closest('[data-testid="tag-item"]');
      const jsTag = screen.getByText('#JavaScript').closest('[data-testid="tag-item"]');

      expect(reactTag).toHaveClass('ring-2', 'ring-primary-500');
      expect(jsTag).not.toHaveClass('ring-2', 'ring-primary-500');
    });

    it('タグクリック時に選択状態を切り替える', async () => {
      const onTagToggle = vi.fn();
      renderWithProviders(
        <TagManager {...defaultProps} onTagToggle={onTagToggle} />
      );

      const jsTag = screen.getByText('#JavaScript');
      await userEvent.click(jsTag);

      expect(onTagToggle).toHaveBeenCalledWith('JavaScript');
    });

    it('選択されたタグをクリックして選択解除', async () => {
      const onTagToggle = vi.fn();
      renderWithProviders(
        <TagManager {...defaultProps} onTagToggle={onTagToggle} />
      );

      const reactTag = screen.getByText('#React');
      await userEvent.click(reactTag);

      expect(onTagToggle).toHaveBeenCalledWith('React');
    });
  });

  describe('タグの追加機能', () => {
    it('新しいタグ追加フォームを表示する', () => {
      renderWithProviders(<TagManager {...defaultProps} />);

      expect(screen.getByPlaceholderText('新しいタグを追加')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /追加/i })).toBeInTheDocument();
    });

    it('新しいタグを追加できる', async () => {
      const onTagAdd = vi.fn();
      renderWithProviders(
        <TagManager {...defaultProps} onTagAdd={onTagAdd} />
      );

      const input = screen.getByPlaceholderText('新しいタグを追加');
      const addButton = screen.getByRole('button', { name: /追加/i });

      await userEvent.type(input, 'Vue.js');
      await userEvent.click(addButton);

      expect(onTagAdd).toHaveBeenCalledWith('Vue.js');
      expect(input).toHaveValue('');
    });

    it('Enterキーでタグを追加できる', async () => {
      const onTagAdd = vi.fn();
      renderWithProviders(
        <TagManager {...defaultProps} onTagAdd={onTagAdd} />
      );

      const input = screen.getByPlaceholderText('新しいタグを追加');
      
      await userEvent.type(input, 'Vue.js');
      await userEvent.keyboard('{Enter}');

      expect(onTagAdd).toHaveBeenCalledWith('Vue.js');
    });

    it('空のタグは追加できない', async () => {
      const onTagAdd = vi.fn();
      renderWithProviders(
        <TagManager {...defaultProps} onTagAdd={onTagAdd} />
      );

      const addButton = screen.getByRole('button', { name: /追加/i });
      await userEvent.click(addButton);

      expect(onTagAdd).not.toHaveBeenCalled();
    });

    it('重複するタグは追加できない', async () => {
      const onTagAdd = vi.fn();
      renderWithProviders(
        <TagManager {...defaultProps} onTagAdd={onTagAdd} />
      );

      const input = screen.getByPlaceholderText('新しいタグを追加');
      const addButton = screen.getByRole('button', { name: /追加/i });

      await userEvent.type(input, 'React');
      await userEvent.click(addButton);

      expect(onTagAdd).not.toHaveBeenCalled();
      expect(screen.getByText('このタグは既に存在します')).toBeInTheDocument();
    });

    it('最大タグ数制限を適用する', async () => {
      const maxTags = 2;
      const onTagAdd = vi.fn();
      renderWithProviders(
        <TagManager {...defaultProps} maxTags={maxTags} onTagAdd={onTagAdd} />
      );

      const input = screen.getByPlaceholderText('新しいタグを追加');
      const addButton = screen.getByRole('button', { name: /追加/i });

      await userEvent.type(input, 'Vue.js');
      await userEvent.click(addButton);

      expect(onTagAdd).not.toHaveBeenCalled();
      expect(screen.getByText(`最大${maxTags}個までのタグを追加できます`)).toBeInTheDocument();
    });
  });

  describe('タグの編集機能', () => {
    it('編集不可モードでは編集コントロールを表示しない', () => {
      renderWithProviders(
        <TagManager {...defaultProps} isEditable={false} />
      );

      expect(screen.queryByPlaceholderText('新しいタグを追加')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /削除/i })).not.toBeInTheDocument();
    });

    it('編集モードでタグ削除ボタンを表示する', () => {
      renderWithProviders(<TagManager {...defaultProps} />);

      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      expect(deleteButtons).toHaveLength(mockTags.length);
    });

    it('タグを削除できる', async () => {
      const onTagDelete = vi.fn();
      renderWithProviders(
        <TagManager {...defaultProps} onTagDelete={onTagDelete} />
      );

      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      await userEvent.click(deleteButtons[0]);

      // 使用回数順でソートされるため、JavaScript (tag-3) が最初に来る
      expect(onTagDelete).toHaveBeenCalledWith('tag-3');
    });

    it('タグの色を変更できる', async () => {
      const onTagColorChange = vi.fn();
      renderWithProviders(
        <TagManager {...defaultProps} onTagColorChange={onTagColorChange} />
      );

      const colorButtons = screen.getAllByRole('button', { name: /色を変更/i });
      await userEvent.click(colorButtons[0]);

      // カラーピッカーが表示される
      expect(screen.getByText('色を選択')).toBeInTheDocument();
      
      const redColor = screen.getByTitle('#FF0000');
      await userEvent.click(redColor);

      // 使用回数順でソートされるため、JavaScript (tag-3) が最初に来る
      expect(onTagColorChange).toHaveBeenCalledWith('tag-3', '#FF0000');
    });
  });

  describe('検索・フィルタリング機能', () => {
    it('タグ検索フィールドを表示する', () => {
      renderWithProviders(<TagManager {...defaultProps} />);

      expect(screen.getByPlaceholderText('タグを検索')).toBeInTheDocument();
    });

    it('タグを検索でフィルタリングできる', async () => {
      renderWithProviders(<TagManager {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('タグを検索');
      await userEvent.type(searchInput, 'React');

      expect(screen.getByText('#React')).toBeInTheDocument();
      expect(screen.queryByText('#JavaScript')).not.toBeInTheDocument();
    });

    it('検索クリアボタンが動作する', async () => {
      renderWithProviders(<TagManager {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('タグを検索');
      await userEvent.type(searchInput, 'React');

      const clearButton = screen.getByRole('button', { name: /クリア/i });
      await userEvent.click(clearButton);

      expect(searchInput).toHaveValue('');
      expect(screen.getByText('#React')).toBeInTheDocument();
      expect(screen.getByText('#JavaScript')).toBeInTheDocument();
    });

    it('使用回数でソートできる', async () => {
      renderWithProviders(<TagManager {...defaultProps} />);

      const sortButton = screen.getByRole('button', { name: /使用回数順/i });
      await userEvent.click(sortButton);

      const tagElements = screen.getAllByTestId('tag-item');
      // JavaScript (15回) > React (10回) > TypeScript (8回) の順序
      expect(tagElements[0]).toHaveTextContent('JavaScript');
      expect(tagElements[1]).toHaveTextContent('React');
      expect(tagElements[2]).toHaveTextContent('TypeScript');
    });
  });

  describe('アクセシビリティ', () => {
    it('適切なaria-labelが設定されている', () => {
      renderWithProviders(<TagManager {...defaultProps} />);

      const tagManager = screen.getByRole('region', { name: /タグ管理/i });
      expect(tagManager).toBeInTheDocument();
    });

    it('タグがボタンとして認識される', () => {
      renderWithProviders(<TagManager {...defaultProps} />);

      const reactTag = screen.getByRole('button', { name: /React/i });
      expect(reactTag).toBeInTheDocument();
    });

    it('キーボードナビゲーションに対応している', async () => {
      renderWithProviders(<TagManager {...defaultProps} />);

      const firstTag = screen.getAllByTestId('tag-item')[0];
      firstTag.focus();

      await userEvent.keyboard('{Enter}');
      // 使用回数順でソートされるため、JavaScript が最初に来る
      expect(defaultProps.onTagToggle).toHaveBeenCalledWith('JavaScript');
    });
  });

  describe('エラーケース', () => {
    it('タグが空の場合でもクラッシュしない', () => {
      expect(() => {
        renderWithProviders(
          <TagManager {...defaultProps} tags={[]} />
        );
      }).not.toThrow();

      expect(screen.getByText('タグがありません')).toBeInTheDocument();
    });

    it('不正なタグデータでもエラーにならない', () => {
      const invalidTags = [
        { ...mockTags[0], name: null as any },
        { ...mockTags[1], color: undefined as any },
      ];

      expect(() => {
        renderWithProviders(
          <TagManager {...defaultProps} tags={invalidTags} />
        );
      }).not.toThrow();
    });
  });

  describe('パフォーマンス', () => {
    it('大量のタグでも適切に表示される', () => {
      const manyTags = Array.from({ length: 100 }, (_, i) => 
        createMockTag({
          id: `tag-${i}`,
          name: `Tag${i}`,
          usageCount: i,
        })
      );

      renderWithProviders(
        <TagManager {...defaultProps} tags={manyTags} />
      );

      expect(screen.getAllByTestId('tag-item')).toHaveLength(100);
    });
  });
});