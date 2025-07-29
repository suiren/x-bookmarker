import { Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { useAuthState } from './hooks/useAuth';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Eager loading for critical pages (immediately needed)
import LoginPage from './pages/LoginPage';
import AuthCallbackPage from './pages/AuthCallbackPage';

// Lazy loading for authenticated pages (loaded on demand)
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const BookmarksPage = lazy(() => import('./pages/BookmarksPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const SyncPage = lazy(() => import('./pages/SyncPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

// Loading fallback component
const PageLoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary-600 dark:text-primary-400 mx-auto mb-4" />
      <p className="text-gray-600 dark:text-gray-400">ページを読み込み中...</p>
    </div>
  </div>
);

function App() {
  const { isAuthenticated, isCheckingAuth } = useAuthState();

  // Show loading screen while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600 dark:text-primary-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">認証状態を確認中...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <Layout>
                <Suspense fallback={<PageLoadingFallback />}>
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/bookmarks" element={<BookmarksPage />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/sync" element={<SyncPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Routes>
                </Suspense>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

export default App;