import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, 
  Bookmark, 
  Search, 
  BarChart3, 
  User,
  Plus 
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: number;
}

export const MobileNavigation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems: NavItem[] = [
    {
      id: 'home',
      label: 'ホーム',
      icon: <Home className="h-5 w-5" />,
      path: '/dashboard',
    },
    {
      id: 'bookmarks',
      label: 'ブックマーク',
      icon: <Bookmark className="h-5 w-5" />,
      path: '/bookmarks',
    },
    {
      id: 'add',
      label: '追加',
      icon: <Plus className="h-6 w-6" />,
      path: '/add',
    },
    {
      id: 'search',
      label: '検索',
      icon: <Search className="h-5 w-5" />,
      path: '/search',
    },
    {
      id: 'profile',
      label: 'プロフィール',
      icon: <User className="h-5 w-5" />,
      path: '/profile',
    },
  ];

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  const handleNavClick = (item: NavItem) => {
    if (item.id === 'add') {
      // クイック追加モーダルを開く（今後実装）
      console.log('Quick add modal');
      return;
    }
    
    navigate(item.path);

    // ハプティックフィードバック（対応デバイスのみ）
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700">
      <div className="flex justify-around items-center px-2 py-2">
        {navItems.map((item) => {
          const active = isActive(item.path);
          const isAddButton = item.id === 'add';
          
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              className={`
                touch-button relative flex flex-col items-center justify-center px-3 py-2 rounded-lg min-w-0 flex-1
                ${isAddButton 
                  ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-lg' 
                  : active
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600'
                }
              `}
              aria-label={item.label}
            >
              <div className={`
                ${isAddButton ? 'mb-1' : 'mb-1'}
                ${active && !isAddButton ? 'transform scale-110' : ''}
                transition-transform duration-200
              `}>
                {React.cloneElement(item.icon as React.ReactElement, {
                  className: isAddButton ? 'h-6 w-6' : 'h-6 w-6'
                })}
              </div>
              
              <span className={`
                text-xs font-medium truncate max-w-full
                ${isAddButton ? 'text-white' : ''}
              `}>
                {item.label}
              </span>

              {/* バッジ */}
              {item.badge && item.badge > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}

              {/* アクティブインジケーター */}
              {active && !isAddButton && (
                <div className="absolute -top-0.5 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
              )}
            </button>
          );
        })}
      </div>

      {/* セーフエリア対応 */}
      <div className="h-safe-area-inset-bottom bg-white dark:bg-gray-800"></div>
    </nav>
  );
};