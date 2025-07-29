import { memo } from 'react';
import { Calendar, Tag, User, ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';
import LazyImage from './LazyImage';
import ProgressiveImage from './ProgressiveImage';
import type { Bookmark } from '../types';

interface VirtualBookmarkCardProps {
  bookmark: Bookmark;
  viewMode: 'grid' | 'list';
  searchTerms?: string[];
  onTagClick?: (tag: string) => void;
  onAuthorClick?: (username: string) => void;
  onCategoryClick?: (categoryId: string) => void;
  className?: string;
}

const VirtualBookmarkCard = memo(({
  bookmark,
  viewMode,
  searchTerms = [],
  onTagClick,
  onAuthorClick,
  onCategoryClick,
  className,
}: VirtualBookmarkCardProps) => {
  const highlightText = (text: string, terms: string[]) => {
    if (!terms.length) return text;
    
    let highlightedText = text;
    terms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlightedText = highlightedText.replace(
        regex,
        '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>'
      );
    });
    
    return highlightedText;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div
      className={clsx(
        'bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow',
        viewMode === 'list' ? 'p-4' : 'p-6',
        className
      )}
    >
      {/* Header with Author Info */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <button
            onClick={() => onAuthorClick?.(bookmark.authorUsername)}
            className="flex-shrink-0 group"
          >
            {bookmark.authorAvatarUrl ? (
              <ProgressiveImage
                src={bookmark.authorAvatarUrl}
                alt={bookmark.authorDisplayName}
                className="w-10 h-10 rounded-full object-cover group-hover:ring-2 group-hover:ring-primary-300 transition-all"
                width={40}
                height={40}
                quality="medium"
              />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center group-hover:ring-2 group-hover:ring-primary-300 transition-all">
                <User className="w-5 h-5 text-white" />
              </div>
            )}
          </button>
          
          <div className="flex-1 min-w-0">
            <button
              onClick={() => onAuthorClick?.(bookmark.authorUsername)}
              className="block hover:underline"
            >
              <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                {bookmark.authorDisplayName}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                @{bookmark.authorUsername}
              </div>
            </button>
          </div>
        </div>

        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center flex-shrink-0">
          <Calendar className="w-3 h-3 mr-1" />
          {formatDate(bookmark.bookmarkedAt)}
        </span>
      </div>

      {/* Content */}
      <div className="mb-4">
        <div 
          className="text-gray-900 dark:text-gray-100 leading-relaxed"
          dangerouslySetInnerHTML={{
            __html: highlightText(bookmark.content, searchTerms)
          }}
        />
      </div>

      {/* Media */}
      {bookmark.mediaUrls && bookmark.mediaUrls.length > 0 && (
        <div className="mb-4">
          <div className="grid grid-cols-1 gap-2">
            {bookmark.mediaUrls.slice(0, 2).map((url, index) => (
              <div
                key={index}
                className="relative bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden"
              >
                <ProgressiveImage
                  src={url}
                  alt={`Media ${index + 1}`}
                  className="w-full h-32 object-cover hover:opacity-95 transition-opacity cursor-pointer"
                  onClick={() => window.open(url, '_blank')}
                  quality="high"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Links */}
      {bookmark.links && bookmark.links.length > 0 && (
        <div className="mb-4">
          {bookmark.links.slice(0, 1).map((link, index) => (
            <button
              key={index}
              onClick={() => window.open(link, '_blank')}
              className="flex items-center space-x-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm group"
            >
              <ExternalLink className="w-3 h-3" />
              <span className="truncate group-hover:underline">
                {link.replace(/^https?:\/\//, '').substring(0, 40)}
                {link.length > 40 ? '...' : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Tags */}
      {bookmark.tags && bookmark.tags.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {bookmark.tags.slice(0, 3).map((tag) => (
              <button
                key={tag}
                onClick={() => onTagClick?.(tag)}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-primary-100 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
              >
                <Tag className="w-3 h-3 mr-1" />
                <span
                  dangerouslySetInnerHTML={{
                    __html: highlightText(`#${tag}`, searchTerms)
                  }}
                />
              </button>
            ))}
            {bookmark.tags.length > 3 && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                +{bookmark.tags.length - 3}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {bookmark.relevanceScore > 0 && (
            <span>関連度: {(bookmark.relevanceScore * 100).toFixed(0)}%</span>
          )}
        </div>

        {/* Category */}
        {bookmark.category && (
          <button
            onClick={() => onCategoryClick?.(bookmark.category!.id)}
            className="flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium transition-colors hover:opacity-80"
            style={{
              backgroundColor: bookmark.category.color + '20',
              color: bookmark.category.color,
            }}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: bookmark.category.color }}
            />
            <span>{bookmark.category.name}</span>
          </button>
        )}
      </div>
    </div>
  );
});

VirtualBookmarkCard.displayName = 'VirtualBookmarkCard';

export default VirtualBookmarkCard;