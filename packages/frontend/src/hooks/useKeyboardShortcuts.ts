import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchStore } from '../stores/searchStore';
import { useAuthStore } from '../stores/authStore';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  description: string;
  action: () => void;
  disabled?: boolean;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

export const useKeyboardShortcuts = ({ shortcuts, enabled = true }: UseKeyboardShortcutsOptions) => {
  const activeShortcuts = useRef<Map<string, KeyboardShortcut>>(new Map());

  const generateShortcutKey = useCallback((shortcut: KeyboardShortcut) => {
    const modifiers = [];
    if (shortcut.ctrlKey) modifiers.push('ctrl');
    if (shortcut.shiftKey) modifiers.push('shift');
    if (shortcut.altKey) modifiers.push('alt');
    if (shortcut.metaKey) modifiers.push('meta');
    return `${modifiers.join('+')}-${shortcut.key.toLowerCase()}`;
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // 入力フィールド内でのショートカットを無効化
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    const keyCombo = [];
    if (event.ctrlKey || event.metaKey) keyCombo.push(event.ctrlKey ? 'ctrl' : 'meta');
    if (event.shiftKey) keyCombo.push('shift');
    if (event.altKey) keyCombo.push('alt');
    
    const key = `${keyCombo.join('+')}-${event.key.toLowerCase()}`;
    const shortcut = activeShortcuts.current.get(key);

    if (shortcut && !shortcut.disabled) {
      event.preventDefault();
      event.stopPropagation();
      shortcut.action();
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // ショートカットマップを更新
    activeShortcuts.current.clear();
    shortcuts.forEach(shortcut => {
      const key = generateShortcutKey(shortcut);
      activeShortcuts.current.set(key, shortcut);
    });

    // イベントリスナーを追加
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, enabled, handleKeyDown, generateShortcutKey]);

  return {
    shortcuts: Array.from(activeShortcuts.current.values()),
  };
};

// グローバルショートカット設定
export const useGlobalKeyboardShortcuts = () => {
  const navigate = useNavigate();
  const { setIsSearchModalOpen } = useSearchStore();
  const { user } = useAuthStore();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const globalShortcuts: KeyboardShortcut[] = [
    // 検索関連
    {
      key: '/',
      description: 'グローバル検索を開く',
      action: () => setIsSearchModalOpen(true),
    },
    {
      key: 's',
      ctrlKey: true,
      description: '検索ページに移動',
      action: () => navigate('/search'),
    },
    {
      key: 'k',
      ctrlKey: true,
      description: 'クイック検索',
      action: () => {
        const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        } else {
          setIsSearchModalOpen(true);
        }
      },
    },

    // ナビゲーション
    {
      key: 'h',
      description: 'ホーム（ダッシュボード）に移動',
      action: () => navigate('/dashboard'),
    },
    {
      key: 'b',
      description: 'ブックマーク一覧に移動',
      action: () => navigate('/bookmarks'),
    },
    {
      key: 'd',
      description: 'データ管理ページに移動',
      action: () => navigate('/data'),
    },
    {
      key: 'g',
      altKey: true,
      description: '設定ページに移動',
      action: () => navigate('/settings'),
    },

    // 操作系
    {
      key: 'r',
      ctrlKey: true,
      description: 'ページを更新',
      action: () => window.location.reload(),
      disabled: false,
    },
    {
      key: 'n',
      ctrlKey: true,
      description: '新しいウィンドウを開く',
      action: () => window.open(window.location.href, '_blank'),
    },

    // 表示切り替え
    {
      key: 'v',
      description: '表示モード切り替え（グリッド/リスト）',
      action: () => {
        // ViewModeToggleコンポーネントのクリックをトリガー
        const viewToggle = document.querySelector('[data-testid="view-mode-toggle"]') as HTMLButtonElement;
        if (viewToggle) {
          viewToggle.click();
        }
      },
    },
    {
      key: 't',
      description: 'テーマ切り替え（ダーク/ライト）',
      action: () => {
        const themeToggle = document.querySelector('[data-testid="theme-toggle"]') as HTMLButtonElement;
        if (themeToggle) {
          themeToggle.click();
        }
      },
    },

    // 選択・操作
    {
      key: 'a',
      ctrlKey: true,
      description: '全て選択',
      action: () => {
        const selectAllButton = document.querySelector('[data-testid="select-all-bookmarks"]') as HTMLButtonElement;
        if (selectAllButton) {
          selectAllButton.click();
        }
      },
    },
    {
      key: 'Escape',
      description: 'モーダル/選択を閉じる',
      action: () => {
        setIsSearchModalOpen(false);
        // その他のモーダルクローズロジック
        const closeButtons = document.querySelectorAll('[aria-label="閉じる"], [data-testid="close-modal"]');
        closeButtons.forEach((button) => {
          if (button instanceof HTMLElement && button.offsetParent !== null) {
            (button as HTMLButtonElement).click();
          }
        });
      },
    },
  ];

  // ユーザーがログインしていない場合は一部のショートカットを無効化
  const enabledShortcuts = globalShortcuts.map(shortcut => ({
    ...shortcut,
    disabled: !user && ['b', 'd', 's', 'a'].includes(shortcut.key),
  }));

  useKeyboardShortcuts({
    shortcuts: enabledShortcuts,
    enabled: true,
  });

  return {
    shortcuts: enabledShortcuts,
  };
};

// ショートカットヘルプ表示用
export const useShortcutHelp = () => {
  const globalShortcuts = useGlobalKeyboardShortcuts();

  const formatShortcut = (shortcut: KeyboardShortcut): string => {
    const modifiers = [];
    if (shortcut.ctrlKey || shortcut.metaKey) {
      modifiers.push(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl');
    }
    if (shortcut.shiftKey) modifiers.push('Shift');
    if (shortcut.altKey) modifiers.push(navigator.platform.includes('Mac') ? '⌥' : 'Alt');
    
    const key = shortcut.key === ' ' ? 'Space' : shortcut.key.toUpperCase();
    return modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;
  };

  const getShortcutsByCategory = () => {
    const categories = {
      '検索': ['/', 's', 'k'],
      'ナビゲーション': ['h', 'b', 'd', 'g'],
      '操作': ['r', 'n', 'a', 'Escape'],
      '表示': ['v', 't'],
    };

    return Object.entries(categories).map(([category, keys]) => ({
      category,
      shortcuts: globalShortcuts.shortcuts.filter(s => keys.includes(s.key)),
    }));
  };

  return {
    formatShortcut,
    getShortcutsByCategory,
    allShortcuts: globalShortcuts.shortcuts,
  };
};