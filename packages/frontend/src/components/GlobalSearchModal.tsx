import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Clock, ArrowRight, Command } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSearchStore } from '../stores/searchStore';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { useSimpleSearchSuggestions } from '../hooks/useSearchSuggestions';

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  open,
  onClose,
}) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localQuery, setLocalQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const { 
    setQuery,
    addToHistory,
    history,
    suggestions,
  } = useSearchStore();

  const { getRecentSearches } = useSearchHistory();
  const { getSuggestions } = useSimpleSearchSuggestions();

  // モーダルが開いた時にフォーカス
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // 検索候補を取得
  useEffect(() => {
    if (localQuery.length > 1) {
      getSuggestions(localQuery);
    }
  }, [localQuery, getSuggestions]);

  // 最近の検索履歴を取得
  const recentSearches = getRecentSearches(5);
  
  // 表示用のアイテムリスト（履歴 + 候補）
  const displayItems = localQuery.length > 1 
    ? [
        ...suggestions.map(suggestion => ({ type: 'suggestion' as const, text: suggestion })),
        ...recentSearches
          .filter(search => search.query.toLowerCase().includes(localQuery.toLowerCase()))
          .map(search => ({ type: 'history' as const, text: search.query }))
      ]
    : recentSearches.map(search => ({ type: 'history' as const, text: search.query }));

  const handleSearch = (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setQuery(searchQuery);
    addToHistory({
      query: searchQuery,
      categoryIds: [],
      tags: [],
      resultCount: 0, // これは実際の検索後に更新される
    });

    navigate('/search');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && displayItems[selectedIndex]) {
          handleSearch(displayItems[selectedIndex].text);
        } else {
          handleSearch(localQuery);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < displayItems.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > -1 ? prev - 1 : -1);
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  const handleItemClick = (text: string) => {
    handleSearch(text);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* オーバーレイ */}
      <div 
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* モーダルコンテンツ */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* 検索入力 */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="ブックマークを検索..."
            value={localQuery}
            onChange={(e) => {
              setLocalQuery(e.target.value);
              setSelectedIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 outline-none text-lg"
          />
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded border">Enter</kbd>
            <span>検索</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
            data-testid="close-modal"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 検索結果・履歴 */}
        {displayItems.length > 0 && (
          <div className="max-h-80 overflow-y-auto">
            <div className="p-2">
              {displayItems.map((item, index) => (
                <button
                  key={`${item.type}-${index}`}
                  onClick={() => handleItemClick(item.text)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    selectedIndex === index ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`}
                >
                  {item.type === 'history' ? (
                    <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  )}
                  <span className="flex-1 text-gray-900 dark:text-white truncate">
                    {item.text}
                  </span>
                  <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* フィルターリンク */}
        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4 text-gray-500 dark:text-gray-400">
              <span>詳細検索:</span>
              <button
                onClick={() => {
                  navigate('/search');
                  onClose();
                }}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                高度なフィルター
              </button>
            </div>
            <div className="flex items-center gap-1 text-gray-400">
              <Command className="h-3 w-3" />
              <span className="text-xs">K でクイック検索</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};