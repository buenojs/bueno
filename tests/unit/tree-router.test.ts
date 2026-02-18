import { describe, test, expect, beforeEach } from 'bun:test';
import { TreeRouter } from '../../src/router/tree';
import type { HTTPMethod, RouteHandler } from '../../src/types';

describe('TreeRouter', () => {
  let router: TreeRouter;

  const mockHandler: RouteHandler = () => new Response('OK');
  const handler1: RouteHandler = () => new Response('handler1');
  const handler2: RouteHandler = () => new Response('handler2');

  beforeEach(() => {
    router = new TreeRouter();
  });

  describe('Router Type', () => {
    test('should return "tree" as router type', () => {
      expect(router.getRouterType()).toBe('tree');
    });
  });

  describe('Static Route Registration', () => {
    test('should register a GET route', () => {
      router.get('/users', mockHandler);
      const match = router.match('GET', '/users');
      expect(match).toBeDefined();
      expect(match?.handler).toBe(mockHandler);
      expect(match?.params).toEqual({});
    });

    test('should register routes for all HTTP methods', () => {
      router.get('/get', mockHandler);
      router.post('/post', mockHandler);
      router.put('/put', mockHandler);
      router.patch('/patch', mockHandler);
      router.delete('/delete', mockHandler);
      router.head('/head', mockHandler);
      router.options('/options', mockHandler);

      expect(router.match('GET', '/get')).toBeDefined();
      expect(router.match('POST', '/post')).toBeDefined();
      expect(router.match('PUT', '/put')).toBeDefined();
      expect(router.match('PATCH', '/patch')).toBeDefined();
      expect(router.match('DELETE', '/delete')).toBeDefined();
      expect(router.match('HEAD', '/head')).toBeDefined();
      expect(router.match('OPTIONS', '/options')).toBeDefined();
    });

    test('should register route with all method', () => {
      router.all('/catch-all', mockHandler);
      expect(router.match('GET', '/catch-all')).toBeDefined();
      expect(router.match('POST', '/catch-all')).toBeDefined();
      expect(router.match('PUT', '/catch-all')).toBeDefined();
    });

    test('should be case-insensitive for static routes', () => {
      router.get('/Users', mockHandler);
      expect(router.match('GET', '/users')).toBeDefined();
      expect(router.match('GET', '/USERS')).toBeDefined();
      expect(router.match('GET', '/UsErS')).toBeDefined();
    });

    test('should normalize trailing slashes', () => {
      router.get('/users', mockHandler);
      expect(router.match('GET', '/users')).toBeDefined();
      expect(router.match('GET', '/users/')).toBeDefined();
    });

    test('should handle root path', () => {
      router.get('/', mockHandler);
      expect(router.match('GET', '/')).toBeDefined();
    });
  });

  describe('Dynamic Routes - Parameters', () => {
    test('should match single path parameter', () => {
      router.get('/users/:id', mockHandler);
      const match = router.match('GET', '/users/123');
      expect(match).toBeDefined();
      expect(match?.params).toEqual({ id: '123' });
    });

    test('should match multiple path parameters', () => {
      router.get('/users/:userId/posts/:postId', mockHandler);
      const match = router.match('GET', '/users/42/posts/100');
      expect(match?.params).toEqual({ userId: '42', postId: '100' });
    });

    test('should match parameters with different values', () => {
      router.get('/api/:version/users/:id', mockHandler);
      
      expect(router.match('GET', '/api/v1/users/123')?.params).toEqual({ version: 'v1', id: '123' });
      expect(router.match('GET', '/api/v2/users/456')?.params).toEqual({ version: 'v2', id: '456' });
    });

    test('should match regex constrained parameters', () => {
      router.get('/users/:id<\\d+>', mockHandler);
      expect(router.match('GET', '/users/123')).toBeDefined();
      expect(router.match('GET', '/users/abc')).toBeUndefined();
    });

    test('should match alphanumeric parameter values', () => {
      router.get('/files/:name', mockHandler);
      const match = router.match('GET', '/files/document-pdf');
      expect(match?.params).toEqual({ name: 'document-pdf' });
    });
  });

  describe('Dynamic Routes - Wildcards', () => {
    test('should match wildcard routes', () => {
      router.get('/files/*', mockHandler);
      expect(router.match('GET', '/files/path/to/file.txt')).toBeDefined();
      expect(router.match('GET', '/files/docs/readme.md')).toBeDefined();
    });

    test('should capture wildcard content', () => {
      router.get('/files/*', mockHandler);
      const match = router.match('GET', '/files/docs/readme.md');
      expect(match?.params['*']).toBe('docs/readme.md');
    });

    test('should match wildcard at end of pattern', () => {
      router.get('/api/*', mockHandler);
      expect(router.match('GET', '/api/users/123/posts/456')).toBeDefined();
      expect(router.match('GET', '/api/anything/goes/here')).toBeDefined();
    });
  });

  describe('Route Priority', () => {
    test('should match static routes before parameters', () => {
      router.get('/users/me', handler1);
      router.get('/users/:id', handler2);

      // Static route should match first
      const match = router.match('GET', '/users/me');
      expect(match?.handler).toBe(handler1);

      // Parameter route for other values
      const match2 = router.match('GET', '/users/123');
      expect(match2?.handler).toBe(handler2);
    });

    test('should handle overlapping routes correctly', () => {
      router.get('/api/users', handler1);
      router.get('/api/users/:id', handler2);
      router.get('/api/users/:id/settings', mockHandler);

      expect(router.match('GET', '/api/users')?.handler).toBe(handler1);
      expect(router.match('GET', '/api/users/42')?.handler).toBe(handler2);
      expect(router.match('GET', '/api/users/42/settings')?.handler).toBe(mockHandler);
    });
  });

  describe('Route Groups', () => {
    test('should create route group with prefix', () => {
      const api = router.group('/api');
      api.get('/users', mockHandler);

      expect(router.match('GET', '/api/users')).toBeDefined();
      expect(router.match('GET', '/users')).toBeUndefined();
    });

    test('should support nested route groups', () => {
      const api = router.group('/api');
      const v1 = api.group('/v1');
      v1.get('/users', mockHandler);

      expect(router.match('GET', '/api/v1/users')).toBeDefined();
    });

    test('should apply middleware to route group', () => {
      const middleware = () => new Response('middleware');
      const api = router.group('/api', { middleware });
      api.get('/users', mockHandler);

      const match = router.match('GET', '/api/users');
      expect(match?.middleware).toBeDefined();
      expect(match?.middleware?.length).toBe(1);
    });

    test('should support multiple nested groups with middleware', () => {
      const mw1 = () => new Response('mw1');
      const mw2 = () => new Response('mw2');
      
      const api = router.group('/api', { middleware: mw1 });
      const v1 = api.group('/v1', { middleware: mw2 });
      v1.get('/users', mockHandler);

      const match = router.match('GET', '/api/v1/users');
      expect(match?.middleware).toHaveLength(2);
    });
  });

  describe('Route Information', () => {
    test('should list all routes', () => {
      router.get('/users', mockHandler);
      router.post('/users', mockHandler);
      router.get('/users/:id', mockHandler);

      const routes = router.getRoutes();
      expect(routes.length).toBe(3);
    });

    test('should include route metadata', () => {
      router.get('/users', mockHandler, { name: 'users.list' });
      const routes = router.getRoutes();
      expect(routes.find(r => r.name === 'users.list')).toBeDefined();
    });

    test('should return route count', () => {
      router.get('/users', mockHandler);
      router.get('/posts', mockHandler);
      router.get('/users/:id', mockHandler);

      expect(router.getRouteCount()).toBe(3);
    });

    test('should return tree statistics', () => {
      router.get('/users', mockHandler);
      router.get('/users/:id', mockHandler);
      router.get('/posts', mockHandler);
      router.get('/posts/:postId/comments/:commentId', mockHandler);

      const stats = router.getTreeStats();
      expect(stats.routes).toBe(4);
      expect(stats.nodes).toBeGreaterThan(0);
      expect(stats.depth).toBeGreaterThan(0);
    });
  });

  describe('Middleware', () => {
    test('should accept handler with middleware array', () => {
      const middleware = () => new Response('middleware');
      router.get('/protected', mockHandler, { middleware: [middleware] });

      const match = router.match('GET', '/protected');
      expect(match?.middleware).toHaveLength(1);
    });

    test('should accept single middleware', () => {
      const middleware = () => new Response('middleware');
      router.get('/protected', mockHandler, { middleware });

      const match = router.match('GET', '/protected');
      expect(match?.middleware).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    test('should return undefined for non-matching route', () => {
      router.get('/users', mockHandler);
      expect(router.match('GET', '/posts')).toBeUndefined();
    });

    test('should return undefined for wrong method', () => {
      router.get('/users', mockHandler);
      expect(router.match('POST', '/users')).toBeUndefined();
    });

    test('should handle "ALL" method for routes', () => {
      router.all('/api/*', mockHandler);
      expect(router.match('GET', '/api/users')).toBeDefined();
      expect(router.match('POST', '/api/users')).toBeDefined();
      expect(router.match('DELETE', '/api/users/123')).toBeDefined();
    });

    test('should handle deep nesting', () => {
      router.get('/a/b/c/d/e/f/g/h', mockHandler);
      expect(router.match('GET', '/a/b/c/d/e/f/g/h')).toBeDefined();
    });

    test('should handle many routes efficiently', () => {
      // Add 100 routes
      for (let i = 0; i < 100; i++) {
        router.get(`/api/v1/resource${i}`, mockHandler);
        router.get(`/api/v1/resource${i}/:id`, mockHandler);
      }

      // Should still match correctly
      expect(router.match('GET', '/api/v1/resource50')).toBeDefined();
      expect(router.match('GET', '/api/v1/resource50/123')?.params).toEqual({ id: '123' });
      expect(router.getRouteCount()).toBe(200);
    });
  });

  describe('Async Handlers', () => {
    test('should accept async handlers', async () => {
      const asyncHandler: RouteHandler = async () => {
        await Promise.resolve();
        return new Response('async');
      };

      router.get('/async', asyncHandler);
      const match = router.match('GET', '/async');
      expect(match?.handler).toBe(asyncHandler);
    });
  });

  describe('Complex Scenarios', () => {
    test('should handle REST API pattern', () => {
      router.get('/users', handler1);                    // List users
      router.post('/users', handler2);                   // Create user
      router.get('/users/:id', mockHandler);             // Get user
      router.put('/users/:id', mockHandler);             // Update user
      router.delete('/users/:id', mockHandler);          // Delete user
      router.get('/users/:id/posts', mockHandler);       // Get user's posts

      expect(router.match('GET', '/users')?.handler).toBe(handler1);
      expect(router.match('POST', '/users')?.handler).toBe(handler2);
      expect(router.match('GET', '/users/123')?.params).toEqual({ id: '123' });
      expect(router.match('DELETE', '/users/456')).toBeDefined();
      expect(router.match('GET', '/users/123/posts')).toBeDefined();
    });

    test('should handle mixed static and dynamic at same level', () => {
      router.get('/users/me', handler1);
      router.get('/users/:id', handler2);
      router.get('/users/all', mockHandler);

      expect(router.match('GET', '/users/me')?.handler).toBe(handler1);
      expect(router.match('GET', '/users/all')?.handler).toBe(mockHandler);
      expect(router.match('GET', '/users/123')?.handler).toBe(handler2);
    });
  });
});