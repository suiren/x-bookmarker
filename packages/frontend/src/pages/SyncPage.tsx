import SyncManager from '../components/SyncManager';

const SyncPage = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          ブックマーク同期
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Xのブックマークを同期して、効率的に管理しましょう
        </p>
      </div>

      {/* Sync Manager */}
      <SyncManager />
    </div>
  );
};

export default SyncPage;