import { z } from 'zod';
import type { ValidationError } from './index';

export class ValidationResult<T = any> {
  constructor(
    public success: boolean,
    public data?: T,
    public errors?: ValidationError['errors']
  ) {}

  static success<T>(data: T): ValidationResult<T> {
    return new ValidationResult(true, data);
  }

  static failure(errors: ValidationError['errors']): ValidationResult {
    return new ValidationResult(false, undefined, errors);
  }
}

export const createValidator = <T>(schema: z.ZodSchema<T>) => {
  return (data: unknown): ValidationResult<T> => {
    try {
      const result = schema.parse(data);
      return ValidationResult.success(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
          value: err.input,
        }));
        return ValidationResult.failure(validationErrors);
      }
      return ValidationResult.failure([
        {
          field: 'unknown',
          message: 'Validation failed',
          code: 'unknown_error',
        },
      ]);
    }
  };
};

export const safeValidate = <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> => {
  const validator = createValidator(schema);
  return validator(data);
};

export const validateArray = <T>(
  schema: z.ZodSchema<T>,
  data: unknown[]
): ValidationResult<T[]> => {
  const results: T[] = [];
  const allErrors: ValidationError['errors'] = [];

  for (let i = 0; i < data.length; i++) {
    const result = safeValidate(schema, data[i]);
    if (result.success && result.data) {
      results.push(result.data);
    } else if (result.errors) {
      allErrors.push(
        ...result.errors.map(error => ({
          ...error,
          field: `[${i}].${error.field}`,
        }))
      );
    }
  }

  if (allErrors.length > 0) {
    return ValidationResult.failure(allErrors);
  }

  return ValidationResult.success(results);
};

export const transformAndValidate = <T, U>(
  schema: z.ZodSchema<U>,
  transformer: (data: T) => U,
  data: T
): ValidationResult<U> => {
  try {
    const transformed = transformer(data);
    return safeValidate(schema, transformed);
  } catch (error) {
    return ValidationResult.failure([
      {
        field: 'transform',
        message: error instanceof Error ? error.message : 'Transformation failed',
        code: 'transform_error',
      },
    ]);
  }
};

export const createConditionalValidator = <T>(
  baseSchema: z.ZodSchema<T>,
  condition: (data: T) => boolean,
  conditionalSchema: z.ZodSchema<T>
) => {
  return (data: unknown): ValidationResult<T> => {
    const baseResult = safeValidate(baseSchema, data);
    if (!baseResult.success || !baseResult.data) {
      return baseResult;
    }

    if (condition(baseResult.data)) {
      return safeValidate(conditionalSchema, data);
    }

    return baseResult;
  };
};

export const validatePartial = <T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  fields: (keyof T)[]
): ValidationResult<Partial<T>> => {
  const partialSchema = schema.partial();
  const result = safeValidate(partialSchema, data);

  if (!result.success || !result.data) {
    return result;
  }

  const filteredData: Partial<T> = {};
  for (const field of fields) {
    if (field in result.data) {
      filteredData[field] = result.data[field];
    }
  }

  return ValidationResult.success(filteredData);
};

export const combineValidators = <T>(
  ...validators: ((data: unknown) => ValidationResult<T>)[]
) => {
  return (data: unknown): ValidationResult<T> => {
    for (const validator of validators) {
      const result = validator(data);
      if (!result.success) {
        return result;
      }
    }

    const lastValidator = validators[validators.length - 1];
    return lastValidator(data);
  };
};

export const createAsyncValidator = <T>(
  schema: z.ZodSchema<T>,
  asyncChecks: Array<(data: T) => Promise<string | null>>
) => {
  return async (data: unknown): Promise<ValidationResult<T>> => {
    const syncResult = safeValidate(schema, data);
    if (!syncResult.success || !syncResult.data) {
      return syncResult;
    }

    const asyncErrors: ValidationError['errors'] = [];
    
    for (const check of asyncChecks) {
      try {
        const error = await check(syncResult.data);
        if (error) {
          asyncErrors.push({
            field: 'async_validation',
            message: error,
            code: 'async_validation_error',
          });
        }
      } catch (error) {
        asyncErrors.push({
          field: 'async_validation',
          message: error instanceof Error ? error.message : 'Async validation failed',
          code: 'async_validation_error',
        });
      }
    }

    if (asyncErrors.length > 0) {
      return ValidationResult.failure(asyncErrors);
    }

    return syncResult;
  };
};

export const validateEnvironment = (
  requiredVars: string[],
  optionalVars: string[] = []
): ValidationResult<Record<string, string>> => {
  const errors: ValidationError['errors'] = [];
  const env: Record<string, string> = {};

  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value) {
      errors.push({
        field: varName,
        message: `Environment variable ${varName} is required`,
        code: 'required',
      });
    } else {
      env[varName] = value;
    }
  }

  for (const varName of optionalVars) {
    const value = process.env[varName];
    if (value) {
      env[varName] = value;
    }
  }

  if (errors.length > 0) {
    return ValidationResult.failure(errors);
  }

  return ValidationResult.success(env);
};

export const formatValidationErrors = (
  errors: ValidationError['errors']
): string => {
  return errors
    .map(error => `${error.field}: ${error.message}`)
    .join(', ');
};

export const createFieldValidator = <T>(
  fieldName: keyof T,
  schema: z.ZodSchema<T[keyof T]>
) => {
  return (data: Partial<T>): ValidationResult<T[keyof T]> => {
    const value = data[fieldName];
    return safeValidate(schema, value);
  };
};