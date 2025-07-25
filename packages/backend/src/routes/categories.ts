import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import {
  CreateCategorySchema,
  UpdateCategorySchema,
} from '@x-bookmarker/shared';
import { authenticateJWT } from '../middleware/auth';
import { apiRateLimit } from '../middleware/rateLimit';

const router = Router();

// Database connection (will be injected from app)
let db: Pool;

export const setDatabase = (database: Pool): void => {
  db = database;
};

// Apply authentication to all category routes
router.use(authenticateJWT);

/**
 * Get user's categories (hierarchical structure)
 * GET /categories
 */
router.get('/', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    const includeBookmarkCount = req.query.includeCount === 'true';

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

    const result = await db.query(query, [req.user.userId]);

    // Organize categories into hierarchical structure
    const categoriesMap = new Map<string, any>();
    const rootCategories: any[] = [];

    // First pass: create all categories
    result.rows.forEach(row => {
      const category = formatCategory(row, includeBookmarkCount);
      categoriesMap.set(category.id, { ...category, children: [] });
    });

    // Second pass: build hierarchy
    categoriesMap.forEach(category => {
      if (category.parentId) {
        const parent = categoriesMap.get(category.parentId);
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

    res.json({
      success: true,
      data: {
        categories: rootCategories,
        total: result.rows.length,
      },
    });
  } catch (error) {
    console.error('❌ Get categories error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve categories',
      code: 'GET_CATEGORIES_ERROR',
    });
  }
});

/**
 * Get single category by ID
 * GET /categories/:id
 */
router.get('/:id', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    const categoryId = req.params.id;

    const result = await db.query(
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
      [categoryId, req.user.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Category not found',
        code: 'CATEGORY_NOT_FOUND',
      });
      return;
    }

    // Get child categories
    const childrenResult = await db.query(
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
      [categoryId, req.user.userId]
    );

    const category = formatCategory(result.rows[0], true) as any;
    category.parent = result.rows[0].parent_name
      ? {
          id: result.rows[0].parent_id,
          name: result.rows[0].parent_name,
        }
      : null;
    category.children = childrenResult.rows.map(row =>
      formatCategory(row, true)
    );

    res.json({
      success: true,
      data: {
        category,
      },
    });
  } catch (error) {
    console.error('❌ Get category error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve category',
      code: 'GET_CATEGORY_ERROR',
    });
  }
});

/**
 * Create new category
 * POST /categories
 */
