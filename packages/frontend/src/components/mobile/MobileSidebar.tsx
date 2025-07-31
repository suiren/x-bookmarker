import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, 
  Settings, 
  Database, 
  BarChart3, 
  Download,
  Upload,
  LogOut,
  HelpCircle,
  User,
  Bookmark,
  Tags,
  Folder
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useLogout } from '../../hooks/useAuth';
import { useCategories } from '../../hooks/useCategories';

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileSidebar: React.FC<MobileSidebarProps> = ({
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const logoutMutation = useLogout();
  const { data: categories = [] } = useCategories();

  const handleNavigation = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleLogout = () => {
    logoutMutation.mutate();
    onClose();
  };

  const menuSections = [
    {
      title: 'メイン',
      items: [
        {
          icon: <BarChart3 className="h-5 w-5" />,
          label: 'ダッシュボード',
          path: '/dashboard',
        },
        {
          icon: <Bookmark className="h-5 w-5" />,
          label: 'すべてのブックマーク',
          path: '/bookmarks',
        },
        {
          icon: <Tags className="h-5 w-5" />,
          label: '検索',
          path: '/search',
        },
      ],
    },
    {
      title: 'カテゴリ',
      items: categories.slice(0, 6).map(category => ({
        icon: <Folder className="h-5 w-5" style={{ color: category.color }} />,
        label: category.name,
        path: `/bookmarks?category=${category.id}`,
        badge: category.bookmarkCount || 0,
      })),
    },
    {
      title: 'データ管理',
      items: [
        {
          icon: <Database className="h-5 w-5" />,
          label: 'データ管理',
          path: '/data',
        },
        {
          icon: <Download className="h-5 w-5" />,
          label: 'エクスポート',
          path: '/data?tab=export',
        },
        {
          icon: <Upload className="h-5 w-5" />,
          label: 'インポート',
          path: '/data?tab=import',
        },
      ],
    },
    {
      title: '設定',
      items: [
        {
          icon: <Settings className="h-5 w-5" />,
          label: '設定',
          path: '/settings',
        },
        {
          icon: <HelpCircle className="h-5 w-5" />,
          label: 'ヘルプ',
          path: '/help',
        },
      ],
    },
  ];

  return (
    <>
      {/* サイドバー */}
      <div
        className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out z-50 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="h-10 w-10 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                <User className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 dark:text-white truncate">
                {user?.displayName}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                @{user?.username}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="touch-button p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="サイドバーを閉じる"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* メニューコンテンツ */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">
            {menuSections.map((section, sectionIndex) => (
              <div key={sectionIndex}>
                <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  {section.title}
                </h3>
                <div className="space-y-1">
                  {section.items.map((item, itemIndex) => (
                    <button
                      key={itemIndex}
                      onClick={() => handleNavigation(item.path)}
                      className={`
                        touch-button w-full flex items-center gap-3 px-4 py-4 rounded-lg text-left
                        text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600
                      `}
                    >
                      <div className="flex-shrink-0">
                        {React.cloneElement(item.icon as React.ReactElement, {
                          className: 'h-6 w-6'
                        })}
                      </div>
                      <span className="flex-1 truncate text-sm font-medium">
                        {item.label}
                      </span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="flex-shrink-0 min-w-[20px] h-5 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 text-xs rounded-full flex items-center justify-center font-medium">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* フッター */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <button
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            className="touch-button w-full flex items-center gap-3 px-4 py-4 rounded-lg text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 dark:active:bg-red-900/30"
          >
            <LogOut className="h-6 w-6 flex-shrink-0" />
            <span className="text-sm font-medium">
              {logoutMutation.isPending ? 'ログアウト中...' : 'ログアウト'}
            </span>
          </button>
          
          {/* アプリ情報 */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              X Bookmarker v1.0.0
            </p>
          </div>
        </div>
      </div>
    </>
  );
};