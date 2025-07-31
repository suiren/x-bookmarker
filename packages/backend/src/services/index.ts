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
  clientId: process.env.X_CLIENT_ID!,
  clientSecret: process.env.X_CLIENT_SECRET!,
  baseUrl: process.env.X_API_BASE_URL || 'https://api.twitter.com/2',
});

// Service instances
export const bookmarkService = new BookmarkService(db as any, xApiClient);
export const categoryService = new CategoryService();
export const searchService = new SearchService();
export const xApiService = xApiClient;
export const aiService = new AIService();

export {
  BookmarkService,
  CategoryService,
  SearchService,
  XApiClient,
  AIService,
};