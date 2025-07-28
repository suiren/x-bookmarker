/**
 * TagManager コンポーネント
 * タグの追加・削除・編集・色設定などの高度な管理機能を提供
 */

import React, { useState, useMemo } from 'react';
import { Plus, X, Search, Palette, SortAsc } from 'lucide-react';
import { clsx } from 'clsx';
import type { FrontendTag } from '../types';

interface TagManagerProps {
  tags: FrontendTag[];
  selectedTags: string[];
  onTagAdd: (tagName: string) => void;
  onTagRemove: (tagName: string) => void;
  onTagUpdate: (tagId: string, updates: Partial<FrontendTag>) => void;
  onTagDelete: (tagId: string) => void;
  onTagToggle: (tagName: string) => void;
  onTagColorChange: (tagId: string, color: string) => void;
  isEditable?: boolean;
  showUsageCount?: boolean;
  maxTags?: number;
}

// 事前定義された色パレット
const COLOR_PALETTE = [
  '#FF0000', '#FF8C00', '#FFD700', '#ADFF2F', '#00FF7F',
  '#00CED1', '#1E90FF', '#9370DB', '#FF69B4', '#DC143C',
  '#32CD32', '#00BFFF', '#8A2BE2', '#FF1493', '#228B22',
];

type SortType = 'name' | 'usage' | 'recent';

