import React, { useState, useEffect } from 'react';
import { Star, Heart, Plus, X, Edit3, Bookmark, Tag, Folder } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSearchStore } from '../stores/searchStore';
import { useCategories } from '../hooks/useCategories';
import { useBookmarks } from '../hooks/useBookmarks';

interface FavoriteItem {
  id: string;
  type: 'category' | 'tag' | 'author';
  name: string;
  displayName?: string;
  color?: string;
  icon?: string;
  count: number;
  lastUsed: Date;
}

interface QuickAccessPanelProps {
  className?: string;
}

const STORAGE_KEY = 'x-bookmarker-favorites';
const MAX_FAVORITES = 12;

export const QuickAccessPanel: React.FC<QuickAccessPanelProps> = ({ className = '' }) => {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const { setCategoryIds, setTags, setAuthorUsername, setQuery } = useSearchStore();
  const { data: categories = [] } = useCategories();
  const { data: bookmarks = [] } = useBookmarks();

  // Load favorites from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setFavorites(parsed.map((item: any) => ({
          ...item,
          lastUsed: new Date(item.lastUsed),
        })));
      }
    } catch (error) {
      console.error('Failed to load favorites:', error);
    }
  }, []);

  // Save favorites to localStorage
  const saveFavorites = (favs: FavoriteItem[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
    } catch (error) {
      console.error('Failed to save favorites:', error);
    }
  };

  // Calculate usage counts for categories and tags
  const usageCounts = React.useMemo(() => {
    const counts = {
      categories: new Map<string, number>(),
      tags: new Map<string, number>(),
      authors: new Map<string, { displayName: string; count: number }>(),
    };

    bookmarks.forEach(bookmark => {
      // Categories
      if (bookmark.categoryId) {
        counts.categories.set(
          bookmark.categoryId, 
          (counts.categories.get(bookmark.categoryId) || 0) + 1
        );
      }

      // Tags 
      bookmark.tags?.forEach(tag => {
        counts.tags.set(tag, (counts.tags.get(tag) || 0) + 1);
      });

      // Authors
      const existing = counts.authors.get(bookmark.authorUsername);
      counts.authors.set(bookmark.authorUsername, {
        displayName: existing?.displayName || bookmark.authorDisplayName,
        count: (existing?.count || 0) + 1,
      });
    });

    return counts;
  }, [bookmarks]);

  const handleQuickAccess = (item: FavoriteItem) => {
    // Update last used time
    const updatedFavorites = favorites.map(fav => 
      fav.id === item.id ? { ...fav, lastUsed: new Date() } : fav
    );
    setFavorites(updatedFavorites);
    saveFavorites(updatedFavorites);

    // Navigate based on type
    switch (item.type) {
      case 'category':
        setCategoryIds([item.id]);
        navigate('/search');
        break;
      case 'tag':
        setTags([item.name]);
        navigate('/search');
        break;
      case 'author':
        setAuthorUsername(item.name);
        navigate('/search');
        break;
    }
  };

  const addToFavorites = (type: 'category' | 'tag' | 'author', id: string, name: string, displayName?: string, color?: string, icon?: string) => {
    if (favorites.length >= MAX_FAVORITES) return;
    if (favorites.some(fav => fav.type === type && fav.id === id)) return;

    let count = 0;
    if (type === 'category') {
      count = usageCounts.categories.get(id) || 0;
    } else if (type === 'tag') {
      count = usageCounts.tags.get(name) || 0;
    } else if (type === 'author') {
      count = usageCounts.authors.get(name)?.count || 0;
    }

    const newFavorite: FavoriteItem = {
      id,
      type,
      name,
      displayName,
      color,
      icon,
      count,
      lastUsed: new Date(),
    };

    const updatedFavorites = [...favorites, newFavorite];
    setFavorites(updatedFavorites);
    saveFavorites(updatedFavorites);
  };

  const removeFromFavorites = (favoriteId: string) => {
    const updatedFavorites = favorites.filter(fav => fav.id !== favoriteId);
    setFavorites(updatedFavorites);
    saveFavorites(updatedFavorites);
  };

  // Get suggested items based on usage
  const getSuggestions = () => {
    const suggestions: Array<{ type: 'category' | 'tag' | 'author'; id: string; name: string; displayName?: string; color?: string; icon?: string; count: number }> = [];

    // Top categories
    Array.from(usageCounts.categories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([id, count]) => {
        const category = categories.find(c => c.id === id);
        if (category && !favorites.some(fav => fav.type === 'category' && fav.id === id)) {
          suggestions.push({
            type: 'category',
            id,
            name: category.name,
            color: category.color,
            icon: category.icon,
            count,
          });
        }
      });

    // Top tags
    Array.from(usageCounts.tags.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([name, count]) => {
        if (!favorites.some(fav => fav.type === 'tag' && fav.name === name)) {
          suggestions.push({
            type: 'tag',
            id: crypto.randomUUID(),
            name,
            count,
          });
        }
      });

    // Top authors
    Array.from(usageCounts.authors.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .forEach(([username, data]) => {
        if (!favorites.some(fav => fav.type === 'author' && fav.name === username)) {
          suggestions.push({
            type: 'author',
            id: crypto.randomUUID(),
            name: username,
            displayName: data.displayName,
            count: data.count,
          });
        }
      });

    return suggestions;
  };

  const getItemIcon = (item: FavoriteItem) => {
    switch (item.type) {
      case 'category':
        return <Folder className="h-4 w-4" />;
      case 'tag':
        return <Tag className="h-4 w-4" />;
      case 'author':
        return <Bookmark className="h-4 w-4" />;
      default:
        return <Star className="h-4 w-4" />;
    }
  };

  const getItemLabel = (item: FavoriteItem) => {
    switch (item.type) {
      case 'category':
        return item.name;
      case 'tag':
        return `#${item.name}`;
      case 'author':
        return `@${item.name}`;
      default:
        return item.name;
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-red-500" />
          <h3 className="font-medium text-gray-900 dark:text-white">
            クイックアクセス
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditMode(!editMode)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="編集モード"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowAddDialog(true)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="追加"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* お気に入りアイテム */}
      <div className="p-4">
        {favorites.length === 0 ? (
          <div className="text-center py-8">
            <Heart className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              お気に入りがありません
            </p>
            <button
              onClick={() => setShowAddDialog(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              追加する
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {favorites
              .sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime())
              .map((item) => (
              <div
                key={item.id}
                className="relative group"
              >
                <button
                  onClick={() => handleQuickAccess(item)}
                  className="w-full p-3 text-left bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  style={item.color ? { borderLeft: `4px solid ${item.color}` } : {}}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {getItemIcon(item)}
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {getItemLabel(item)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {item.count}件
                  </p>
                </button>
                
                {editMode && (
                  <button
                    onClick={() => removeFromFavorites(item.id)}
                    className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 追加ダイアログ */}
      {showAddDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddDialog(false)} />
          <div className="relative bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                お気に入りに追加
              </h3>
              <button
                onClick={() => setShowAddDialog(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                よく使用されているアイテムから選択:
              </p>

              <div className="max-h-64 overflow-y-auto space-y-2">
                {getSuggestions().map((suggestion, index) => (
                  <button
                    key={`${suggestion.type}-${suggestion.id}-${index}`}
                    onClick={() => {
                      addToFavorites(
                        suggestion.type,
                        suggestion.id,
                        suggestion.name,
                        suggestion.displayName,
                        suggestion.color,
                        suggestion.icon
                      );
                      setShowAddDialog(false);
                    }}
                    className="w-full flex items-center justify-between p-3 text-left bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {suggestion.type === 'category' && <Folder className="h-4 w-4 text-blue-500" />}
                      {suggestion.type === 'tag' && <Tag className="h-4 w-4 text-green-500" />}
                      {suggestion.type === 'author' && <Bookmark className="h-4 w-4 text-orange-500" />}
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {suggestion.type === 'tag' ? `#${suggestion.name}` :
                           suggestion.type === 'author' ? `@${suggestion.name}` :
                           suggestion.name}
                        </p>
                        {suggestion.displayName && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {suggestion.displayName}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {suggestion.count}件
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};