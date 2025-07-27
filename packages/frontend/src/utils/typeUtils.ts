/**
 * 型変換ユーティリティ
 * 共有ライブラリ（DB型）とフロントエンド型の変換を行う
 */

import type { 
  Bookmark, 
  Category, 
  Tag, 
  SyncJob,
  User,
} from '@x-bookmarker/shared';
import type { 
  FrontendBookmark, 
  FrontendCategory, 
  FrontendTag, 
  FrontendSyncJob,
  FrontendUser,
} from '../types';

/**
 * Date型を文字列に変換するヘルパー
 */
function dateToString(date: Date): string {
  return date.toISOString();
}

/**
 * 文字列をDate型に変換するヘルパー
 */
function stringToDate(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * DB Bookmark型をFrontend Bookmark型に変換
 */
export function bookmarkToFrontend(bookmark: Bookmark): FrontendBookmark {
  const { userId, ...rest } = bookmark;
  return {
    ...rest,
    bookmarkedAt: dateToString(bookmark.bookmarkedAt),
    createdAt: dateToString(bookmark.createdAt),
    updatedAt: dateToString(bookmark.updatedAt),
  };
}

/**
 * Frontend Bookmark型をDB Bookmark型に変換
 */
export function bookmarkFromFrontend(
  frontendBookmark: Omit<FrontendBookmark, 'id' | 'createdAt' | 'updatedAt'>, 
  userId: string
): Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    ...frontendBookmark,
    userId,
    bookmarkedAt: stringToDate(frontendBookmark.bookmarkedAt),
  };
}

/**
 * DB Category型をFrontend Category型に変換
 */
export function categoryToFrontend(category: Category): FrontendCategory {
  const { userId, ...rest } = category;
  return {
    ...rest,
    createdAt: dateToString(category.createdAt),
    updatedAt: dateToString(category.updatedAt),
  };
}

/**
 * Frontend Category型をDB Category型に変換
 */
export function categoryFromFrontend(
  frontendCategory: Omit<FrontendCategory, 'id' | 'createdAt' | 'updatedAt'>,
  userId: string
): Omit<Category, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    ...frontendCategory,
    userId,
  };
}

/**
 * DB Tag型をFrontend Tag型に変換
 */
export function tagToFrontend(tag: Tag): FrontendTag {
  const { userId, ...rest } = tag;
  return {
    ...rest,
    createdAt: dateToString(tag.createdAt),
    updatedAt: dateToString(tag.updatedAt),
  };
}

/**
 * DB SyncJob型をFrontend SyncJob型に変換
 */
export function syncJobToFrontend(syncJob: SyncJob): FrontendSyncJob {
  const { userId, ...rest } = syncJob;
  return {
    ...rest,
    startedAt: syncJob.startedAt ? dateToString(syncJob.startedAt) : undefined,
    completedAt: syncJob.completedAt ? dateToString(syncJob.completedAt) : undefined,
  };
}

/**
 * DB User型をFrontend User型に変換
 */
export function userToFrontend(user: User): FrontendUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    settings: {
      theme: user.settings.theme,
      viewMode: user.settings.viewMode,
      defaultCategory: user.settings.defaultCategory,
      autoSync: user.settings.autoSync,
      aiSuggestions: user.settings.aiSuggestions,
    },
    createdAt: dateToString(user.createdAt),
    updatedAt: dateToString(user.updatedAt),
  };
}

/**
 * 配列変換のヘルパー
 */
export function bookmarksToFrontend(bookmarks: Bookmark[]): FrontendBookmark[] {
  return bookmarks.map(bookmarkToFrontend);
}

export function categoriesToFrontend(categories: Category[]): FrontendCategory[] {
  return categories.map(categoryToFrontend);
}

export function tagsToFrontend(tags: Tag[]): FrontendTag[] {
  return tags.map(tagToFrontend);
}

export function syncJobsToFrontend(syncJobs: SyncJob[]): FrontendSyncJob[] {
  return syncJobs.map(syncJobToFrontend);
}