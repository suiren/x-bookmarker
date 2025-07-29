import { useState, useEffect } from 'react';
import { X, Palette, Hash, Folder } from 'lucide-react';
import { useCreateCategory, useUpdateCategory } from '../hooks/useCategories';
import type { Category, CreateCategoryInput, UpdateCategoryInput } from '../types';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: Category; // For editing
  parentId?: string; // For creating subcategory
}

const PRESET_COLORS = [
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#10B981', // Green
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#EC4899', // Pink
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6366F1', // Indigo
];

const PRESET_ICONS = [
  { value: 'folder', label: 'フォルダ', icon: Folder },
  { value: 'bookmark', label: 'ブックマーク', icon: Hash },
  { value: 'tag', label: 'タグ', icon: Hash },
];

const CategoryModal = ({ isOpen, onClose, category, parentId }: CategoryModalProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [icon, setIcon] = useState('folder');
  const [customColor, setCustomColor] = useState('');

  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();

  const isEditing = !!category;

  // Initialize form with category data when editing
  useEffect(() => {
    if (category) {
      setName(category.name);
      setDescription(category.description || '');
      setColor(category.color);
      setIcon(category.icon);
    } else {
      // Reset form for new category
      setName('');
      setDescription('');
      setColor(PRESET_COLORS[0]);
      setIcon('folder');
      setCustomColor('');
    }
  }, [category, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) return;

    try {
      const finalColor = customColor || color;
      
      if (isEditing && category) {
        const input: UpdateCategoryInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          color: finalColor,
          icon,
        };
        await updateMutation.mutateAsync({ id: category.id, input });
      } else {
        const input: CreateCategoryInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          color: finalColor,
          icon,
          parentId,
        };
        await createMutation.mutateAsync(input);
      }
      
      onClose();
    } catch (error) {
      console.error('Failed to save category:', error);
    }
  };

  const handleColorSelect = (selectedColor: string) => {
    setColor(selectedColor);
    setCustomColor('');
  };

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomColor(e.target.value);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            {isEditing ? 'カテゴリを編集' : 'カテゴリを作成'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              カテゴリ名 *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 技術・AI"
              className="input"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              説明（任意）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="カテゴリの説明を入力"
              rows={3}
              className="input resize-none"
            />
          </div>

          {/* Color Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Palette className="w-4 h-4 inline mr-1" />
              色
            </label>
            
            {/* Preset Colors */}
            <div className="grid grid-cols-5 gap-2 mb-3">
              {PRESET_COLORS.map((presetColor) => (
                <button
                  key={presetColor}
                  type="button"
                  onClick={() => handleColorSelect(presetColor)}
                  className={`w-8 h-8 rounded-full border-2 ${
                    (color === presetColor && !customColor)
                      ? 'border-gray-900 dark:border-gray-100'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  style={{ backgroundColor: presetColor }}
                />
              ))}
            </div>

            {/* Custom Color */}
            <div className="flex items-center space-x-2">
              <input
                type="color"
                value={customColor || color}
                onChange={handleCustomColorChange}
                className="w-8 h-8 rounded border border-gray-300 dark:border-gray-600"
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                カスタム色
              </span>
            </div>
          </div>

          {/* Icon Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              アイコン
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PRESET_ICONS.map((iconOption) => {
                const IconComponent = iconOption.icon;
                return (
                  <button
                    key={iconOption.value}
                    type="button"
                    onClick={() => setIcon(iconOption.value)}
                    className={`flex items-center space-x-2 p-2 rounded border ${
                      icon === iconOption.value
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <IconComponent className="w-4 h-4" />
                    <span className="text-sm">{iconOption.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              プレビュー
            </label>
            <div className="flex items-center space-x-2 p-2 border border-gray-200 dark:border-gray-700 rounded">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: customColor || color }}
              />
              <span className="text-sm text-gray-900 dark:text-gray-100">
                {name || 'カテゴリ名'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}
              className="btn-primary"
            >
              {createMutation.isPending || updateMutation.isPending
                ? '保存中...'
                : isEditing
                ? '更新'
                : '作成'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CategoryModal;