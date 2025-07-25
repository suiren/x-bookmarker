import { Pool } from 'pg';
import { CreateCategory, UpdateCategory } from '@x-bookmarker/shared';

interface CategoryWithCounts {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  parent_id?: string;
  order: number;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
  bookmark_count?: number;
  parent_name?: string;
  children?: CategoryWithCounts[];
}

interface HierarchicalCategory extends CategoryWithCounts {
  children: HierarchicalCategory[];
}

class CategoryService {
  constructor(private db: Pool) {}

  /**
   * Get all categories for a user in hierarchical structure
   */
  async getUserCategories(
    userId: string,
    includeBookmarkCount: boolean = false
  ): Promise<HierarchicalCategory[]> {
    let query = `
      SELECT 
        c.*
        ${includeBookmarkCount ? `, COUNT(b.id) as bookmark_count` : ''}
      FROM categories c
      ${includeBookmarkCount ? 'LEFT JOIN bookmarks b ON c.id = b.category_id AND b.is_archived = FALSE' : ''}
      WHERE c.user_id = $1
      ${includeBookmarkCount ? 'GROUP BY c.id' : ''}
      ORDER BY c."order" ASC, c.created_at ASC
    `;

    const result = await this.db.query(query, [userId]);

    // Organize categories into hierarchical structure
    const categoriesMap = new Map<string, HierarchicalCategory>();
    const rootCategories: HierarchicalCategory[] = [];

    // First pass: create all categories
    result.rows.forEach(row => {
      const category: HierarchicalCategory = {
        ...row,
        bookmark_count: includeBookmarkCount
          ? parseInt(row.bookmark_count) || 0
          : undefined,
        children: [],
      };
      categoriesMap.set(category.id, category);
    });

    // Second pass: build hierarchy
    categoriesMap.forEach(category => {
      if (category.parent_id) {
        const parent = categoriesMap.get(category.parent_id);
        if (parent) {
          parent.children.push(category);
        } else {
          // Parent not found, treat as root category
          rootCategories.push(category);
        }
      } else {
        rootCategories.push(category);
      }
    });

    return rootCategories;
  }

