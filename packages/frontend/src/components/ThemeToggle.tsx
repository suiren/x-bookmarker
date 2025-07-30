import { Sun, Moon, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';

const ThemeToggle = () => {
  const { user, updateSettings } = useAuthStore();
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(
    user?.settings.theme || 'system'
  );
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const applyTheme = (themeMode: string) => {
      if (themeMode === 'dark' || 
          (themeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme(theme);
    
    // システムテーマ変更の監視
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  // ユーザー設定が変更されたときにローカル状態を更新
  useEffect(() => {
    if (user?.settings.theme && user.settings.theme !== theme) {
      setTheme(user.settings.theme);
    }
  }, [user?.settings.theme]);

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    updateSettings({ theme: newTheme });
    setIsDropdownOpen(false);
  };

  // 現在のテーマアイコンを決定
  const getCurrentIcon = () => {
    if (theme === 'system') {
      return <Monitor className="w-5 h-5" />;
    }
    const isDark = theme === 'dark' || 
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    return isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />;
  };

  const themeOptions = [
    { value: 'light', label: 'ライト', icon: <Sun className="w-4 h-4" /> },
    { value: 'dark', label: 'ダーク', icon: <Moon className="w-4 h-4" /> },
    { value: 'system', label: 'システム', icon: <Monitor className="w-4 h-4" /> },
  ] as const;

  return (
    <div className="relative">
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        aria-label="テーマ切り替え"
      >
        {getCurrentIcon()}
      </button>

      {isDropdownOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsDropdownOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20">
            <div className="py-1">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleThemeChange(option.value)}
                  className={`w-full text-left flex items-center px-4 py-2 text-sm transition-colors ${
                    theme === option.value
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="mr-3">{option.icon}</span>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ThemeToggle;