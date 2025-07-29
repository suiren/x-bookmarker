import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { syncService, type SyncOptions, type SyncProgress } from '../services/syncService';
import type { SyncJob } from '../types';

// Query keys
export const syncKeys = {
  all: ['sync'] as const,
  jobs: () => [...syncKeys.all, 'jobs'] as const,
  job: (id: string) => [...syncKeys.jobs(), id] as const,
  history: () => [...syncKeys.all, 'history'] as const,
  last: () => [...syncKeys.all, 'last'] as const,
  stats: () => [...syncKeys.all, 'stats'] as const,
};

// Get sync job status
export const useSyncStatus = (jobId: string | null) => {
  return useQuery({
    queryKey: syncKeys.job(jobId || ''),
    queryFn: () => syncService.getSyncStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (data) => {
      // Auto-refresh every 2 seconds if job is running
      if (data?.status === 'running' || data?.status === 'pending') {
        return 2000;
      }
      return false;
    },
    staleTime: 0, // Always fetch fresh data for active jobs
  });
};

// Get sync history
export const useSyncHistory = (limit = 10) => {
  return useQuery({
    queryKey: [...syncKeys.history(), limit],
    queryFn: () => syncService.getSyncHistory(limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Get last sync
export const useLastSync = () => {
  return useQuery({
    queryKey: syncKeys.last(),
    queryFn: () => syncService.getLastSync(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

// Get sync statistics
export const useSyncStats = () => {
  return useQuery({
    queryKey: syncKeys.stats(),
    queryFn: () => syncService.getSyncStats(),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Start sync mutation
export const useStartSync = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options: SyncOptions = {}) => syncService.startSync(options),
    onSuccess: (syncJob) => {
      // Add new job to cache
      queryClient.setQueryData(syncKeys.job(syncJob.id), syncJob);
      
      // Invalidate sync-related queries
      queryClient.invalidateQueries({ queryKey: syncKeys.history() });
      queryClient.invalidateQueries({ queryKey: syncKeys.last() });
      queryClient.invalidateQueries({ queryKey: syncKeys.stats() });
    },
  });
};

// Cancel sync mutation
export const useCancelSync = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => syncService.cancelSync(jobId),
    onSuccess: (_, jobId) => {
      // Invalidate specific job to refresh its status
      queryClient.invalidateQueries({ queryKey: syncKeys.job(jobId) });
      
      // Invalidate history
      queryClient.invalidateQueries({ queryKey: syncKeys.history() });
    },
  });
};

// Setup auto-sync mutation
export const useSetupAutoSync = () => {
  return useMutation({
    mutationFn: ({ enabled, intervalHours }: { enabled: boolean; intervalHours?: number }) =>
      syncService.setupAutoSync(enabled, intervalHours),
  });
};

// Export bookmarks mutation
export const useExportBookmarks = () => {
  return useMutation({
    mutationFn: (format: 'json' | 'csv' = 'json') => syncService.exportBookmarks(format),
    onSuccess: (blob, format) => {
      // Download the file
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bookmarks-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
  });
};

// Import bookmarks mutation
export const useImportBookmarks = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => syncService.importBookmarks(file),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: syncKeys.all });
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
};

// Clear sync data mutation
export const useClearSyncData = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => syncService.clearSyncData(),
    onSuccess: () => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: syncKeys.all });
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
};

// Hook to monitor sync progress with polling
export const useSyncProgress = (jobId: string | null, pollingInterval = 1000) => {
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setProgress(null);
      setIsPolling(false);
      return;
    }

    let intervalId: NodeJS.Timeout;
    
    const pollProgress = async () => {
      try {
        const progressData = await syncService.getSyncProgress(jobId);
        setProgress(progressData);

        // Stop polling if sync is completed or failed
        if (progressData.phase === 'completed' || progressData.phase === 'error') {
          setIsPolling(false);
          clearInterval(intervalId);
        }
      } catch (error) {
        console.error('Failed to fetch sync progress:', error);
        setIsPolling(false);
        clearInterval(intervalId);
      }
    };

    setIsPolling(true);
    intervalId = setInterval(pollProgress, pollingInterval);
    
    // Initial poll
    pollProgress();

    return () => {
      clearInterval(intervalId);
      setIsPolling(false);
    };
  }, [jobId, pollingInterval]);

  return {
    progress,
    isPolling,
  };
};

// Hook for managing sync state with polling
export const useSyncManager = () => {
  const { data: lastSync } = useLastSync();
  const { data: syncStats } = useSyncStats();
  const startSyncMutation = useStartSync();
  const cancelSyncMutation = useCancelSync();

  // Check if there's an active sync job
  const activeSyncJobId = lastSync?.status === 'running' || lastSync?.status === 'pending' 
    ? lastSync.id 
    : null;

  const { data: activeSyncJob } = useSyncStatus(activeSyncJobId);

  const isSync = activeSyncJob?.status === 'running' || activeSyncJob?.status === 'pending';
  const progress = activeSyncJob?.progress || 0;

  const startSync = (options?: SyncOptions) => {
    return startSyncMutation.mutateAsync(options);
  };

  const cancelSync = () => {
    if (activeSyncJobId) {
      return cancelSyncMutation.mutateAsync(activeSyncJobId);
    }
    return Promise.resolve();
  };

  return {
    // State
    isSync,
    activeSyncJob,
    lastSync,
    syncStats,
    progress,
    
    // Actions
    startSync,
    cancelSync,
    
    // Mutation states
    isStarting: startSyncMutation.isPending,
    isCanceling: cancelSyncMutation.isPending,
    startError: startSyncMutation.error,
    cancelError: cancelSyncMutation.error,
  };
};