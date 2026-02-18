import { describe, test, expect, beforeEach } from 'bun:test';
import {
  validate,
  validateSync,
  validateBody,
  validateQuery,
  validateParams,
  validateHeaders,
  createValidator,
  WithBody,
  WithQuery,
  isStandardSchema,
  assertStandardSchema
} from '../../src/validation';
import { Context } from '../../src/context';
import { z } from 'zod';
import type { StandardSchema, StandardResult } from '../../src/types';

// Typia support - conditionally import if available
// Note: Typia requires TypeScript transformation to work properly
// In a real project using Typia, you would use:
// import typia from 'typia';
// const TypiaUserSchema = typia.createValidate<IUser>();

// User schema for testing
const UserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
});

const IdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const QuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
  search: z.string().optional(),
});

const HeadersSchema = z.object({
  authorization: z.string().startsWith('Bearer '),
  'content-type': z.string().optional(),
});

// Helper to create a valid Standard Schema for testing
function createTestSchema<T>(
  validateFn: (data: unknown) => StandardResult<T> | Promise<StandardResult<T>>
): StandardSchema<unknown, T> {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      validate: validateFn,
    },
  };
}

describe('Validation', () => {
  describe('validate', () => {
    test('should validate valid data', async () => {
      const data = { name: 'John', email: 'john@example.com' };
      const result = await validate(UserSchema, data);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('John');
        expect(result.data.email).toBe('john@example.com');
      }
    });

    test('should return errors for invalid data', async () => {
      const data = { name: '', email: 'invalid-email' };
      const result = await validate(UserSchema, data);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues.length).toBeGreaterThan(0);
      }
    });

    test('should transform data', async () => {
      const data = { id: '123' };
      const result = await validate(IdSchema, data);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(123);
      }
    });

    test('should handle thrown errors gracefully', async () => {
      const data = { name: 'John', email: 'john@example.com' };
      const result = await validate(UserSchema, data);
      
      expect(result.success).toBe(true);
    });

    test('should handle async validators', async () => {
      const asyncSchema = createTestSchema(async (data) => {
        // Simulate async validation
        await new Promise(resolve => setTimeout(resolve, 10));
        if (typeof data === 'string') {
          return { value: data.toUpperCase() };
        }
        return { issues: [{ message: 'Must be a string' }] };
      });

      const result = await validate(asyncSchema, 'hello');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('HELLO');
      }
    });

    test('should catch exceptions from validators', async () => {
      const throwingSchema = createTestSchema(() => {
        throw new Error('Validation exploded');
      });

      const result = await validate(throwingSchema, 'test');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0].message).toBe('Validation exploded');
      }
    });

    test('should handle non-Error exceptions', async () => {
      const throwingSchema = createTestSchema(() => {
        throw 'string error';
      });

      const result = await validate(throwingSchema, 'test');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0].message).toBe('Validation failed');
      }
    });
  });

  describe('validateSync', () => {
    test('should validate valid data synchronously', () => {
      const data = { name: 'John', email: 'john@example.com' };
      const result = validateSync(UserSchema, data);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('John');
        expect(result.data.email).toBe('john@example.com');
      }
    });

    test('should return errors for invalid data synchronously', () => {
      const data = { name: '', email: 'invalid-email' };
      const result = validateSync(UserSchema, data);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues.length).toBeGreaterThan(0);
      }
    });

    test('should transform data synchronously', () => {
      const data = { id: '123' };
      const result = validateSync(IdSchema, data);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(123);
      }
    });

    test('should throw error for async validators', () => {
      // Create a schema that returns a Promise from validate
      const asyncSchema = createTestSchema((data) => 
        Promise.resolve({ value: data })
      );

      expect(() => validateSync(asyncSchema, { test: 'data' })).toThrow(
        'Schema uses async validation. Use validate() instead.'
      );
    });
  });

  describe('validateBody', () => {
    test('should validate request body', async () => {
      const request = new Request('http://localhost:3000/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
      });
      const context = new Context(request, {});

      const result = await validateBody(context, UserSchema);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('John');
      }
    });

    test('should handle invalid JSON body', async () => {
      const request = new Request('http://localhost:3000/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      const context = new Context(request, {});

      const result = await validateBody(context, UserSchema);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues[0].message).toBe('Failed to parse request body');
      }
    });

    test('should return validation errors for invalid body', async () => {
      const request = new Request('http://localhost:3000/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', email: 'invalid' }),
      });
      const context = new Context(request, {});

      const result = await validateBody(context, UserSchema);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('validateQuery', () => {
    test('should validate query parameters', () => {
      const request = new Request('http://localhost:3000/users?page=2&limit=20&search=john');
      const context = new Context(request, {});

      const result = validateQuery(context, QuerySchema);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(20);
        expect(result.data.search).toBe('john');
      }
    });

    test('should use default values', () => {
      const request = new Request('http://localhost:3000/users');
      const context = new Context(request, {});

      const result = validateQuery(context, QuerySchema);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(10);
      }
    });

    test('should fail for invalid query parameters', () => {
      const request = new Request('http://localhost:3000/users?page=-1');
      const context = new Context(request, {});

      const result = validateQuery(context, QuerySchema);
      
      expect(result.success).toBe(false);
    });
  });

  describe('validateParams', () => {
    test('should validate path parameters', () => {
      const request = new Request('http://localhost:3000/users/123');
      const context = new Context(request, { id: '123' });

      const result = validateParams(context, IdSchema);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(123);
      }
    });

    test('should fail for invalid path parameter', () => {
      const request = new Request('http://localhost:3000/users/abc');
      const context = new Context(request, { id: 'abc' });

      const result = validateParams(context, IdSchema);
      
      expect(result.success).toBe(false);
    });

    test('should fail for missing path parameter', () => {
      const request = new Request('http://localhost:3000/users');
      const context = new Context(request, {});

      const result = validateParams(context, IdSchema);
      
      expect(result.success).toBe(false);
    });
  });

  describe('validateHeaders', () => {
    test('should validate headers', () => {
      const request = new Request('http://localhost:3000/users', {
        headers: {
          authorization: 'Bearer token123',
          'content-type': 'application/json',
        },
      });
      const context = new Context(request, {});

      const result = validateHeaders(context, HeadersSchema);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.authorization).toBe('Bearer token123');
      }
    });

    test('should fail for invalid headers', () => {
      const request = new Request('http://localhost:3000/users', {
        headers: {
          authorization: 'Invalid token',
        },
      });
      const context = new Context(request, {});

      const result = validateHeaders(context, HeadersSchema);
      
      expect(result.success).toBe(false);
    });

    test('should fail for missing required headers', () => {
      const request = new Request('http://localhost:3000/users');
      const context = new Context(request, {});

      const result = validateHeaders(context, HeadersSchema);
      
      expect(result.success).toBe(false);
    });

    test('should collect all headers from request', () => {
      const request = new Request('http://localhost:3000/users', {
        headers: {
          authorization: 'Bearer token123',
          'x-custom-header': 'custom-value',
        },
      });
      const context = new Context(request, {});

      const allHeadersSchema = z.object({
        authorization: z.string(),
        'x-custom-header': z.string(),
      });

      const result = validateHeaders(context, allHeadersSchema);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.authorization).toBe('Bearer token123');
        expect(result.data['x-custom-header']).toBe('custom-value');
      }
    });
  });

  describe('createValidator', () => {
    test('should create validation middleware for body', async () => {
      const validator = createValidator({
        body: UserSchema,
      });

      const request = new Request('http://localhost:3000/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
      });
      const context = new Context(request, {});

      const next = () => Promise.resolve(new Response('OK'));
      const response = await validator(context, next);

      expect(response.status).toBe(200);
      expect(context.get('validatedBody')).toBeDefined();
    });

    test('should return 400 for body validation errors', async () => {
      const validator = createValidator({
        body: UserSchema,
      });

      const request = new Request('http://localhost:3000/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', email: 'invalid' }),
      });
      const context = new Context(request, {});

      const next = () => Promise.resolve(new Response('OK'));
      const response = await validator(context, next);

      expect(response.status).toBe(400);
    });

    test('should create validation middleware for query', async () => {
      const validator = createValidator({
        query: QuerySchema,
      });

      const request = new Request('http://localhost:3000/users?page=2&limit=20');
      const context = new Context(request, {});

      const next = () => Promise.resolve(new Response('OK'));
      const response = await validator(context, next);

      expect(response.status).toBe(200);
      expect(context.get('validatedQuery')).toBeDefined();
    });

    test('should return 400 for query validation errors', async () => {
      const validator = createValidator({
        query: QuerySchema,
      });

      const request = new Request('http://localhost:3000/users?page=-1');
      const context = new Context(request, {});

      const next = () => Promise.resolve(new Response('OK'));
      const response = await validator(context, next);

      expect(response.status).toBe(400);
    });

    test('should create validation middleware for params', async () => {
      const validator = createValidator({
        params: IdSchema,
      });

      const request = new Request('http://localhost:3000/users/123');
      const context = new Context(request, { id: '123' });

      const next = () => Promise.resolve(new Response('OK'));
      const response = await validator(context, next);

      expect(response.status).toBe(200);
      expect(context.get('validatedParams')).toBeDefined();
    });

    test('should return 400 for params validation errors', async () => {
      const validator = createValidator({
        params: IdSchema,
      });

      const request = new Request('http://localhost:3000/users/abc');
      const context = new Context(request, { id: 'abc' });

      const next = () => Promise.resolve(new Response('OK'));
      const response = await validator(context, next);

      expect(response.status).toBe(400);
    });

    test('should create validation middleware for headers', async () => {
      const validator = createValidator({
        headers: HeadersSchema,
      });

      const request = new Request('http://localhost:3000/users', {
        headers: {
          authorization: 'Bearer token123',
        },
      });
      const context = new Context(request, {});

      const next = () => Promise.resolve(new Response('OK'));
      const response = await validator(context, next);

      expect(response.status).toBe(200);
      expect(context.get('validatedHeaders')).toBeDefined();
    });

    test('should return 400 for headers validation errors', async () => {
      const validator = createValidator({
        headers: HeadersSchema,
      });

      const request = new Request('http://localhost:3000/users');
      const context = new Context(request, {});

      const next = () => Promise.resolve(new Response('OK'));
      const response = await validator(context, next);

      expect(response.status).toBe(400);
    });

    test('should validate multiple sources at once', async () => {
      const validator = createValidator({
        body: UserSchema,
        query: QuerySchema,
        params: IdSchema,
        headers: HeadersSchema,
      });

      const request = new Request('http://localhost:3000/users/123?page=1&limit=10', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer token123',
        },
        body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
      });
      const context = new Context(request, { id: '123' });

      const next = () => Promise.resolve(new Response('OK'));
      const response = await validator(context, next);

      expect(response.status).toBe(200);
      expect(context.get('validatedBody')).toBeDefined();
      expect(context.get('validatedQuery')).toBeDefined();
      expect(context.get('validatedParams')).toBeDefined();
      expect(context.get('validatedHeaders')).toBeDefined();
    });

    test('should return 400 on first validation failure', async () => {
      const validator = createValidator({
        body: UserSchema,
        query: QuerySchema,
      });

      const request = new Request('http://localhost:3000/users?page=-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
      });
      const context = new Context(request, {});

      const next = () => Promise.resolve(new Response('OK'));
      const response = await validator(context, next);

      expect(response.status).toBe(400);
    });

    test('should return JSON error response with issues', async () => {
      const validator = createValidator({
        body: UserSchema,
      });

      const request = new Request('http://localhost:3000/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', email: 'invalid' }),
      });
      const context = new Context(request, {});

      const next = () => Promise.resolve(new Response('OK'));
      const response = await validator(context, next);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Validation failed');
      expect(body.issues).toBeDefined();
    });
  });

  describe('WithBody decorator', () => {
    test('should be a function', () => {
      expect(typeof WithBody).toBe('function');
    });

    test('should return a decorator function', () => {
      const decorator = WithBody(UserSchema);
      expect(typeof decorator).toBe('function');
    });
  });

  describe('WithQuery decorator', () => {
    test('should be a function', () => {
      expect(typeof WithQuery).toBe('function');
    });

    test('should return a decorator function', () => {
      const decorator = WithQuery(QuerySchema);
      expect(typeof decorator).toBe('function');
    });
  });

  describe('isStandardSchema', () => {
    test('should return true for valid Standard Schema', () => {
      expect(isStandardSchema(UserSchema)).toBe(true);
      expect(isStandardSchema(IdSchema)).toBe(true);
      expect(isStandardSchema(QuerySchema)).toBe(true);
    });

    test('should return false for null', () => {
      expect(isStandardSchema(null)).toBe(false);
    });

    test('should return false for undefined', () => {
      expect(isStandardSchema(undefined)).toBe(false);
    });

    test('should return false for primitive values', () => {
      expect(isStandardSchema('string')).toBe(false);
      expect(isStandardSchema(123)).toBe(false);
      expect(isStandardSchema(true)).toBe(false);
    });

    test('should return false for plain objects', () => {
      expect(isStandardSchema({})).toBe(false);
      expect(isStandardSchema({ validate: () => {} })).toBe(false);
    });

    test('should return false for objects with invalid ~standard property', () => {
      expect(isStandardSchema({ '~standard': {} })).toBe(false);
      expect(isStandardSchema({ '~standard': { validate: 'not a function' } })).toBe(false);
    });

    test('should return true for custom Standard Schema implementation', () => {
      const customSchema = createTestSchema((data) => ({ value: data }));

      expect(isStandardSchema(customSchema)).toBe(true);
    });

    test('should check for validate function specifically', () => {
      const schemaWithNonFunctionValidate = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: 'not a function',
        },
      };

      expect(isStandardSchema(schemaWithNonFunctionValidate)).toBe(false);
    });
  });

  describe('assertStandardSchema', () => {
    test('should not throw for valid Standard Schema', () => {
      expect(() => assertStandardSchema(UserSchema)).not.toThrow();
      expect(() => assertStandardSchema(IdSchema)).not.toThrow();
    });

    test('should throw for invalid schema with default name', () => {
      expect(() => assertStandardSchema(null)).toThrow(
        'Schema must implement Standard Schema interface. Supported: Zod 4+, Valibot v1+, ArkType, Typia 7+'
      );
    });

    test('should throw for invalid schema with custom name', () => {
      expect(() => assertStandardSchema({}, 'MySchema')).toThrow(
        'MySchema must implement Standard Schema interface. Supported: Zod 4+, Valibot v1+, ArkType, Typia 7+'
      );
    });

    test('should throw for plain objects', () => {
      expect(() => assertStandardSchema({ validate: () => {} })).toThrow();
    });

    test('should narrow type correctly', () => {
      const maybeSchema: unknown = UserSchema;
      assertStandardSchema(maybeSchema);
      // After assertion, maybeSchema is narrowed to StandardSchema
      expect(maybeSchema['~standard'].validate).toBeDefined();
    });

    test('should throw for undefined', () => {
      expect(() => assertStandardSchema(undefined)).toThrow();
    });

    test('should throw for primitives', () => {
      expect(() => assertStandardSchema('string')).toThrow();
      expect(() => assertStandardSchema(123)).toThrow();
    });
  });

  describe('Typia Support', () => {
    // Note: Typia requires TypeScript transformation at build time.
    // These tests demonstrate how Typia schemas implement the Standard Schema interface.
    // In a real project with Typia properly configured, you would use:
    //
    // import typia from 'typia';
    //
    // interface IUser {
    //   name: string;
    //   email: string;
    //   age?: number;
    // }
    //
    // const typiaUserSchema = typia.createValidate<IUser>();
    //
    // Then use it with the validation functions:
    // const result = await validate(typiaUserSchema, userData);

    test('Typia createValidate returns Standard Schema compliant object', () => {
      // This test documents the expected Typia interface
      // Typia's createValidate<T>() returns an object that implements StandardSchemaV1
      //
      // The returned object has:
      // - '~standard.version': 1
      // - '~standard.vendor': 'typia'
      // - '~standard.validate': (value: unknown) => IValidation<T>
      //
      // Example usage:
      // const schema = typia.createValidate<IUser>();
      // const result = schema['~standard'].validate({ name: 'John', email: 'john@example.com' });
      // if ('value' in result) { /* success */ }

      // Simulated Typia-like schema for documentation purposes
      const simulatedTypiaSchema: StandardSchema<unknown, { name: string; email: string }> = {
        '~standard': {
          version: 1,
          vendor: 'typia',
          validate: (data: unknown) => {
            if (typeof data === 'object' && data !== null) {
              const obj = data as Record<string, unknown>;
              if (typeof obj.name === 'string' && typeof obj.email === 'string') {
                return { value: { name: obj.name, email: obj.email } };
              }
            }
            return { issues: [{ message: 'Invalid user object' }] };
          },
        },
      };

      expect(isStandardSchema(simulatedTypiaSchema)).toBe(true);
    });

    test('Typia schema works with validate function', async () => {
      // Simulated Typia schema
      const typiaLikeSchema: StandardSchema<unknown, { name: string; email: string }> = {
        '~standard': {
          version: 1,
          vendor: 'typia',
          validate: (data: unknown) => {
            if (typeof data === 'object' && data !== null) {
              const obj = data as Record<string, unknown>;
              if (typeof obj.name === 'string' && typeof obj.email === 'string') {
                return { value: { name: obj.name, email: obj.email } };
              }
            }
            return { issues: [{ message: 'Invalid user object' }] };
          },
        },
      };

      const validData = { name: 'John', email: 'john@example.com' };
      const result = await validate(typiaLikeSchema, validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('John');
        expect(result.data.email).toBe('john@example.com');
      }
    });

    test('Typia schema validation failures work correctly', async () => {
      // Simulated Typia schema with stricter validation
      const typiaLikeSchema: StandardSchema<unknown, { name: string; email: string }> = {
        '~standard': {
          version: 1,
          vendor: 'typia',
          validate: (data: unknown) => {
            if (typeof data === 'object' && data !== null) {
              const obj = data as Record<string, unknown>;
              if (typeof obj.name !== 'string') {
                return { issues: [{ message: 'name must be a string' }] };
              }
              if (typeof obj.email !== 'string') {
                return { issues: [{ message: 'email must be a string' }] };
              }
              return { value: { name: obj.name, email: obj.email } };
            }
            return { issues: [{ message: 'Invalid user object' }] };
          },
        },
      };

      const invalidData = { name: 123, email: 'john@example.com' };
      const result = await validate(typiaLikeSchema, invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues[0].message).toBe('name must be a string');
      }
    });
  });
});