import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Bookmark, Search, RefreshCw, Settings, Database, Plus, Folder, Edit, Trash2 } from 'lucide-react';
import { useBookmarkStore } from '../stores/bookmarkStore';
import { useCategories, useDeleteCategory } from '../hooks/useCategories';
import CategoryModal from './CategoryModal';
import { clsx } from 'clsx';
import type { Category } from '../types';

const Sidebar = () => {
  const location = useLocation();
  const { filterCategory, setFilterCategory } = useBookmarkStore();
  const { data: categories = [], isLoading: categoriesLoading } = useCategories();
  const deleteMutation = useDeleteCategory();

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | undefined>();
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  const navigationItems = [
    { path: '/', icon: Home, label: 'ダッシュボード' },
    { path: '/bookmarks', icon: Bookmark, label: 'ブックマーク' },
    { path: '/search', icon: Search, label: '検索' },
    { path: '/sync', icon: RefreshCw, label: '同期' },
    { path: '/data', icon: Database, label: 'データ管理' },
    { path: '/settings', icon: Settings, label: '設定' },
  ];

  const handleCreateCategory = () => {
    setEditingCategory(undefined);
    setShowCategoryModal(true);
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setShowCategoryModal(true);
  };

  const handleDeleteCategory = async (category: Category) => {
    if (!confirm(`カテゴリ「${category.name}」を削除しますか？`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(category.id);
    } catch (error) {
      console.error('Failed to delete category:', error);
    }
  };

  const handleModalClose = () => {
    setShowCategoryModal(false);
    setEditingCategory(undefined);
  };

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-screen sticky top-0">
      <nav className="p-4">
        {/* Main Navigation */}
        <div className="space-y-2 mb-8">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  'flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Categories Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              カテゴリ
            </h3>
            <button 
              onClick={handleCreateCategory}
              className="p-1 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              title="カテゴリを追加"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-1">
            {/* All Bookmarks */}
            <button
              onClick={() => setFilterCategory(undefined)}
              className={clsx(
                'w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors',
                !filterCategory
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              )}
            >
              <Folder className="w-4 h-4" />
              <span>すべて</span>
            </button>
            
            {/* Category List */}
            {categoriesLoading ? (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                カテゴリを読み込み中...
              </div>
            ) : categories.length > 0 ? (
              categories.map((category) => (
                <div
                  key={category.id}
                  className="relative group"
                  onMouseEnter={() => setHoveredCategory(category.id)}
                  onMouseLeave={() => setHoveredCategory(null)}
                >
                  <button
                    onClick={() => setFilterCategory(category.id)}
                    className={clsx(
                      'w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors',
                      filterCategory === category.id
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                    )}
                  >
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="truncate flex-1">{category.name}</span>
                  </button>
                  
                  {/* Action buttons on hover */}
                  {hoveredCategory === category.id && !category.isDefault && (
                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditCategory(category);
                        }}
                        className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="編集"
                      >
                        <Edit className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCategory(category);
                        }}
                        disabled={deleteMutation.isPending}
                        className="p-1 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        title="削除"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                カテゴリがまだありません
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Category Modal */}
      <CategoryModal
        isOpen={showCategoryModal}
        onClose={handleModalClose}
        category={editingCategory}
      />
    </aside>
  );
};

export default Sidebar;