import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { z } from 'zod';
import {
  Router,
  Context,
  compose,
  createValidator,
  Password,
  JWT,
  createCache,
  Database,
  createServer,
} from '../../src';

// ============= Integration Tests =============

describe('Integration Tests', () => {
  describe('Full Stack Application', () => {
    test('should handle basic routing', async () => {
      const router = new Router();
      
      router.get('/users', (ctx) => ctx.json([{ id: 1, name: 'John' }]));
      router.post('/users', async (ctx) => {
        const body = await ctx.body<{ name: string }>();
        return ctx.status(201).json({ id: 1, name: body?.name });
      });
      router.get('/users/:id', (ctx) => ctx.json({ id: parseInt(ctx.params.id), name: 'User' }));

      // Test GET /users
      const request1 = new Request('http://localhost:3000/users');
      const match1 = router.match('GET', '/users');
      expect(match1).toBeDefined();
      const ctx1 = new Context(request1, match1!.params);
      const response1 = await match1!.handler(ctx1);
      expect(response1.status).toBe(200);
      const users = await response1.json();
      expect(Array.isArray(users)).toBe(true);

      // Test POST /users
      const request2 = new Request('http://localhost:3000/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice' }),
      });
      const match2 = router.match('POST', '/users');
      expect(match2).toBeDefined();
      const ctx2 = new Context(request2, match2!.params);
      const response2 = await match2!.handler(ctx2);
      expect(response2.status).toBe(201);

      // Test GET /users/:id
      const request3 = new Request('http://localhost:3000/users/123');
      const match3 = router.match('GET', '/users/123');
      expect(match3).toBeDefined();
      const ctx3 = new Context(request3, match3!.params);
      const response3 = await match3!.handler(ctx3);
      const user = await response3.json();
      expect(user.id).toBe(123);
    });

    test('should handle 404 for missing routes', async () => {
      const router = new Router();
      router.get('/users', (ctx) => ctx.json([]));
      
      const match = router.match('GET', '/nonexistent');
      expect(match).toBeUndefined();
    });
  });

  describe('Middleware Integration', () => {
    test('should apply middleware to routes', async () => {
      const router = new Router();
      const order: string[] = [];

      const middleware1 = async (ctx: Context, next: () => Promise<Response>) => {
        order.push('before1');
        const response = await next();
        order.push('after1');
        return response;
      };

      const middleware2 = async (ctx: Context, next: () => Promise<Response>) => {
        order.push('before2');
        const response = await next();
        order.push('after2');
        return response;
      };

      router.get('/test', (ctx) => {
        order.push('handler');
        return ctx.json({ ok: true });
      }, { middleware: [middleware1, middleware2] });

      const match = router.match('GET', '/test');
      expect(match).toBeDefined();
      
      if (match && match.middleware) {
        const request = new Request('http://localhost:3000/test');
        const context = new Context(request, match.params);
        const pipeline = compose(match.middleware);
        await pipeline(context, match.handler);
        
        expect(order).toEqual(['before1', 'before2', 'handler', 'after2', 'after1']);
      }
    });
  });

  describe('Validation Integration', () => {
    test('should validate request body', async () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(0),
      });

      const validator = createValidator({ body: schema });

      // Valid request
      const validRequest = new Request('http://localhost:3000/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', age: 25 }),
      });
      const validCtx = new Context(validRequest, {});
      let nextCalled = false;
      const validResponse = await validator(validCtx, async () => {
        nextCalled = true;
        return new Response('OK');
      });
      expect(nextCalled).toBe(true);

      // Invalid request
      const invalidRequest = new Request('http://localhost:3000/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'invalid', age: -5 }),
      });
      const invalidCtx = new Context(invalidRequest, {});
      const invalidResponse = await validator(invalidCtx, async () => new Response('OK'));
      expect(invalidResponse.status).toBe(400);
    });
  });

  describe('Database Integration', () => {
    let db: Database;

    beforeAll(async () => {
      db = new Database({ url: ':memory:' });
      await db.connect();
      await db.raw(`
        CREATE TABLE test_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE
        )
      `);
    });

    afterAll(async () => {
      await db.close();
    });

    test('should perform CRUD operations', async () => {
      // Create
      await db.raw("INSERT INTO test_users (name, email) VALUES ($1, $2)", ['Test User', 'test@example.com']);
      
      // Read
      const user = await db.queryOne<{ id: number; name: string; email: string }>`
        SELECT * FROM test_users WHERE email = ${'test@example.com'}
      `;
      expect(user?.name).toBe('Test User');
      
      // Update
      await db.raw("UPDATE test_users SET name = $1 WHERE email = $2", ['Updated', 'test@example.com']);
      const updated = await db.queryOne<{ name: string }>`
        SELECT name FROM test_users WHERE email = ${'test@example.com'}
      `;
      expect(updated?.name).toBe('Updated');
      
      // Delete
      await db.raw("DELETE FROM test_users WHERE email = $1", ['test@example.com']);
      const deleted = await db.queryOne`
        SELECT * FROM test_users WHERE email = ${'test@example.com'}
      `;
      expect(deleted).toBeNull();
    });
  });

  describe('Security Integration', () => {
    test('should hash and verify passwords', async () => {
      const password = 'mySecurePassword123';
      const hash = await Password.hash(password);
      
      expect(await Password.verify(password, hash)).toBe(true);
      expect(await Password.verify('wrongPassword', hash)).toBe(false);
    });

    test('should sign and verify JWTs', async () => {
      const jwt = new JWT('test-secret', { expiresIn: '1h' });
      const payload = { userId: 123, role: 'admin' };
      
      const token = await jwt.sign(payload);
      const decoded = await jwt.verify(token);
      
      expect(decoded?.userId).toBe(123);
      expect(decoded?.role).toBe('admin');
    });
  });

  describe('Cache Integration', () => {
    test('should cache values with TTL', async () => {
      const cache = createCache({ driver: 'memory', ttl: 1 });
      await cache.connect();
      
      // Cache miss
      let callCount = 0;
      const value = await cache.getOrSet('key1', async () => {
        callCount++;
        return 'computed';
      });
      expect(value).toBe('computed');
      expect(callCount).toBe(1);
      
      // Cache hit
      const cached = await cache.getOrSet('key1', async () => {
        callCount++;
        return 'computed again';
      });
      expect(cached).toBe('computed');
      expect(callCount).toBe(1); // Factory not called again
      
      await cache.disconnect();
    });
  });
});
