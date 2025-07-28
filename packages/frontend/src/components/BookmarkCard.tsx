/**
 * BookmarkCard コンポーネント
 * 個別のブックマークを表示するカードコンポーネント
 */

import React, { useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useDrag, useDrop } from 'react-dnd';
import { clsx } from 'clsx';
import type { FrontendBookmark, FrontendCategory } from '../types';

interface BookmarkCardProps {
  bookmark: FrontendBookmark;
  categories: FrontendCategory[];
  isSelected: boolean;
  viewMode: 'grid' | 'list';
  onToggleSelection: (bookmarkId: string, event?: React.MouseEvent) => void;
  onMoreActions: (bookmarkId: string) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDrop?: (categoryId: string, bookmarkIds: string[]) => void;
  isDragging?: boolean;
  selectedBookmarks?: string[];
  index?: number;
}

const BookmarkCard: React.FC<BookmarkCardProps> = ({
  bookmark,
  categories,
  isSelected,
  viewMode: _viewMode, // 将来の拡張用に保持
  onToggleSelection,
  onMoreActions,
  onDragStart,
  onDragEnd,
  onDrop,
  isDragging = false,
  selectedBookmarks = [],
  index: _index = 0,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  // ドラッグ機能
  const [{ isDragActive }, drag] = useDrag({
    type: 'bookmark',
    item: () => {
      onDragStart?.();
      const draggedBookmarks = isSelected ? selectedBookmarks : [bookmark.id];
      return { 
        bookmarkIds: draggedBookmarks,
        sourceCategory: bookmark.categoryId 
      };
    },
    end: () => {
      onDragEnd?.();
    },
    collect: (monitor) => ({
      isDragActive: monitor.isDragging(),
    }),
  });

  // ドロップ機能（カテゴリ変更用）
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: 'bookmark',
    drop: (item: { bookmarkIds: string[]; sourceCategory?: string }) => {
      if (bookmark.categoryId && bookmark.categoryId !== item.sourceCategory) {
        onDrop?.(bookmark.categoryId, item.bookmarkIds);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  // refを組み合わせ
  drag(drop(ref));

  // カテゴリ情報を取得
  const category = bookmark.categoryId 
    ? categories.find(c => c.id === bookmark.categoryId)
    : undefined;

  // 日付フォーマット
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ja-JP');
    } catch {
      return 'Invalid Date';
    }
  };

  // カードクリック処理
  const handleCardClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    // その他のアクションボタンクリック時は選択状態を変更しない
    if ((e.target as HTMLElement).closest('[data-action-button]')) {
      return;
    }
    // MouseEventの場合のみeventを渡す
    if ('button' in e) {
      onToggleSelection(bookmark.id, e as React.MouseEvent);
    } else {
      onToggleSelection(bookmark.id);
    }
  };

  // キーボードナビゲーション処理
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick(e);
    }
  };

  // その他のアクションボタンクリック処理
  const handleMoreActions = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMoreActions(bookmark.id);
  };

  return (
    <div
      ref={ref}
      data-testid="bookmark-card"
      className={clsx(
        'card p-4 cursor-pointer transition-all duration-200 hover:shadow-md',
        isSelected
          ? 'ring-2 ring-primary-500 border-primary-300 dark:border-primary-600'
          : 'hover:border-gray-300 dark:hover:border-gray-600',
        isDragActive && 'opacity-50 scale-95',
        isOver && canDrop && 'ring-2 ring-green-500 bg-green-50 dark:bg-green-900/20',
        isDragging && 'pointer-events-none'
      )}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${bookmark.authorDisplayName || bookmark.authorUsername}のブックマーク`}
      aria-selected={isSelected}
    >
      {/* 作者情報 */}
      <div className="flex items-center space-x-3 mb-3">
        {bookmark.authorAvatarUrl ? (
          <img
            src={bookmark.authorAvatarUrl}
            alt={bookmark.authorDisplayName || bookmark.authorUsername}
            className="w-10 h-10 rounded-full"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                parent.innerHTML = '<div class="w-10 h-10 bg-gray-300 dark:bg-gray-600 rounded-full" role="img" aria-label="default avatar"></div>';
              }
            }}
          />
        ) : (
          <div 
            className="w-10 h-10 bg-gray-300 dark:bg-gray-600 rounded-full"
            role="img"
            aria-label="default avatar"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
            {bookmark.authorDisplayName || bookmark.authorUsername}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
            @{bookmark.authorUsername}
          </p>
        </div>
        <button
          data-action-button
          onClick={handleMoreActions}
          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="その他のアクション"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* ブックマーク内容 */}
      <div className="mb-3">
        <p className="text-gray-900 dark:text-gray-100 line-clamp-3">
          {bookmark.content || ''}
        </p>
      </div>

      {/* メディアプレビュー */}
      {bookmark.mediaUrls && bookmark.mediaUrls.length > 0 && (
        <div className="mb-3" data-testid="media-grid">
          <div className="grid grid-cols-2 gap-2">
            {bookmark.mediaUrls.slice(0, 4).map((url, index) => (
              <img
                key={index}
                src={url}
                alt={`メディア ${index + 1}`}
                className="w-full h-20 object-cover rounded"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'none';
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* タグ */}
      {bookmark.tags && bookmark.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3" data-testid="tags-section">
          {bookmark.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* フッター */}
      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <span>
          {formatDate(bookmark.bookmarkedAt)}
        </span>
        {category && (
          <span 
            className="px-2 py-1 rounded text-xs flex items-center space-x-1"
            style={{ 
              backgroundColor: category.color + '20',
              color: category.color 
            }}
          >
            <div
              className="w-2 h-2 rounded"
              style={{ backgroundColor: category.color }}
            />
            <span>{category.name}</span>
          </span>
        )}
      </div>
    </div>
  );
};

export default BookmarkCard;