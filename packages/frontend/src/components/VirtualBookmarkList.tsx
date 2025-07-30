import { memo, useMemo, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import VirtualBookmarkCard from './VirtualBookmarkCard';
import type { Bookmark } from '../types';

interface VirtualBookmarkListProps {
  bookmarks: Bookmark[];
  height: number;
  itemHeight: number;
  viewMode: 'grid' | 'list';
  isLoading?: boolean;
  onBookmarkSelect?: (bookmark: Bookmark) => void;
  onBookmarkUpdate?: (bookmark: Bookmark) => void;
  onBookmarkDelete?: (bookmarkId: string) => void;
  className?: string;
  searchTerms?: string[];
}

interface VirtualBookmarkItemProps {
  bookmark: Bookmark;
  index: number;
  viewMode: 'grid' | 'list';
  searchTerms?: string[];
  onBookmarkSelect?: (bookmark: Bookmark) => void;
  onBookmarkUpdate?: (bookmark: Bookmark) => void;
  onBookmarkDelete?: (bookmarkId: string) => void;
}

// Memoized individual bookmark item component
const VirtualBookmarkItem = memo(({
  bookmark,
  index,
  viewMode,
  searchTerms,
  onBookmarkSelect,
  onBookmarkUpdate,
  onBookmarkDelete,
}: VirtualBookmarkItemProps) => {
  if (!bookmark) {
    return (
      <div className="p-4">
        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-48" />
      </div>
    );
  }

  return (
    <div
      data-testid={`bookmark-item-${bookmark.id}`}
      role="listitem"
      aria-label={`ブックマーク: ${bookmark.content.substring(0, 50)}...`}
      className={clsx('p-2', viewMode === 'list' ? 'px-4' : 'px-2')}
    >
      <VirtualBookmarkCard
        bookmark={bookmark}
        searchTerms={searchTerms || []}
        viewMode={viewMode}
        onTagClick={(tag) => {
          // Handle tag click
        }}
        onAuthorClick={(username) => {
          // Handle author click  
        }}
        onCategoryClick={(categoryId) => {
          // Handle category click
        }}
        className={clsx(
          'h-full',
          viewMode === 'grid' 
            ? 'max-w-sm mx-auto' 
            : 'max-w-none'
        )}
      />
    </div>
  );
});

VirtualBookmarkItem.displayName = 'VirtualBookmarkItem';

// Loading skeleton component
const VirtualListSkeleton = memo(({ height, itemHeight }: { height: number; itemHeight: number }) => {
  const skeletonCount = Math.ceil(height / itemHeight);
  
  return (
    <div 
      data-testid="virtual-list-skeleton"
      className="space-y-4 p-4"
      style={{ height }}
    >
      {Array.from({ length: skeletonCount }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg"
          style={{ height: itemHeight - 16 }} // Account for padding
        />
      ))}
    </div>
  );
});

VirtualListSkeleton.displayName = 'VirtualListSkeleton';

// Empty state component
const VirtualListEmpty = memo(({ height }: { height: number }) => (
  <div 
    data-testid="virtual-list-empty"
    className="flex flex-col items-center justify-center text-center p-8"
    style={{ height }}
  >
    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
      <Search className="w-8 h-8 text-gray-400" />
    </div>
    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
      ブックマークがありません
    </h3>
    <p className="text-gray-500 dark:text-gray-400 max-w-sm">
      まだブックマークがありません。X（Twitter）から同期を実行してブックマークを取得してください。
    </p>
  </div>
));

VirtualListEmpty.displayName = 'VirtualListEmpty';

const VirtualBookmarkList = memo(({
  bookmarks,
  height,
  itemHeight,
  viewMode,
  isLoading = false,
  onBookmarkSelect,
  onBookmarkUpdate,
  onBookmarkDelete,
  className,
  searchTerms = [],
}: VirtualBookmarkListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // Initialize the virtualizer
  const virtualizer = useVirtualizer({
    count: bookmarks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan: 5, // Render 5 extra items outside the visible area for smooth scrolling
  });

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (bookmarks.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        // Focus next item - would need additional state management for full implementation
        break;
      case 'ArrowUp':
        event.preventDefault();
        // Focus previous item
        break;
      case 'Enter':
        // Select focused item
        break;
    }
  }, [bookmarks.length]);

  // Loading state
  if (isLoading) {
    return (
      <div className={clsx('w-full', className)}>
        <VirtualListSkeleton height={height} itemHeight={itemHeight} />
      </div>
    );
  }

  // Empty state
  if (bookmarks.length === 0) {
    return (
      <div className={clsx('w-full', className)}>
        <VirtualListEmpty height={height} />
      </div>
    );
  }

  return (
    <div
      data-testid="virtual-bookmark-list"
      className={clsx('w-full focus:outline-none', className)}
      role="list"
      aria-label="ブックマークリスト"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const bookmark = bookmarks[virtualItem.index];
            
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <VirtualBookmarkItem
                  bookmark={bookmark}
                  index={virtualItem.index}
                  viewMode={viewMode}
                  searchTerms={searchTerms}
                  onBookmarkSelect={onBookmarkSelect}
                  onBookmarkUpdate={onBookmarkUpdate}
                  onBookmarkDelete={onBookmarkDelete}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

VirtualBookmarkList.displayName = 'VirtualBookmarkList';

export default VirtualBookmarkList;