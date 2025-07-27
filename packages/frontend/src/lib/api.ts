import axios, { AxiosError, AxiosResponse } from 'axios';
import { useAuthStore } from '../stores/authStore';

// API Base URL from environment or default
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Create axios instance with default config
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const { token } = useAuthStore.getState();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError) => {
    const { logout } = useAuthStore.getState();
    
    // Handle 401 Unauthorized - token expired or invalid
    if (error.response?.status === 401) {
      logout();
      window.location.href = '/login';
      return Promise.reject(new Error('認証が失効しました。再度ログインしてください。'));
    }
    
    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      return Promise.reject(new Error('この操作を実行する権限がありません。'));
    }
    
    // Handle 404 Not Found
    if (error.response?.status === 404) {
      return Promise.reject(new Error('要求されたリソースが見つかりません。'));
    }
    
    // Handle 429 Rate Limited
    if (error.response?.status === 429) {
      return Promise.reject(new Error('リクエストが多すぎます。しばらく待ってから再試行してください。'));
    }
    
    // Handle 500 Server Error
    if (error.response?.status === 500) {
      return Promise.reject(new Error('サーバーエラーが発生しました。しばらく待ってから再試行してください。'));
    }
    
    // Handle network errors
    if (!error.response) {
      return Promise.reject(new Error('ネットワークエラーが発生しました。接続を確認してください。'));
    }
    
    // Handle other errors
    const errorMessage = error.response?.data?.error || error.message || '予期しないエラーが発生しました。';
    return Promise.reject(new Error(errorMessage));
  }
);

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Generic API request function
export const apiRequest = async <T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  data?: any,
  params?: any
): Promise<T> => {
  try {
    const response = await apiClient.request({
      method,
      url,
      data,
      params,
    });
    
    // Handle API response format
    if (response.data.success === false) {
      throw new Error(response.data.error || 'APIエラーが発生しました');
    }
    
    return response.data.data || response.data;
  } catch (error) {
    throw error;
  }
};

// Convenience methods
export const api = {
  get: <T = any>(url: string, params?: any) => 
    apiRequest<T>('GET', url, undefined, params),
    
  post: <T = any>(url: string, data?: any) => 
    apiRequest<T>('POST', url, data),
    
  put: <T = any>(url: string, data?: any) => 
    apiRequest<T>('PUT', url, data),
    
  delete: <T = any>(url: string) => 
    apiRequest<T>('DELETE', url),
};