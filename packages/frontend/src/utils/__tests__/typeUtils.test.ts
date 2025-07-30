/**
 * 型変換ユーティリティのテスト
 */

import { describe, it, expect } from 'vitest';
import {
  bookmarkToFrontend,
  bookmarkFromFrontend,
  categoryToFrontend,
  categoryFromFrontend,
  tagToFrontend,
  syncJobToFrontend,
  userToFrontend,
  bookmarksToFrontend,
  categoriesToFrontend,
  tagsToFrontend,
  syncJobsToFrontend,
} from '../typeUtils';
import type { Bookmark, Category, Tag, SyncJob, User } from '@x-bookmarker/shared';

describe('typeUtils', () => {
  describe('bookmarkToFrontend', () => {
    it('should convert DB Bookmark to Frontend Bookmark', () => {
      const dbBookmark: Bookmark = {
        id: 'bookmark-1',
        userId: 'user-1',
        xTweetId: '1234567890',
        content: 'テストブックマーク',
        authorUsername: 'testuser',
        authorDisplayName: 'Test User',
        authorAvatarUrl: 'https://example.com/avatar.jpg',
        mediaUrls: ['https://example.com/image.jpg'],
        links: ['https://example.com'],
        hashtags: ['test'],
        mentions: ['@user'],
        categoryId: 'category-1',
        tags: ['tag1', 'tag2'],
        isArchived: false,
        bookmarkedAt: new Date('2024-01-15T10:30:00Z'),
        createdAt: new Date('2024-01-15T10:30:00Z'),
        updatedAt: new Date('2024-01-15T10:30:00Z'),
      };

      const frontendBookmark = bookmarkToFrontend(dbBookmark);

      expect(frontendBookmark).toEqual({
        id: 'bookmark-1',
        xTweetId: '1234567890',
        content: 'テストブックマーク',
        authorUsername: 'testuser',
        authorDisplayName: 'Test User',
        authorAvatarUrl: 'https://example.com/avatar.jpg',
        mediaUrls: ['https://example.com/image.jpg'],
        links: ['https://example.com'],
        hashtags: ['test'],
        mentions: ['@user'],
        categoryId: 'category-1',
        tags: ['tag1', 'tag2'],
        isArchived: false,
        bookmarkedAt: '2024-01-15T10:30:00.000Z',
        createdAt: '2024-01-15T10:30:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
      });

      // userIdが除外されていることを確認
      expect(frontendBookmark).not.toHaveProperty('userId');
    });
  });

  describe('bookmarkFromFrontend', () => {
    it('should convert Frontend Bookmark to DB Bookmark format', () => {
      const frontendBookmark = {
        xTweetId: '1234567890',
        content: 'テストブックマーク',
        authorUsername: 'testuser',
        authorDisplayName: 'Test User',
        authorAvatarUrl: 'https://example.com/avatar.jpg',
        mediaUrls: ['https://example.com/image.jpg'],
        links: ['https://example.com'],
        hashtags: ['test'],
        mentions: ['@user'],
        categoryId: 'category-1',
        tags: ['tag1', 'tag2'],
        isArchived: false,
        bookmarkedAt: '2024-01-15T10:30:00Z',
      };

      const dbBookmark = bookmarkFromFrontend(frontendBookmark, 'user-1');

      expect(dbBookmark).toEqual({
        xTweetId: '1234567890',
        content: 'テストブックマーク',
        authorUsername: 'testuser',
        authorDisplayName: 'Test User',
        authorAvatarUrl: 'https://example.com/avatar.jpg',
        mediaUrls: ['https://example.com/image.jpg'],
        links: ['https://example.com'],
        hashtags: ['test'],
        mentions: ['@user'],
        categoryId: 'category-1',
        tags: ['tag1', 'tag2'],
        isArchived: false,
        userId: 'user-1',
        bookmarkedAt: new Date('2024-01-15T10:30:00Z'),
      });
    });
  });

  describe('categoryToFrontend', () => {
    it('should convert DB Category to Frontend Category', () => {
      const dbCategory: Category = {
        id: 'category-1',
        userId: 'user-1',
        name: 'テストカテゴリ',
        description: 'テスト用カテゴリ',
        color: '#3B82F6',
        icon: 'folder',
        parentId: undefined,
        order: 1,
        isDefault: false,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        updatedAt: new Date('2024-01-15T10:30:00Z'),
      };

      const frontendCategory = categoryToFrontend(dbCategory);

      expect(frontendCategory).toEqual({
        id: 'category-1',
        name: 'テストカテゴリ',
        description: 'テスト用カテゴリ',
        color: '#3B82F6',
        icon: 'folder',
        parentId: undefined,
        order: 1,
        isDefault: false,
        createdAt: '2024-01-15T10:30:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
      });

      expect(frontendCategory).not.toHaveProperty('userId');
    });
  });

  describe('categoryFromFrontend', () => {
    it('should convert Frontend Category to DB Category format', () => {
      const frontendCategory = {
        name: 'テストカテゴリ',
        description: 'テスト用カテゴリ',
        color: '#3B82F6',
        icon: 'folder',
        parentId: undefined,
        order: 1,
        isDefault: false,
      };

      const dbCategory = categoryFromFrontend(frontendCategory, 'user-1');

      expect(dbCategory).toEqual({
        name: 'テストカテゴリ',
        description: 'テスト用カテゴリ',
        color: '#3B82F6',
        icon: 'folder',
        parentId: undefined,
        order: 1,
        isDefault: false,
        userId: 'user-1',
      });
    });
  });

  describe('tagToFrontend', () => {
    it('should convert DB Tag to Frontend Tag', () => {
      const dbTag: Tag = {
        id: 'tag-1',
        userId: 'user-1',
        name: 'テストタグ',
        color: '#10B981',
        usageCount: 5,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        updatedAt: new Date('2024-01-15T10:30:00Z'),
      };

      const frontendTag = tagToFrontend(dbTag);

      expect(frontendTag).toEqual({
        id: 'tag-1',
        name: 'テストタグ',
        color: '#10B981',
        usageCount: 5,
        createdAt: '2024-01-15T10:30:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
      });

      expect(frontendTag).not.toHaveProperty('userId');
    });
  });

  describe('syncJobToFrontend', () => {
    it('should convert DB SyncJob to Frontend SyncJob', () => {
      const dbSyncJob: SyncJob = {
        id: 'job-1',
        userId: 'user-1',
        status: 'running',
        progress: 50,
        totalItems: 100,
        processedItems: 50,
        errorMessage: undefined,
        startedAt: new Date('2024-01-15T10:30:00Z'),
        completedAt: undefined,
      };

      const frontendSyncJob = syncJobToFrontend(dbSyncJob);

      expect(frontendSyncJob).toEqual({
        id: 'job-1',
        status: 'running',
        progress: 50,
        totalItems: 100,
        processedItems: 50,
        errorMessage: undefined,
        startedAt: '2024-01-15T10:30:00.000Z',
        completedAt: undefined,
      });

      expect(frontendSyncJob).not.toHaveProperty('userId');
    });

    it('should handle completed sync job', () => {
      const dbSyncJob: SyncJob = {
        id: 'job-1',
        userId: 'user-1',
        status: 'completed',
        progress: 100,
        totalItems: 100,
        processedItems: 100,
        errorMessage: undefined,
        startedAt: new Date('2024-01-15T10:30:00Z'),
        completedAt: new Date('2024-01-15T10:35:00Z'),
      };

      const frontendSyncJob = syncJobToFrontend(dbSyncJob);

      expect(frontendSyncJob.completedAt).toBe('2024-01-15T10:35:00.000Z');
    });
  });

  describe('userToFrontend', () => {
    it('should convert DB User to Frontend User', () => {
      const dbUser: User = {
        id: 'user-1',
        xUserId: 'x-user-1',
        username: 'testuser',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        accessToken: 'token123',
        refreshToken: 'refresh123',
        tokenExpiresAt: new Date('2024-01-15T10:30:00Z'),
        settings: {
          theme: 'light',
          viewMode: 'grid',
          defaultCategory: 'category-1',
          autoSync: true,
          aiSuggestions: true,
        },
        createdAt: new Date('2024-01-15T10:30:00Z'),
        updatedAt: new Date('2024-01-15T10:30:00Z'),
      };

      const frontendUser = userToFrontend(dbUser);

      expect(frontendUser).toEqual({
        id: 'user-1',
        username: 'testuser',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        settings: {
          theme: 'light',
          viewMode: 'grid',
          defaultCategory: 'category-1',
          autoSync: true,
          aiSuggestions: true,
        },
        createdAt: '2024-01-15T10:30:00.000Z',
        updatedAt: '2024-01-15T10:30:00.000Z',
      });

      // 機密情報が除外されていることを確認
      expect(frontendUser).not.toHaveProperty('xUserId');
      expect(frontendUser).not.toHaveProperty('accessToken');
      expect(frontendUser).not.toHaveProperty('refreshToken');
      expect(frontendUser).not.toHaveProperty('tokenExpiresAt');
    });
  });

  describe('array conversion helpers', () => {
    it('should convert array of bookmarks', () => {
      const dbBookmarks: Bookmark[] = [
        {
          id: 'bookmark-1',
          userId: 'user-1',
          xTweetId: '1234567890',
          content: 'テストブックマーク1',
          authorUsername: 'testuser1',
          authorDisplayName: 'Test User 1',
          mediaUrls: [],
          links: [],
          hashtags: [],
          mentions: [],
          tags: [],
          isArchived: false,
          bookmarkedAt: new Date('2024-01-15T10:30:00Z'),
          createdAt: new Date('2024-01-15T10:30:00Z'),
          updatedAt: new Date('2024-01-15T10:30:00Z'),
        },
        {
          id: 'bookmark-2',
          userId: 'user-1',
          xTweetId: '0987654321',
          content: 'テストブックマーク2',
          authorUsername: 'testuser2',
          authorDisplayName: 'Test User 2',
          mediaUrls: [],
          links: [],
          hashtags: [],
          mentions: [],
          tags: [],
          isArchived: false,
          bookmarkedAt: new Date('2024-01-15T10:30:00Z'),
          createdAt: new Date('2024-01-15T10:30:00Z'),
          updatedAt: new Date('2024-01-15T10:30:00Z'),
        },
      ];

      const frontendBookmarks = bookmarksToFrontend(dbBookmarks);

      expect(frontendBookmarks).toHaveLength(2);
      expect(frontendBookmarks[0]).not.toHaveProperty('userId');
      expect(frontendBookmarks[1]).not.toHaveProperty('userId');
      expect(frontendBookmarks[0].id).toBe('bookmark-1');
      expect(frontendBookmarks[1].id).toBe('bookmark-2');
    });

    it('should convert array of categories', () => {
      const dbCategories: Category[] = [
        {
          id: 'category-1',
          userId: 'user-1',
          name: 'カテゴリ1',
          color: '#3B82F6',
          icon: 'folder',
          order: 1,
          isDefault: false,
          createdAt: new Date('2024-01-15T10:30:00Z'),
          updatedAt: new Date('2024-01-15T10:30:00Z'),
        },
      ];

      const frontendCategories = categoriesToFrontend(dbCategories);

      expect(frontendCategories).toHaveLength(1);
      expect(frontendCategories[0]).not.toHaveProperty('userId');
      expect(frontendCategories[0].id).toBe('category-1');
    });
  });
});