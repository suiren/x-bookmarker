import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { APIResponse } from '@x-bookmarker/shared/types';

/**
 * Express middleware for request validation using Zod schemas
 */
export function validateMiddleware(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body against the provided schema
      const validatedData = schema.parse(req.body);
      
      // Replace request body with validated data
      req.body = validatedData;
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Extract validation errors
        const validationErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validationErrors
        } as APIResponse<null>);
      }

      // Handle other errors
      console.error('Validation middleware error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal validation error'
      } as APIResponse<null>);
    }
  };
}

/**
 * Validation middleware for query parameters
 */
export function validateQueryMiddleware(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.query);
      req.query = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return res.status(400).json({
          success: false,
          error: 'Query validation failed',
          details: validationErrors
        } as APIResponse<null>);
      }

      console.error('Query validation middleware error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal validation error'
      } as APIResponse<null>);
    }
  };
}

/**
 * Validation middleware for URL parameters
 */
export function validateParamsMiddleware(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.params);
      req.params = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return res.status(400).json({
          success: false,
          error: 'Parameter validation failed',
          details: validationErrors
        } as APIResponse<null>);
      }

      console.error('Parameter validation middleware error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal validation error'
      } as APIResponse<null>);
    }
  };
}