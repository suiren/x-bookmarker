// Core hooks exports
export { useAuth, useAuthState } from './useAuth';
export { useBookmarks } from './useBookmarks';
export { useCategories } from './useCategories';
export { useSync } from './useSync';

// Search related hooks
export { useSearchHistory } from './useSearchHistory';
export { 
  useSearchSuggestions, 
  useSimpleSearchSuggestions, 
  usePopularSuggestions, 
  useSearchFacets 
} from './useSearchSuggestions';
export { useSearchHighlight } from './useSearchHighlight';

// Network and offline hooks
export { useNetworkStatus } from './useNetworkStatus';
export { useNetworkState } from './useNetworkState';
export { useOfflineBookmarks } from './useOfflineBookmarks';
export { useOfflineSearch } from './useOfflineSearch';
export { useOfflineSync } from './useOfflineSync';
export { useServiceWorker } from './useServiceWorker';

// AI hooks
export { useAI } from './useAI';

// Keyboard shortcuts
export { 
  useKeyboardShortcuts, 
  useGlobalKeyboardShortcuts, 
  useShortcutHelp 
} from './useKeyboardShortcuts';