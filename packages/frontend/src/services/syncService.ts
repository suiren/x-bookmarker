import { api } from '../lib/api';
import type { SyncJob } from '../types';

export interface SyncOptions {
  fullSync?: boolean;
  categoryMapping?: Record<string, string>;
}

export interface SyncProgress {
  phase: 'initializing' | 'fetching' | 'processing' | 'storing' | 'completing' | 'completed' | 'error';
  current: number;
  total: number;
  message: string;
  errors?: string[];
}

export const syncService = {
  // Start bookmark sync from X
  startSync: async (options: SyncOptions = {}): Promise<SyncJob> => {
    return api.post<SyncJob>('/sync/start', options);
  },

  // Get sync job status
  getSyncStatus: async (jobId: string): Promise<SyncJob> => {
    return api.get<SyncJob>(`/sync/status/${jobId}`);
  },

  // Get sync history
  getSyncHistory: async (limit = 10): Promise<SyncJob[]> => {
    return api.get<SyncJob[]>('/sync/history', { limit });
  },

  // Cancel ongoing sync
  cancelSync: async (jobId: string): Promise<void> => {
    return api.post(`/sync/${jobId}/cancel`);
  },

  // Get last sync info
  getLastSync: async (): Promise<SyncJob | null> => {
    try {
      return await api.get<SyncJob>('/sync/last');
    } catch {
      return null;
    }
  },

  // Auto-sync setup
  setupAutoSync: async (enabled: boolean, intervalHours = 24): Promise<void> => {
    return api.put('/sync/auto', { enabled, intervalHours });
  },

  // Get sync progress with polling
  getSyncProgress: async (jobId: string): Promise<SyncProgress> => {
    return api.get<SyncProgress>(`/sync/${jobId}/progress`);
  },

  // Export bookmarks
  exportBookmarks: async (format: 'json' | 'csv' = 'json'): Promise<Blob> => {
    const token = localStorage.getItem('auth_token');
    const response = await fetch('/api/sync/export', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': format === 'json' ? 'application/json' : 'text/csv',
      },
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }

    return response.blob();
  },

  // Import bookmarks from file
  importBookmarks: async (file: File): Promise<SyncJob> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const token = localStorage.getItem('auth_token');
    const response = await fetch('/api/sync/import', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Import failed: ${response.statusText}`);
    }

    return response.json();
  },

  // Get sync statistics
  getSyncStats: async (): Promise<{
    totalSyncs: number;
    successfulSyncs: number;
    lastSyncAt?: string;
    totalBookmarksImported: number;
  }> => {
    return api.get('/sync/stats');
  },

  // Clear all synced data
  clearSyncData: async (): Promise<void> => {
    return api.delete('/sync/data');
  },
};