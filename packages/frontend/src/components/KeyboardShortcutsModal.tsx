import React from 'react';
import { X, Keyboard } from 'lucide-react';
import { useShortcutHelp } from '../hooks/useKeyboardShortcuts';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  open,
  onClose,
}) => {
  const { formatShortcut, getShortcutsByCategory } = useShortcutHelp();

  if (!open) return null;

  const shortcutCategories = getShortcutsByCategory();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* オーバーレイ */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* モーダルコンテンツ */}
      <div className="relative w-full max-w-2xl max-h-[80vh] bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Keyboard className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              キーボードショートカット
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            data-testid="close-modal"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
          <div className="grid gap-6 md:grid-cols-2">
            {shortcutCategories.map(({ category, shortcuts }) => (
              <div key={category} className="space-y-3">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {category}
                </h3>
                <div className="space-y-2">
                  {shortcuts
                    .filter(shortcut => !shortcut.disabled)
                    .map((shortcut, index) => (
                    <div 
                      key={`${category}-${index}`}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                    >
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {shortcut.description}
                      </span>
                      <kbd className="inline-flex items-center px-2 py-1 text-xs font-mono font-semibold text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-sm">
                        {formatShortcut(shortcut)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 追加情報 */}
          <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-3">
              <Keyboard className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">ヒント:</p>
                <ul className="space-y-1 text-xs">
                  <li>• 入力フィールド内ではショートカットは無効化されます</li>
                  <li>• Mac では Ctrl キーの代わりに ⌘ キーを使用します</li>
                  <li>• このヘルプは <kbd className="px-1 py-0.5 bg-blue-100 dark:bg-blue-800 rounded text-xs">?</kbd> で開けます</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};