router.post('/', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    // Validate request body
    const bodyValidation = CreateCategorySchema.safeParse(req.body);
    if (!bodyValidation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid category data',
        code: 'INVALID_CATEGORY_DATA',
        details: bodyValidation.error.issues,
      });
      return;
    }

    const data = bodyValidation.data;

    // Check if category with same name already exists for this user
    const existingCategory = await db.query(
      'SELECT id FROM categories WHERE user_id = $1 AND name = $2',
      [req.user.userId, data.name]
    );

    if (existingCategory.rows.length > 0) {
      res.status(409).json({
        success: false,
        error: 'Category with this name already exists',
        code: 'CATEGORY_NAME_EXISTS',
      });
      return;
    }

    // Verify parent category exists if provided
    if (data.parentId) {
      const parentResult = await db.query(
        'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
        [data.parentId, req.user.userId]
      );

      if (parentResult.rows.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Parent category not found',
          code: 'PARENT_CATEGORY_NOT_FOUND',
        });
        return;
      }

      // Check for circular reference (prevent category from being its own ancestor)
      const isCircular = await checkCircularReference(
        data.parentId,
        req.user.userId
      );
      if (isCircular) {
        res.status(400).json({
          success: false,
          error: 'Circular reference detected',
          code: 'CIRCULAR_REFERENCE',
        });
        return;
      }
    }

    // Get next order value if not provided
    let order = data.order;
    if (order === undefined) {
      const orderResult = await db.query(
        'SELECT COALESCE(MAX("order"), 0) + 1 as next_order FROM categories WHERE user_id = $1 AND parent_id IS NOT DISTINCT FROM $2',
        [req.user.userId, data.parentId || null]
      );
      order = orderResult.rows[0].next_order;
    }

    // Create category
    const result = await db.query(
      `
      INSERT INTO categories (
        user_id, name, description, color, icon, parent_id, "order", is_default
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
      [
        req.user.userId,
        data.name,
        data.description,
        data.color,
        data.icon,
        data.parentId,
        order,
        false, // User-created categories are never default
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        category: formatCategory(result.rows[0]),
      },
      message: 'Category created successfully',
    });
  } catch (error) {
    console.error('❌ Create category error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create category',
      code: 'CREATE_CATEGORY_ERROR',
    });
  }
});

/**
 * Update category
 * PUT /categories/:id
 */
router.put('/:id', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    const categoryId = req.params.id;

    // Validate request body
    const bodyValidation = UpdateCategorySchema.safeParse(req.body);
    if (!bodyValidation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid update data',
        code: 'INVALID_UPDATE_DATA',
        details: bodyValidation.error.issues,
      });
      return;
    }

    const updates = bodyValidation.data;

    // Check if category exists and belongs to user
    const existingCategory = await db.query(
      'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
      [categoryId, req.user.userId]
    );

    if (existingCategory.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Category not found',
        code: 'CATEGORY_NOT_FOUND',
      });
      return;
    }

    // Check if name is being changed and if it conflicts
    if (updates.name && updates.name !== existingCategory.rows[0].name) {
      const nameConflict = await db.query(
        'SELECT id FROM categories WHERE user_id = $1 AND name = $2 AND id != $3',
        [req.user.userId, updates.name, categoryId]
      );

      if (nameConflict.rows.length > 0) {
        res.status(409).json({
          success: false,
          error: 'Category with this name already exists',
          code: 'CATEGORY_NAME_EXISTS',
        });
        return;
      }
    }

    // Verify parent category exists if provided
    if (updates.parentId !== undefined) {
      if (updates.parentId) {
        // Check if parent category exists
        const parentResult = await db.query(
          'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
          [updates.parentId, req.user.userId]
        );

        if (parentResult.rows.length === 0) {
          res.status(400).json({
            success: false,
            error: 'Parent category not found',
            code: 'PARENT_CATEGORY_NOT_FOUND',
          });
          return;
        }

        // Check for circular reference
        if (updates.parentId === categoryId) {
          res.status(400).json({
            success: false,
            error: 'Category cannot be its own parent',
            code: 'SELF_PARENT_REFERENCE',
          });
          return;
        }

        // Check if the new parent would create a circular reference
        const wouldCreateCircle = await wouldCreateCircularReference(
          categoryId,
          updates.parentId,
          req.user.userId
        );
        if (wouldCreateCircle) {
          res.status(400).json({
            success: false,
            error: 'This change would create a circular reference',
            code: 'CIRCULAR_REFERENCE',
          });
          return;
        }
      }
    }

    // Build update query
    const updateEntries = Object.entries(updates).filter(
      ([, value]) => value !== undefined
    );
    if (updateEntries.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid fields to update',
        code: 'NO_UPDATE_FIELDS',
      });
      return;
    }

    const setClause = updateEntries
      .map(([field], index) => `"${field}" = $${index + 3}`)
      .join(', ');
    const values = updateEntries.map(([, value]) => value);

    const result = await db.query(
      `
      UPDATE categories 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `,
      [categoryId, req.user.userId, ...values]
    );

    res.json({
      success: true,
      data: {
        category: formatCategory(result.rows[0]),
      },
      message: 'Category updated successfully',
    });
  } catch (error) {
    console.error('❌ Update category error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update category',
      code: 'UPDATE_CATEGORY_ERROR',
    });
  }
});

/**
 * Delete category
 * DELETE /categories/:id
 */
router.delete('/:id', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    const categoryId = req.params.id;
    const reassignTo = req.query.reassignTo as string; // Optional category ID to reassign bookmarks to

    // Check if category exists and belongs to user
    const existingCategory = await db.query(
      'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
      [categoryId, req.user.userId]
    );

    if (existingCategory.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Category not found',
        code: 'CATEGORY_NOT_FOUND',
      });
      return;
    }

    // Prevent deletion of default categories
    if (existingCategory.rows[0].is_default) {
      res.status(400).json({
        success: false,
        error: 'Cannot delete default category',
        code: 'CANNOT_DELETE_DEFAULT_CATEGORY',
      });
      return;
    }

    // Check if reassign target category exists if provided
    if (reassignTo) {
      const reassignTargetResult = await db.query(
        'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
        [reassignTo, req.user.userId]
      );

      if (reassignTargetResult.rows.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Reassign target category not found',
          code: 'REASSIGN_TARGET_NOT_FOUND',
        });
        return;
      }
    }

    // Start transaction
    await db.query('BEGIN');

    try {
      // Update child categories to have no parent (move to root level)
      await db.query(
        'UPDATE categories SET parent_id = NULL WHERE parent_id = $1 AND user_id = $2',
        [categoryId, req.user.userId]
      );

      // Reassign bookmarks to new category or set to null
      if (reassignTo) {
        await db.query(
          'UPDATE bookmarks SET category_id = $1 WHERE category_id = $2 AND user_id = $3',
          [reassignTo, categoryId, req.user.userId]
        );
      } else {
        await db.query(
          'UPDATE bookmarks SET category_id = NULL WHERE category_id = $1 AND user_id = $2',
          [categoryId, req.user.userId]
        );
      }

      // Delete the category
      const result = await db.query(
        'DELETE FROM categories WHERE id = $1 AND user_id = $2 RETURNING id',
        [categoryId, req.user.userId]
      );

      await db.query('COMMIT');

      res.json({
        success: true,
        message: 'Category deleted successfully',
        data: {
          deletedId: result.rows[0].id,
          reassignedTo: reassignTo || null,
        },
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('❌ Delete category error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete category',
      code: 'DELETE_CATEGORY_ERROR',
    });
  }
});

/**
 * Reorder categories
 * PUT /categories/order
 */
router.put('/order', apiRateLimit, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
      return;
    }

    const { categoryOrders } = req.body;

    if (!Array.isArray(categoryOrders)) {
      res.status(400).json({
        success: false,
        error: 'categoryOrders must be an array',
        code: 'INVALID_ORDER_DATA',
      });
      return;
    }

    // Validate that all categories belong to the user
    const categoryIds = categoryOrders.map(item => item.id);
    const ownershipCheck = await db.query(
      'SELECT id FROM categories WHERE id = ANY($1) AND user_id = $2',
      [categoryIds, req.user.userId]
    );

    if (ownershipCheck.rows.length !== categoryIds.length) {
      res.status(400).json({
        success: false,
        error: 'Some categories do not exist or do not belong to user',
        code: 'INVALID_CATEGORY_OWNERSHIP',
      });
      return;
    }

    // Start transaction
    await db.query('BEGIN');

    try {
      // Update order for each category
      for (const item of categoryOrders) {
        await db.query(
          'UPDATE categories SET "order" = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
          [item.order, item.id, req.user.userId]
        );
      }

      await db.query('COMMIT');

      res.json({
        success: true,
        message: 'Category order updated successfully',
        data: {
          updatedCount: categoryOrders.length,
        },
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('❌ Reorder categories error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reorder categories',
      code: 'REORDER_CATEGORIES_ERROR',
    });
  }
});

// Helper functions

/**
 * Check if setting parentId would create a circular reference
 */
async function checkCircularReference(
  parentId: string,
  userId: string
): Promise<boolean> {
  // This is a simplified check - in practice, you'd want to traverse the entire hierarchy
  const result = await db.query(
    'WITH RECURSIVE category_tree AS (SELECT id, parent_id FROM categories WHERE id = $1 AND user_id = $2 UNION ALL SELECT c.id, c.parent_id FROM categories c INNER JOIN category_tree ct ON c.id = ct.parent_id WHERE c.user_id = $2) SELECT COUNT(*) as count FROM category_tree WHERE parent_id = $1',
    [parentId, userId]
  );

  return parseInt(result.rows[0].count) > 0;
}

/**
 * Check if changing category's parent would create a circular reference
 */
async function wouldCreateCircularReference(
  categoryId: string,
  newParentId: string,
  userId: string
): Promise<boolean> {
  // Check if newParentId is a descendant of categoryId
  const result = await db.query(
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

/**
 * Format category data for API response
 */
function formatCategory(row: any, includeCount: boolean = false): any {
  const category: any = {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    parentId: row.parent_id,
    order: row.order,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (includeCount) {
    category.bookmarkCount = parseInt(row.bookmark_count) || 0;
  }

  return category;
}

export default router;
