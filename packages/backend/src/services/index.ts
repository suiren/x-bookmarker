import { Pool } from 'pg';
import { BookmarkService } from './bookmarkService';
import { CategoryService } from './categoryService';
import { SearchService } from './searchService';
import { XApiClient } from './xApiClient';
import { DatabaseService } from './databaseService';
import { AIService } from './aiService';

// Database instance
const db = DatabaseService.getInstance();

// X API Client instance
const xApiClient = new XApiClient({
  bearerToken: process.env.X_BEARER_TOKEN!,
  clientId: process.env.X_CLIENT_ID!,
  clientSecret: process.env.X_CLIENT_SECRET!,
  baseURL: process.env.X_API_BASE_URL || 'https://api.twitter.com/2',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
  rateLimitBuffer: 5,
});

// Service instances
export const bookmarkService = new BookmarkService(db as any, xApiClient);
export const categoryService = new CategoryService(db as any);
export const searchService = new SearchService(db as any);
export const xApiService = xApiClient;
export const aiService = new AIService();

export {
  BookmarkService,
  CategoryService,
  SearchService,
  XApiClient,
  AIService,
};