import { z } from 'zod';
import {
  ValidationResult,
  createValidator,
  safeValidate,
  validateArray,
  transformAndValidate,
  createConditionalValidator,
  validatePartial,
  combineValidators,
  createAsyncValidator,
  validateEnvironment,
  formatValidationErrors,
  createFieldValidator,
} from '../schemas/validation';

describe('Validation utilities', () => {
  const testSchema = z.object({
    name: z.string().min(1),
    age: z.number().min(0),
    email: z.string().email(),
  });

  type TestData = z.infer<typeof testSchema>;

  describe('ValidationResult', () => {
    it('should create success result', () => {
      const result = ValidationResult.success({ test: 'data' });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ test: 'data' });
      expect(result.errors).toBeUndefined();
    });

    it('should create failure result', () => {
      const errors = [{ field: 'test', message: 'Error', code: 'invalid' }];
      const result = ValidationResult.failure(errors);
      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors).toEqual(errors);
    });
  });

  describe('createValidator', () => {
    const validator = createValidator(testSchema);

    it('should validate correct data', () => {
      const validData = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      };

      const result = validator(validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should return errors for invalid data', () => {
      const invalidData = {
        name: '',
        age: -5,
        email: 'invalid-email',
      };

      const result = validator(invalidData);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBe(3);
    });
  });

  describe('safeValidate', () => {
    it('should safely validate data', () => {
      const validData = {
        name: 'Jane Doe',
        age: 25,
        email: 'jane@example.com',
      };

      const result = safeValidate(testSchema, validData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should handle validation errors', () => {
      const invalidData = {
        name: 'John',
        age: 'thirty', // Should be number
        email: 'john@example.com',
      };

      const result = safeValidate(testSchema, invalidData);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('validateArray', () => {
    const itemSchema = z.object({
      id: z.number(),
      name: z.string(),
    });

    it('should validate array of valid items', () => {
      const validArray = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ];

      const result = validateArray(itemSchema, validArray);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validArray);
    });

    it('should return errors with indexed fields', () => {
      const invalidArray = [
        { id: 1, name: 'Item 1' },
        { id: 'invalid', name: '' }, // Invalid item
      ];

      const result = validateArray(itemSchema, invalidArray);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].field).toContain('[1]');
    });
  });

  describe('transformAndValidate', () => {
    const numberSchema = z.number();
    const stringToNumber = (str: string) => parseInt(str, 10);

    it('should transform and validate successfully', () => {
      const result = transformAndValidate(numberSchema, stringToNumber, '42');
      expect(result.success).toBe(true);
      expect(result.data).toBe(42);
    });

    it('should handle transformation errors', () => {
      const failingTransformer = () => {
        throw new Error('Transform failed');
      };

      const result = transformAndValidate(numberSchema, failingTransformer, 'test');
      expect(result.success).toBe(false);
      expect(result.errors![0].field).toBe('transform');
    });
  });

  describe('createConditionalValidator', () => {
    const baseSchema = z.object({
      type: z.enum(['user', 'admin']),
      name: z.string(),
    });

    const adminSchema = z.object({
      type: z.literal('admin'),
      name: z.string(),
      permissions: z.array(z.string()),
    });

    const conditionalValidator = createConditionalValidator(
      baseSchema,
      (data) => data.type === 'admin',
      adminSchema
    );

    it('should use base schema for non-matching condition', () => {
      const userData = { type: 'user', name: 'John' };
      const result = conditionalValidator(userData);
      expect(result.success).toBe(true);
    });

    it('should use conditional schema for matching condition', () => {
      const adminData = { type: 'admin', name: 'Admin', permissions: ['read', 'write'] };
      const result = conditionalValidator(adminData);
      expect(result.success).toBe(true);
    });

    it('should fail conditional validation when required fields missing', () => {
      const incompleteAdmin = { type: 'admin', name: 'Admin' }; // Missing permissions
      const result = conditionalValidator(incompleteAdmin);
      expect(result.success).toBe(false);
    });
  });

  describe('validatePartial', () => {
    it('should validate only specified fields', () => {
      const partialData = { name: 'John' }; // Missing age and email
      const result = validatePartial(testSchema, partialData, ['name']);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'John' });
    });

    it('should filter out unspecified fields', () => {
      const extraData = { name: 'John', age: 30, email: 'john@example.com', extra: 'field' };
      const result = validatePartial(testSchema, extraData, ['name', 'age']);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'John', age: 30 });
      expect(result.data).not.toHaveProperty('extra');
    });
  });

  describe('combineValidators', () => {
    const lengthValidator = createValidator(z.string().min(5));
    const formatValidator = createValidator(z.string().regex(/^[A-Z]/));

    const combinedValidator = combineValidators(lengthValidator, formatValidator);

    it('should pass all validators', () => {
      const result = combinedValidator('Hello World');
      expect(result.success).toBe(true);
    });

    it('should fail on first validator failure', () => {
      const result = combinedValidator('Hi'); // Too short
      expect(result.success).toBe(false);
    });

    it('should fail on second validator failure', () => {
      const result = combinedValidator('hello world'); // Doesn't start with capital
      expect(result.success).toBe(false);
    });
  });

  describe('createAsyncValidator', () => {
    const asyncValidator = createAsyncValidator(
      z.string(),
      [
        async (data: string) => {
          if (data === 'forbidden') {
            return 'This value is forbidden';
          }
          return null;
        },
        async (data: string) => {
          // Simulate async check (e.g., database lookup)
          await new Promise(resolve => setTimeout(resolve, 10));
          if (data === 'taken') {
            return 'This value is already taken';
          }
          return null;
        },
      ]
    );

    it('should pass async validation', async () => {
      const result = await asyncValidator('valid-value');
      expect(result.success).toBe(true);
      expect(result.data).toBe('valid-value');
    });

    it('should fail async validation', async () => {
      const result = await asyncValidator('forbidden');
      expect(result.success).toBe(false);
      expect(result.errors![0].message).toBe('This value is forbidden');
    });

    it('should handle multiple async failures', async () => {
      const multiFailValidator = createAsyncValidator(
        z.string(),
        [
          async () => 'Error 1',
          async () => 'Error 2',
        ]
      );

      const result = await multiFailValidator('test');
      expect(result.success).toBe(false);
      expect(result.errors!.length).toBe(2);
    });
  });

  describe('validateEnvironment', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should validate required environment variables', () => {
      process.env.REQUIRED_VAR = 'value';
      process.env.OPTIONAL_VAR = 'optional_value';

      const result = validateEnvironment(['REQUIRED_VAR'], ['OPTIONAL_VAR']);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        REQUIRED_VAR: 'value',
        OPTIONAL_VAR: 'optional_value',
      });
    });

    it('should fail when required variables are missing', () => {
      delete process.env.REQUIRED_VAR;

      const result = validateEnvironment(['REQUIRED_VAR']);
      expect(result.success).toBe(false);
      expect(result.errors![0].field).toBe('REQUIRED_VAR');
    });

    it('should handle missing optional variables', () => {
      process.env.REQUIRED_VAR = 'value';
      delete process.env.OPTIONAL_VAR;

      const result = validateEnvironment(['REQUIRED_VAR'], ['OPTIONAL_VAR']);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ REQUIRED_VAR: 'value' });
    });
  });

  describe('formatValidationErrors', () => {
    it('should format errors as readable string', () => {
      const errors = [
        { field: 'name', message: 'Name is required', code: 'required' },
        { field: 'email', message: 'Invalid email format', code: 'invalid_format' },
      ];

      const formatted = formatValidationErrors(errors);
      expect(formatted).toBe('name: Name is required, email: Invalid email format');
    });
  });

  describe('createFieldValidator', () => {
    interface User {
      name: string;
      age: number;
      email: string;
    }

    const nameValidator = createFieldValidator<User>('name', z.string().min(1));

    it('should validate specific field', () => {
      const userData = { name: 'John', age: 30, email: 'john@example.com' };
      const result = nameValidator(userData);
      expect(result.success).toBe(true);
      expect(result.data).toBe('John');
    });

    it('should fail field validation', () => {
      const userData = { name: '', age: 30, email: 'john@example.com' };
      const result = nameValidator(userData);
      expect(result.success).toBe(false);
    });

    it('should handle missing field', () => {
      const userData = { age: 30, email: 'john@example.com' } as Partial<User>;
      const result = nameValidator(userData);
      expect(result.success).toBe(false);
    });
  });
});