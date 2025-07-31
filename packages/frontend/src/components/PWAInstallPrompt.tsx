import React, { useState } from 'react';
import { Download, X, Smartphone, Monitor } from 'lucide-react';
import { usePWA } from '../hooks/usePWA';

interface PWAInstallPromptProps {
  onClose?: () => void;
  className?: string;
}

export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({
  onClose,
  className = '',
}) => {
  const { isInstallable, installPWA, isStandalone } = usePWA();
  const [isInstalling, setIsInstalling] = useState(false);
  const [showDetailed, setShowDetailed] = useState(false);

  // スタンドアロンモードまたはインストール不可能な場合は表示しない
  if (isStandalone || !isInstallable) {
    return null;
  }

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      const success = await installPWA();
      if (success) {
        onClose?.();
      }
    } catch (error) {
      console.error('Installation failed:', error);
    } finally {
      setIsInstalling(false);
    }
  };

  const features = [
    {
      icon: <Smartphone className="h-5 w-5" />,
      title: 'ホーム画面に追加',
      description: 'アプリのようにワンタップでアクセス'
    },
    {
      icon: <Monitor className="h-5 w-5" />,
      title: 'オフライン対応',
      description: 'ネットがなくても基本機能が利用可能'
    },
    {
      icon: <Download className="h-5 w-5" />,
      title: '高速起動',
      description: 'ブラウザより素早くアプリが起動'
    }
  ];

  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg ${className}`}>
      {/* コンパクト表示 */}
      {!showDetailed ? (
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                <Download className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                  アプリをインストール
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ホーム画面から簡単アクセス
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDetailed(true)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                詳細
              </button>
              <button
                onClick={handleInstall}
                disabled={isInstalling}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {isInstalling ? 'インストール中...' : 'インストール'}
              </button>
              <button
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 詳細表示 */
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-xl flex items-center justify-center">
                <Download className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  X Bookmarkerをインストール
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  より快適にご利用いただけます
                </p>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="閉じる"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* 機能一覧 */}
          <div className="space-y-3 mb-6">
            {features.map((feature, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                  {React.cloneElement(feature.icon, {
                    className: 'h-4 w-4 text-gray-600 dark:text-gray-400'
                  })}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    {feature.title}
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* アクションボタン */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowDetailed(false)}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              ← 戻る
            </button>
            
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                後で
              </button>
              <button
                onClick={handleInstall}
                disabled={isInstalling}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isInstalling ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    インストール中...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    インストール
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// モバイル専用のフローティングインストールボタン
export const MobileInstallButton: React.FC = () => {
  const { isInstallable, installPWA, isStandalone } = usePWA();
  const [isInstalling, setIsInstalling] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  if (isStandalone || !isInstallable || !isVisible) {
    return null;
  }

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      const success = await installPWA();
      if (success) {
        setIsVisible(false);
      }
    } catch (error) {
      console.error('Installation failed:', error);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="fixed bottom-20 right-4 z-40 md:hidden">
      <div className="bg-blue-600 text-white rounded-full shadow-lg p-3 flex items-center gap-2 max-w-xs">
        <Download className="h-5 w-5 flex-shrink-0" />
        <span className="text-sm font-medium flex-1 min-w-0">
          アプリをインストール
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleInstall}
            disabled={isInstalling}
            className="px-3 py-1 bg-white text-blue-600 text-xs font-medium rounded-full hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            {isInstalling ? '...' : 'GO'}
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="p-1 text-blue-200 hover:text-white rounded-full hover:bg-blue-700 transition-colors"
            aria-label="閉じる"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
};