  /**
   * Get single category by ID with children
   */
  async getCategoryById(
    categoryId: string,
    userId: string
  ): Promise<CategoryWithCounts | null> {
    const result = await this.db.query(
      `
      SELECT 
        c.*,
        COUNT(b.id) as bookmark_count,
        pc.name as parent_name
      FROM categories c
      LEFT JOIN bookmarks b ON c.id = b.category_id AND b.is_archived = FALSE
      LEFT JOIN categories pc ON c.parent_id = pc.id
      WHERE c.id = $1 AND c.user_id = $2
      GROUP BY c.id, pc.name
    `,
      [categoryId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Get child categories
    const childrenResult = await this.db.query(
      `
      SELECT 
        c.*,
        COUNT(b.id) as bookmark_count
      FROM categories c
      LEFT JOIN bookmarks b ON c.id = b.category_id AND b.is_archived = FALSE
      WHERE c.parent_id = $1 AND c.user_id = $2
      GROUP BY c.id
      ORDER BY c."order" ASC, c.created_at ASC
    `,
      [categoryId, userId]
    );

    const category = result.rows[0];
    category.bookmark_count = parseInt(category.bookmark_count) || 0;
    category.children = childrenResult.rows.map(row => ({
      ...row,
      bookmark_count: parseInt(row.bookmark_count) || 0,
    }));

    return category;
  }

  /**
   * Create new category
   */
  async createCategory(
    userId: string,
    data: CreateCategory
  ): Promise<CategoryWithCounts> {
    // Check if category with same name already exists for this user
    const existingCategory = await this.db.query(
      'SELECT id FROM categories WHERE user_id = $1 AND name = $2',
      [userId, data.name]
    );

    if (existingCategory.rows.length > 0) {
      throw new Error('Category with this name already exists');
    }

    // Verify parent category exists if provided
    if (data.parentId) {
      const parentResult = await this.db.query(
        'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
        [data.parentId, userId]
      );

      if (parentResult.rows.length === 0) {
        throw new Error('Parent category not found');
      }

      // Check for circular reference
      const isCircular = await this.checkCircularReference(
        data.parentId,
        userId
      );
      if (isCircular) {
        throw new Error('Circular reference detected');
      }
    }

    // Get next order value if not provided
    let order = data.order;
    if (order === undefined) {
      const orderResult = await this.db.query(
        'SELECT COALESCE(MAX("order"), 0) + 1 as next_order FROM categories WHERE user_id = $1 AND parent_id IS NOT DISTINCT FROM $2',
        [userId, data.parentId || null]
      );
      order = orderResult.rows[0].next_order;
    }

    // Create category
    const result = await this.db.query(
      `
      INSERT INTO categories (
        user_id, name, description, color, icon, parent_id, "order", is_default
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
      [
        userId,
        data.name,
        data.description,
        data.color,
        data.icon,
        data.parentId,
        order,
        false, // User-created categories are never default
      ]
    );

    return result.rows[0];
  }

  /**
   * Update category
   */
  async updateCategory(
    categoryId: string,
    userId: string,
    updates: UpdateCategory
  ): Promise<CategoryWithCounts | null> {
    // Check if category exists and belongs to user
    const existingCategory = await this.db.query(
      'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
      [categoryId, userId]
    );

    if (existingCategory.rows.length === 0) {
      throw new Error('Category not found');
    }

    // Check if name is being changed and if it conflicts
    if (updates.name && updates.name !== existingCategory.rows[0].name) {
      const nameConflict = await this.db.query(
        'SELECT id FROM categories WHERE user_id = $1 AND name = $2 AND id != $3',
        [userId, updates.name, categoryId]
      );

      if (nameConflict.rows.length > 0) {
        throw new Error('Category with this name already exists');
      }
    }

    // Verify parent category exists if provided
    if (updates.parentId !== undefined) {
      if (updates.parentId) {
        // Check if parent category exists
        const parentResult = await this.db.query(
          'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
          [updates.parentId, userId]
        );

        if (parentResult.rows.length === 0) {
          throw new Error('Parent category not found');
        }

        // Check for circular reference
        if (updates.parentId === categoryId) {
          throw new Error('Category cannot be its own parent');
        }

        // Check if the new parent would create a circular reference
        const wouldCreateCircle = await this.wouldCreateCircularReference(
          categoryId,
          updates.parentId,
          userId
        );
        if (wouldCreateCircle) {
          throw new Error('This change would create a circular reference');
        }
      }
    }

    // Build update query
    const updateEntries = Object.entries(updates).filter(
      ([, value]) => value !== undefined
    );
    if (updateEntries.length === 0) {
      return existingCategory.rows[0];
    }

    const setClause = updateEntries
      .map(([field], index) => `"${field}" = $${index + 3}`)
      .join(', ');
    const values = updateEntries.map(([, value]) => value);

    const result = await this.db.query(
      `
      UPDATE categories 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `,
      [categoryId, userId, ...values]
    );

    return result.rows[0];
  }

  /**
   * Delete category and handle bookmarks and child categories
   */
  async deleteCategory(
    categoryId: string,
    userId: string,
    reassignTo?: string
  ): Promise<boolean> {
    // Check if category exists and belongs to user
    const existingCategory = await this.db.query(
      'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
      [categoryId, userId]
    );

    if (existingCategory.rows.length === 0) {
      throw new Error('Category not found');
    }

    // Prevent deletion of default categories
    if (existingCategory.rows[0].is_default) {
      throw new Error('Cannot delete default category');
    }

    // Check if reassign target category exists if provided
    if (reassignTo) {
      const reassignTargetResult = await this.db.query(
        'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
        [reassignTo, userId]
      );

      if (reassignTargetResult.rows.length === 0) {
        throw new Error('Reassign target category not found');
      }
    }

    // Start transaction
    await this.db.query('BEGIN');

    try {
      // Update child categories to have no parent (move to root level)
      await this.db.query(
        'UPDATE categories SET parent_id = NULL WHERE parent_id = $1 AND user_id = $2',
        [categoryId, userId]
      );

      // Reassign bookmarks to new category or set to null
      if (reassignTo) {
        await this.db.query(
          'UPDATE bookmarks SET category_id = $1 WHERE category_id = $2 AND user_id = $3',
          [reassignTo, categoryId, userId]
        );
      } else {
        await this.db.query(
          'UPDATE bookmarks SET category_id = NULL WHERE category_id = $1 AND user_id = $2',
          [categoryId, userId]
        );
      }

      // Delete the category
      await this.db.query(
        'DELETE FROM categories WHERE id = $1 AND user_id = $2',
        [categoryId, userId]
      );

      await this.db.query('COMMIT');
      return true;
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Reorder categories
   */
  async reorderCategories(
    userId: string,
    categoryOrders: { id: string; order: number }[]
  ): Promise<boolean> {
    // Validate that all categories belong to the user
    const categoryIds = categoryOrders.map(item => item.id);
    const ownershipCheck = await this.db.query(
      'SELECT id FROM categories WHERE id = ANY($1) AND user_id = $2',
      [categoryIds, userId]
    );

    if (ownershipCheck.rows.length !== categoryIds.length) {
      throw new Error('Some categories do not exist or do not belong to user');
    }

    // Start transaction
    await this.db.query('BEGIN');

    try {
      // Update order for each category
      for (const item of categoryOrders) {
        await this.db.query(
          'UPDATE categories SET "order" = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
          [item.order, item.id, userId]
        );
      }

      await this.db.query('COMMIT');
      return true;
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Get default categories for a user
   */
  async getDefaultCategories(userId: string): Promise<CategoryWithCounts[]> {
    const result = await this.db.query(
      'SELECT * FROM categories WHERE user_id = $1 AND is_default = TRUE ORDER BY "order" ASC',
      [userId]
    );

    return result.rows;
  }

  /**
   * Create default categories for a new user
   */
  async createDefaultCategories(userId: string): Promise<CategoryWithCounts[]> {
    const defaultCategories = [
      {
        name: '技術・AI',
        description: 'テクノロジーとAI関連の情報',
        color: '#3B82F6',
        icon: 'cpu',
        order: 1,
      },
      {
        name: '趣味・ゲーム',
        description: '趣味とゲーム関連の情報',
        color: '#10B981',
        icon: 'gamepad-2',
        order: 2,
      },
      {
        name: '料理・レシピ',
        description: '料理とレシピの情報',
        color: '#F59E0B',
        icon: 'chef-hat',
        order: 3,
      },
      {
        name: '読書・書籍',
        description: '本と読書に関する情報',
        color: '#8B5CF6',
        icon: 'book',
        order: 4,
      },
      {
        name: '未分類',
        description: 'カテゴリが設定されていない項目',
        color: '#6B7280',
        icon: 'help-circle',
        order: 5,
      },
    ];

    const createdCategories: CategoryWithCounts[] = [];

    await this.db.query('BEGIN');

    try {
      for (const categoryData of defaultCategories) {
        const result = await this.db.query(
          `
          INSERT INTO categories (
            user_id, name, description, color, icon, parent_id, "order", is_default
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `,
          [
            userId,
            categoryData.name,
            categoryData.description,
            categoryData.color,
            categoryData.icon,
            null, // Default categories have no parent
            categoryData.order,
            true, // Mark as default
          ]
        );

        createdCategories.push(result.rows[0]);
      }

      await this.db.query('COMMIT');
      return createdCategories;
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Get category statistics
   */
  async getCategoryStats(
    categoryId: string,
    userId: string
  ): Promise<{
    totalBookmarks: number;
    archivedBookmarks: number;
    recentBookmarks: number;
  }> {
    const result = await this.db.query(
      `
      SELECT 
        COUNT(*) as total_bookmarks,
        COUNT(CASE WHEN is_archived = TRUE THEN 1 END) as archived_bookmarks,
        COUNT(CASE WHEN bookmarked_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_bookmarks
      FROM bookmarks 
      WHERE category_id = $1 AND user_id = $2
    `,
      [categoryId, userId]
    );

    const row = result.rows[0];
    return {
      totalBookmarks: parseInt(row.total_bookmarks) || 0,
      archivedBookmarks: parseInt(row.archived_bookmarks) || 0,
      recentBookmarks: parseInt(row.recent_bookmarks) || 0,
    };
  }

  // Helper methods

  /**
   * Check if setting parentId would create a circular reference
   */
  private async checkCircularReference(
    parentId: string,
    userId: string
  ): Promise<boolean> {
    // This is a simplified check - in practice, you'd want to traverse the entire hierarchy
    const result = await this.db.query(
      `
      WITH RECURSIVE category_tree AS (
        SELECT id, parent_id 
        FROM categories 
        WHERE id = $1 AND user_id = $2
        UNION ALL
        SELECT c.id, c.parent_id
        FROM categories c
        INNER JOIN category_tree ct ON c.id = ct.parent_id
        WHERE c.user_id = $2
      )
      SELECT COUNT(*) as count
      FROM category_tree 
      WHERE parent_id = $1
    `,
      [parentId, userId]
    );

    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Check if changing category's parent would create a circular reference
   */
  private async wouldCreateCircularReference(
    categoryId: string,
    newParentId: string,
    userId: string
  ): Promise<boolean> {
    // Check if newParentId is a descendant of categoryId
    const result = await this.db.query(
      `
      WITH RECURSIVE descendants AS (
        SELECT id, parent_id 
        FROM categories 
        WHERE parent_id = $1 AND user_id = $2
        UNION ALL
        SELECT c.id, c.parent_id
        FROM categories c
        INNER JOIN descendants d ON c.parent_id = d.id
        WHERE c.user_id = $2
      )
      SELECT COUNT(*) as count 
      FROM descendants 
      WHERE id = $3
    `,
      [categoryId, userId, newParentId]
    );

    return parseInt(result.rows[0].count) > 0;
  }
}

export { CategoryService };
export type { CategoryWithCounts, HierarchicalCategory };
