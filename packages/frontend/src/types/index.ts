// Re-export types from shared package for convenience
export * from '@x-bookmarker/shared';

// Additional frontend-specific types
export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  settings: UserSettings;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  viewMode: 'grid' | 'list';
  defaultCategory?: string;
  autoSync: boolean;
  aiSuggestions: boolean;
}

export interface Bookmark {
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

export interface Category {
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

export interface Tag {
  id: string;
  name: string;
  color?: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SearchQuery {
  text?: string;
  categoryIds?: string[];
  tags?: string[];
  authorUsername?: string;
  dateFrom?: string;
  dateTo?: string;
  hasMedia?: boolean;
  hasLinks?: boolean;
  sortBy: 'relevance' | 'date' | 'author';
  sortOrder: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export interface SearchResult {
  bookmarks: Bookmark[];
  totalCount: number;
  facets: {
    categories: { id: string; name: string; count: number }[];
    tags: { name: string; count: number }[];
    authors: { username: string; displayName: string; count: number }[];
  };
  queryTime: number;
}

export interface SyncJob {
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