import { useState } from 'react';
import { Heart, Share, ExternalLink, Calendar, Tag, User, MoreHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import HighlightedText from './HighlightedText';
import type { Bookmark } from '../../types';

interface SearchBookmarkCardProps {
  bookmark: Bookmark;
  searchTerms: string[];
  viewMode?: 'grid' | 'list';
  onTagClick?: (tag: string) => void;
  onAuthorClick?: (username: string) => void;
  onCategoryClick?: (categoryId: string) => void;
  className?: string;
}

const SearchBookmarkCard = ({
  bookmark,
  searchTerms,
  viewMode = 'grid',
  onTagClick,
  onAuthorClick,
  onCategoryClick,
  className,
}: SearchBookmarkCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const openInNewTab = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const shouldTruncateContent = bookmark.content.length > 280;
  const contentToShow = isExpanded || !shouldTruncateContent 
    ? bookmark.content 
    : bookmark.content.substring(0, 280) + '...';

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
            {bookmark.authorAvatarUrl && !imageError ? (
              <img
                src={bookmark.authorAvatarUrl}
                alt={bookmark.authorDisplayName}
                className="w-12 h-12 rounded-full group-hover:ring-2 group-hover:ring-primary-300 transition-all"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center group-hover:ring-2 group-hover:ring-primary-300 transition-all">
                <User className="w-6 h-6 text-white" />
              </div>
            )}
          </button>
          
          <div className="flex-1 min-w-0">
            <button
              onClick={() => onAuthorClick?.(bookmark.authorUsername)}
              className="block hover:underline"
            >
              <HighlightedText
                text={bookmark.authorDisplayName}
                searchTerms={searchTerms}
                className="font-semibold text-gray-900 dark:text-gray-100 truncate block"
              />
              <HighlightedText
                text={`@${bookmark.authorUsername}`}
                searchTerms={searchTerms}
                className="text-sm text-gray-500 dark:text-gray-400 truncate block"
              />
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
            <Calendar className="w-3 h-3 mr-1" />
            {formatDate(bookmark.bookmarkedAt)}
          </span>
          <button className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="mb-4">
        <HighlightedText
          text={contentToShow}
          searchTerms={searchTerms}
          className="text-gray-900 dark:text-gray-100 leading-relaxed"
        />
        
        {shouldTruncateContent && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm mt-2 font-medium"
          >
            {isExpanded ? '折りたたむ' : 'さらに表示'}
          </button>
        )}
      </div>

      {/* Media */}
      {bookmark.mediaUrls && bookmark.mediaUrls.length > 0 && (
        <div className="mb-4">
          <div className="grid grid-cols-1 gap-2">
            {bookmark.mediaUrls.slice(0, 4).map((url, index) => (
              <div
                key={index}
                className="relative bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden"
              >
                <img
                  src={url}
                  alt={`Media ${index + 1}`}
                  className="w-full h-48 object-cover hover:opacity-95 transition-opacity cursor-pointer"
                  onClick={() => openInNewTab(url)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Links */}
      {bookmark.links && bookmark.links.length > 0 && (
        <div className="mb-4">
          {bookmark.links.slice(0, 2).map((link, index) => (
            <button
              key={index}
              onClick={() => openInNewTab(link)}
              className="flex items-center space-x-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-sm mb-1 group"
            >
              <ExternalLink className="w-3 h-3" />
              <span className="truncate group-hover:underline">
                {link.replace(/^https?:\/\//, '').substring(0, 50)}
                {link.length > 50 ? '...' : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Tags */}
      {bookmark.tags && bookmark.tags.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {bookmark.tags.map((tag) => (
              <button
                key={tag}
                onClick={() => onTagClick?.(tag)}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-primary-100 dark:hover:bg-primary-900 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
              >
                <Tag className="w-3 h-3 mr-1" />
                <HighlightedText
                  text={`#${tag}`}
                  searchTerms={searchTerms}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center space-x-4">
          <button className="flex items-center space-x-1 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors">
            <Heart className="w-4 h-4" />
            <span className="text-xs">いいね</span>
          </button>
          <button className="flex items-center space-x-1 text-gray-500 dark:text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors">
            <Share className="w-4 h-4" />
            <span className="text-xs">共有</span>
          </button>
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

      {/* Relevance Score (for debugging in development) */}
      {process.env.NODE_ENV === 'development' && bookmark.relevanceScore && (
        <div className="mt-2 text-xs text-gray-400">
          関連度: {bookmark.relevanceScore.toFixed(3)}
        </div>
      )}
    </div>
  );
};

export default SearchBookmarkCard;