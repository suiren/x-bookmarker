// Re-export types from shared package for convenience
export * from '@x-bookmarker/shared';

// Frontend-specific types (excludes userId, uses string for dates)
export interface FrontendUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  settings: FrontendUserSettings;
  createdAt: string;
  updatedAt: string;
}

export interface FrontendUserSettings {
  theme: 'light' | 'dark' | 'system';
  viewMode: 'grid' | 'list';
  defaultCategory?: string;
  autoSync: boolean;
  aiSuggestions: boolean;
}

export interface FrontendBookmark {
  id: string;
  xTweetId: string;
  content: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl?: string;
  mediaUrls: string[];
  links: string[];
  hashtags: string[];
  mentions: string[];
  categoryId?: string;
  tags: string[];
  isArchived: boolean;
  bookmarkedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FrontendCategory {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  parentId?: string;
  order: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FrontendTag {
  id: string;
  name: string;
  color?: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FrontendSyncJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  totalItems: number;
  processedItems: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

// Form types
export interface CreateBookmarkInput {
  xTweetId: string;
  content: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl?: string;
  mediaUrls?: string[];
  links?: string[];
  hashtags?: string[];
  mentions?: string[];
  categoryId?: string;
  tags?: string[];
}

export interface UpdateBookmarkInput {
  categoryId?: string;
  tags?: string[];
  isArchived?: boolean;
}

export interface CreateCategoryInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  parentId?: string;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  parentId?: string;
  order?: number;
}

// API response types
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}