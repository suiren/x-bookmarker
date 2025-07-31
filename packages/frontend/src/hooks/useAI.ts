import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../utils/apiClient';
import { AIAnalysisResult, APIResponse } from '@x-bookmarker/shared/types';

interface AIConfig {
  provider: 'openai' | 'anthropic' | 'huggingface';
  model: string;
  enabled: boolean;
}

interface AIHealthStatus {
  enabled: boolean;
  provider: string;
  model: string;
  status: 'healthy' | 'disabled' | 'error';
}

interface AnalyzeContentRequest {
  content: string;
  bookmarkId?: string;
}

interface BatchAnalyzeRequest {
  bookmarkIds: string[];
}

// Get AI configuration
export const useAIConfig = () => {
  return useQuery<APIResponse<AIConfig>>({
    queryKey: ['ai', 'config'],
    queryFn: () => apiClient.get('/ai/config'),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Update AI configuration
export const useUpdateAIConfig = () => {
  const queryClient = useQueryClient();
  
  return useMutation<APIResponse<AIConfig>, Error, Partial<AIConfig>>({
    mutationFn: (config) => apiClient.put('/ai/config', config),
    onSuccess: () => {
      // Invalidate and refetch AI config
      queryClient.invalidateQueries({ queryKey: ['ai', 'config'] });
      queryClient.invalidateQueries({ queryKey: ['ai', 'health'] });
    },
    onError: (error) => {
      console.error('Failed to update AI config:', error);
    },
  });
};

// Check AI service health
export const useAIHealth = () => {
  return useQuery<APIResponse<AIHealthStatus>>({
    queryKey: ['ai', 'health'],
    queryFn: () => apiClient.get('/ai/health'),
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
};

// Analyze content
export const useAnalyzeContent = () => {
  return useMutation<APIResponse<AIAnalysisResult>, Error, AnalyzeContentRequest>({
    mutationFn: (request) => apiClient.post('/ai/analyze', request),
    onError: (error) => {
      console.error('Failed to analyze content:', error);
    },
  });
};

// Batch analyze bookmarks
export const useBatchAnalyze = () => {
  return useMutation<EventSource, Error, BatchAnalyzeRequest>({
    mutationFn: async (request) => {
      // Create EventSource for server-sent events
      const eventSource = new EventSource(
        `${import.meta.env.VITE_API_BASE_URL}/ai/batch-analyze`,
        {
          withCredentials: true,
        }
      );

      // Send the request via POST (EventSource doesn't support POST directly)
      // This is a simplified approach - in practice, you might want to use fetch
      // and then create a custom event stream handler
      await apiClient.post('/ai/batch-analyze', request);
      
      return eventSource;
    },
    onError: (error) => {
      console.error('Failed to start batch analysis:', error);
    },
  });
};

// Hook for handling batch analysis with progress
export const useBatchAnalyzeWithProgress = () => {
  const analyzeMutation = useBatchAnalyze();

  const startBatchAnalysis = (
    bookmarkIds: string[],
    onProgress?: (processed: number, total: number, progress: number) => void,
    onComplete?: (results: Record<string, AIAnalysisResult>) => void,
    onError?: (error: string) => void
  ) => {
    analyzeMutation.mutate(
      { bookmarkIds },
      {
        onSuccess: (eventSource) => {
          eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              
              switch (data.type) {
                case 'progress':
                  onProgress?.(data.processed, data.total, data.progress);
                  break;
                case 'complete':
                  onComplete?.(data.results);
                  eventSource.close();
                  break;
                case 'error':
                  onError?.(data.error);
                  eventSource.close();
                  break;
              }
            } catch (error) {
              console.error('Failed to parse SSE data:', error);
              onError?.('Failed to parse progress data');
            }
          };

          eventSource.onerror = () => {
            onError?.('Connection to AI service lost');
            eventSource.close();
          };
        },
        onError: (error) => {
          onError?.(error.message || 'Failed to start batch analysis');
        },
      }
    );
  };

  return {
    startBatchAnalysis,
    isLoading: analyzeMutation.isPending,
    error: analyzeMutation.error,
  };
};