const TagManager: React.FC<TagManagerProps> = ({
  tags,
  selectedTags,
  onTagAdd,
  onTagRemove: _onTagRemove,
  onTagUpdate: _onTagUpdate,
  onTagDelete,
  onTagToggle,
  onTagColorChange,
  isEditable = true,
  showUsageCount = true,
  maxTags = 50,
}) => {
  const [newTagName, setNewTagName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortType>('usage');
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // タグのフィルタリングとソート
  const filteredAndSortedTags = useMemo(() => {
    let filtered = tags;

    // 検索フィルタリング
    if (searchQuery) {
      filtered = tags.filter(tag =>
        tag.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // ソート
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'usage':
          return b.usageCount - a.usageCount;
        case 'recent':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        default:
          return 0;
      }
    });
  }, [tags, searchQuery, sortBy]);

  // 新しいタグの追加処理
  const handleAddTag = () => {
    const trimmedName = newTagName.trim();
    
    // バリデーション
    if (!trimmedName) {
      return;
    }

    if (tags.some(tag => tag.name.toLowerCase() === trimmedName.toLowerCase())) {
      setErrors({ add: 'このタグは既に存在します' });
      return;
    }

    if (tags.length >= maxTags) {
      setErrors({ add: `最大${maxTags}個までのタグを追加できます` });
      return;
    }

    // エラーをクリアして追加
    setErrors({});
    onTagAdd(trimmedName);
    setNewTagName('');
  };

  // Enterキーでのタグ追加
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  // タグクリック処理
  const handleTagClick = (tagName: string) => {
    onTagToggle(tagName);
  };

  // タグ削除処理
  const handleDeleteTag = (e: React.MouseEvent, tagId: string) => {
    e.stopPropagation();
    onTagDelete(tagId);
  };

  // 色変更処理
  const handleColorChange = (tagId: string, color: string) => {
    onTagColorChange(tagId, color);
    setShowColorPicker(null);
  };

  // 検索クリア
  const clearSearch = () => {
    setSearchQuery('');
  };

  // 色のRGBA変換
  const hexToRgba = (hex: string, alpha: number = 0.1) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return (
    <div className="space-y-4" role="region" aria-label="タグ管理">
      {/* 検索とソート */}
      <div className="flex items-center space-x-4">
        {/* 検索フィールド */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="タグを検索"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10 py-2 w-full border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="クリア"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ソートボタン */}
        <div className="relative">
          <button
            onClick={() => setSortBy(sortBy === 'usage' ? 'name' : 'usage')}
            className="flex items-center space-x-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            aria-label="使用回数順"
          >
            <SortAsc className="w-4 h-4" />
            <span className="text-sm">
              {sortBy === 'usage' ? '使用回数順' : 'アルファベット順'}
            </span>
          </button>
        </div>
      </div>

      {/* 新しいタグの追加フォーム */}
      {isEditable && (
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="新しいタグを追加"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              maxLength={50}
            />
            <button
              onClick={handleAddTag}
              disabled={!newTagName.trim()}
              className="flex items-center space-x-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="追加"
            >
              <Plus className="w-4 h-4" />
              <span>追加</span>
            </button>
          </div>
          {errors.add && (
            <p className="text-sm text-red-600 dark:text-red-400">{errors.add}</p>
          )}
        </div>
      )}

      {/* タグ一覧 */}
      <div className="space-y-2">
        {filteredAndSortedTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {filteredAndSortedTags.map((tag) => {
              const isSelected = selectedTags.includes(tag.name);
              const backgroundColor = tag.color ? hexToRgba(tag.color) : 'rgba(156, 163, 175, 0.1)';
              
              return (
                <div
                  key={tag.id}
                  data-testid="tag-item"
                  className={clsx(
                    'group relative flex items-center space-x-2 px-3 py-1 rounded-full cursor-pointer transition-all duration-200',
                    'border-2',
                    isSelected
                      ? 'ring-2 ring-primary-500 border-primary-300 dark:border-primary-600'
                      : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                  )}
                  style={{ backgroundColor }}
                  onClick={() => handleTagClick(tag.name)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleTagClick(tag.name);
                    }
                  }}
                  aria-label={`${tag.name} タグ`}
                  aria-pressed={isSelected}
                >
                  {/* タグ色インジケーター */}
                  {tag.color && (
                    <div
                      className="w-3 h-3 rounded-full border border-gray-300 dark:border-gray-600"
                      style={{ backgroundColor: tag.color }}
                    />
                  )}

                  {/* タグ名 */}
                  <span 
                    className="text-sm font-medium text-gray-800 dark:text-gray-200"
                    style={{ color: tag.color }}
                  >
                    #{tag.name || 'Unknown'}
                  </span>

                  {/* 使用回数 */}
                  {showUsageCount && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      ({tag.usageCount || 0})
                    </span>
                  )}

                  {/* 編集コントロール */}
                  {isEditable && (
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* 色変更ボタン */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowColorPicker(showColorPicker === tag.id ? null : tag.id);
                        }}
                        className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        aria-label="色を変更"
                      >
                        <Palette className="w-3 h-3" />
                      </button>

                      {/* 削除ボタン */}
                      <button
                        onClick={(e) => handleDeleteTag(e, tag.id)}
                        className="p-1 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        aria-label="削除"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* カラーピッカー */}
                  {showColorPicker === tag.id && (
                    <div className="absolute top-full left-0 mt-2 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
                      <div className="mb-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          色を選択
                        </p>
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {COLOR_PALETTE.map((color) => (
                          <button
                            key={color}
                            onClick={() => handleColorChange(tag.id, color)}
                            className={clsx(
                              'w-6 h-6 rounded border-2 hover:scale-110 transition-transform',
                              tag.color === color 
                                ? 'border-gray-800 dark:border-gray-200' 
                                : 'border-gray-300 dark:border-gray-600'
                            )}
                            style={{ backgroundColor: color }}
                            title={color}
                            aria-label={`色 ${color}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : searchQuery ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-4">
            検索に一致するタグがありません
          </p>
        ) : (
          <p className="text-center text-gray-500 dark:text-gray-400 py-4">
            タグがありません
          </p>
        )}
      </div>

      {/* タグ統計 */}
      {tags.length > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
          <span>
            {filteredAndSortedTags.length} / {tags.length} タグ
          </span>
          {isEditable && (
            <span>
              {maxTags - tags.length} 個追加可能
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default TagManager;