import { ReactNode, memo, useState, useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import { MobileLayout } from './mobile/MobileLayout';

interface LayoutProps {
  children: ReactNode;
}

const Layout = memo<LayoutProps>(({ children }) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // モバイル画面の場合はMobileLayoutを使用
  if (isMobile) {
    return <MobileLayout>{children}</MobileLayout>;
  }

  // デスクトップ画面の場合は従来のLayoutを使用
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
});

Layout.displayName = 'Layout';

export { Layout };
export default Layout;