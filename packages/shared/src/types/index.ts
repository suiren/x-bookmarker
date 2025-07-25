import type { UserSettings } from '../schemas';

export interface User {
  id: string;
  xUserId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  settings: UserSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface Bookmark {
  id: string;
  userId: string;
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
  bookmarkedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  userId: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  parentId?: string;
  order: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tag {
  id: string;
  userId: string;
  name: string;
  color?: string;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
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
  userId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  totalItems: number;
  processedItems: number;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface XApiTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface XApiUser {
  id: string;
  username: string;
  name: string;
  profileImageUrl?: string;
}

export interface XApiTweet {
  id: string;
  text: string;
  authorId: string;
  createdAt: string;
  attachments?: {
    mediaKeys?: string[];
  };
  entities?: {
    urls?: Array<{
      url: string;
      expandedUrl: string;
      displayUrl: string;
    }>;
    hashtags?: Array<{
      start: number;
      end: number;
      tag: string;
    }>;
    mentions?: Array<{
      start: number;
      end: number;
      username: string;
    }>;
  };
}

export interface XApiMedia {
  mediaKey: string;
  type: 'photo' | 'video' | 'animated_gif';
  url?: string;
  previewImageUrl?: string;
  width?: number;
  height?: number;
}

export interface AIAnalysisResult {
  suggestedCategories: Array<{
    categoryName: string;
    confidence: number;
  }>;
  suggestedTags: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  language: string;
  topics: string[];
}

export type SortDirection = 'asc' | 'desc';
export type ViewMode = 'grid' | 'list';
export type Theme = 'light' | 'dark';
export type SyncStatus = 'pending' | 'running' | 'completed' | 'failed';
