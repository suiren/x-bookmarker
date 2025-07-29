import { api } from '../lib/api';
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../types';

export const categoryService = {
  // Get all user categories
  getCategories: async (): Promise<Category[]> => {
    return api.get<Category[]>('/categories');
  },

  // Get a single category by ID
  getCategory: async (id: string): Promise<Category> => {
    return api.get<Category>(`/categories/${id}`);
  },

  // Create a new category
  createCategory: async (input: CreateCategoryInput): Promise<Category> => {
    return api.post<Category>('/categories', input);
  },

  // Update an existing category
  updateCategory: async (id: string, input: UpdateCategoryInput): Promise<Category> => {
    return api.put<Category>(`/categories/${id}`, input);
  },

  // Delete a category
  deleteCategory: async (id: string): Promise<void> => {
    return api.delete(`/categories/${id}`);
  },

  // Update category order
  updateCategoryOrder: async (categoryIds: string[]): Promise<void> => {
    return api.put('/categories/order', { categoryIds });
  },

  // Get category tree (hierarchical structure)
  getCategoryTree: async (): Promise<Category[]> => {
    const categories = await categoryService.getCategories();
    return buildCategoryTree(categories);
  },

  // Get default categories for new user
  getDefaultCategories: async (): Promise<Category[]> => {
    return api.get<Category[]>('/categories/defaults');
  },
};

// Helper function to build hierarchical category tree
function buildCategoryTree(categories: Category[]): Category[] {
  const categoryMap = new Map<string, Category & { children?: Category[] }>();
  const rootCategories: Category[] = [];

  // Create map of all categories
  categories.forEach(category => {
    categoryMap.set(category.id, { ...category, children: [] });
  });

  // Build tree structure
  categories.forEach(category => {
    const categoryWithChildren = categoryMap.get(category.id)!;
    
    if (category.parentId) {
      const parent = categoryMap.get(category.parentId);
      if (parent) {
        parent.children!.push(categoryWithChildren);
      } else {
        // Parent not found, treat as root
        rootCategories.push(categoryWithChildren);
      }
    } else {
      // Root category
      rootCategories.push(categoryWithChildren);
    }
  });

  // Sort categories by order
  const sortByOrder = (a: Category, b: Category) => a.order - b.order;
  rootCategories.sort(sortByOrder);
  
  // Sort children recursively
  function sortChildren(cats: (Category & { children?: Category[] })[]): void {
    cats.forEach(cat => {
      if (cat.children) {
        cat.children.sort(sortByOrder);
        sortChildren(cat.children);
      }
    });
  }
  
  sortChildren(rootCategories as (Category & { children?: Category[] })[]);
  
  return rootCategories;
}