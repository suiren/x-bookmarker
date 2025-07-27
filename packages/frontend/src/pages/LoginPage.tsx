import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Twitter, Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { authService } from '../services/authService';

const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Error messages mapping
  const errorMessages = {
    oauth_error: 'OAuth認証中にエラーが発生しました。',
    no_code: '認証コードが受信されませんでした。',
    auth_failed: '認証に失敗しました。再度お試しください。',
  };

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }

    // Check for error parameters
    const errorParam = searchParams.get('error');
    if (errorParam && errorMessages[errorParam as keyof typeof errorMessages]) {
      setError(errorMessages[errorParam as keyof typeof errorMessages]);
    }
  }, [isAuthenticated, navigate, searchParams]);

  const handleXLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // X OAuth認証を開始
      authService.initiateXLogin();
    } catch (error) {
      console.error('Authentication error:', error);
      setError('認証の開始に失敗しました。');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-primary-600 rounded-full flex items-center justify-center">
            <Twitter className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900 dark:text-gray-100">
            X Bookmarker
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Xのブックマークを効率的に整理・管理
          </p>
        </div>
        
        <div className="mt-8 space-y-6">
          {/* Error Display */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
                <span className="text-sm text-red-800 dark:text-red-200">{error}</span>
              </div>
            </div>
          )}

          <div className="card p-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                ログイン
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Xアカウントでログインして、ブックマークの管理を始めましょう
              </p>
              
              <button
                onClick={handleXLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center space-x-2 bg-black hover:bg-gray-800 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Twitter className="w-5 h-5" />
                )}
                <span>
                  {isLoading ? 'ログイン中...' : 'Xでログイン'}
                </span>
              </button>
            </div>
          </div>
          
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ログインすることで、
              <a href="/privacy" className="text-primary-600 hover:text-primary-500">
                プライバシーポリシー
              </a>
              と
              <a href="/terms" className="text-primary-600 hover:text-primary-500">
                利用規約
              </a>
              に同意したものとみなします。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;