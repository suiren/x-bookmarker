import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { useOAuthCallback } from '../hooks/useAuth';

const AuthCallbackPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const oauthMutation = useOAuthCallback();

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      navigate('/login?error=oauth_error');
      return;
    }

    if (!code) {
      console.error('No authorization code received');
      navigate('/login?error=no_code');
      return;
    }

    // Handle OAuth callback
    oauthMutation.mutate(
      { code, state: state || undefined },
      {
        onSuccess: () => {
          // Redirect to dashboard on successful authentication
          navigate('/', { replace: true });
        },
        onError: (error) => {
          console.error('OAuth callback error:', error);
          navigate('/login?error=auth_failed');
        },
      }
    );
  }, [searchParams, navigate, oauthMutation]);

  if (oauthMutation.isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-md w-full space-y-8 p-8 text-center">
          <div className="mx-auto h-16 w-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            認証エラー
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            認証処理中にエラーが発生しました。
          </p>
          <button
            onClick={() => navigate('/login')}
            className="btn-primary"
          >
            ログイン画面に戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md w-full space-y-8 p-8 text-center">
        <div className="mx-auto h-16 w-16 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-primary-600 dark:text-primary-400 animate-spin" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          認証中...
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Xアカウントでの認証を処理しています。しばらくお待ちください。
        </p>
      </div>
    </div>
  );
};

export default AuthCallbackPage;