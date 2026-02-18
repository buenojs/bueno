import { describe, test, expect, beforeEach } from 'bun:test';
import { LinearRouter } from '../../src/router/linear';
import type { HTTPMethod, RouteHandler } from '../../src/types';

describe('LinearRouter', () => {
  let router: LinearRouter;

  const mockHandler: RouteHandler = () => new Response('OK');
  const handler1: RouteHandler = () => new Response('handler1');
  const handler2: RouteHandler = () => new Response('handler2');

  beforeEach(() => {
    router = new LinearRouter();
  });

  describe('Router Type', () => {
    test('should return "linear" as router type', () => {
      expect(router.getRouterType()).toBe('linear');
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

    test('should register a POST route', () => {
      router.post('/users', mockHandler);
      const match = router.match('POST', '/users');
      expect(match).toBeDefined();
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

    test('should normalize trailing slashes for static routes', () => {
      router.get('/users', mockHandler);
      expect(router.match('GET', '/users')).toBeDefined();
      expect(router.match('GET', '/users/')).toBeDefined();
    });
  });

  describe('Static Route Performance (O(1))', () => {
    test('should match static routes in constant time', () => {
      // Add multiple static routes
      router.get('/users', handler1);
      router.get('/posts', handler2);
      router.get('/comments', mockHandler);
      router.get('/tags', mockHandler);
      router.get('/categories', mockHandler);

      // All should match correctly regardless of order
      expect(router.match('GET', '/users')?.handler).toBe(handler1);
      expect(router.match('GET', '/posts')?.handler).toBe(handler2);
      expect(router.match('GET', '/comments')?.handler).toBe(mockHandler);
    });

    test('should return empty params for static routes', () => {
      router.get('/static-path', mockHandler);
      const match = router.match('GET', '/static-path');
      expect(match?.params).toEqual({});
    });
  });

  describe('Dynamic Route Registration', () => {
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

    test('should match wildcard routes', () => {
      router.get('/files/*', mockHandler);
      expect(router.match('GET', '/files/path/to/file.txt')).toBeDefined();
      expect(router.match('GET', '/files/')).toBeDefined();
    });

    test('should capture wildcard content', () => {
      router.get('/files/*', mockHandler);
      const match = router.match('GET', '/files/docs/readme.md');
      expect(match?.params['*']).toBe('docs/readme.md');
    });

    test('should match optional parameters', () => {
      router.get('/users/:id?', mockHandler);
      expect(router.match('GET', '/users')).toBeDefined();
      expect(router.match('GET', '/users/123')?.params).toEqual({ id: '123' });
    });

    test('should match regex patterns', () => {
      router.get('/users/:id<\\d+>', mockHandler);
      expect(router.match('GET', '/users/123')).toBeDefined();
      expect(router.match('GET', '/users/abc')).toBeUndefined();
    });
  });

  describe('Route Priority', () => {
    test('should match static routes before dynamic (via separate storage)', () => {
      // In LinearRouter, static and dynamic routes are stored separately
      // Static routes are checked first (O(1) Map lookup)
      router.get('/users/me', handler1);
      router.get('/users/:id', handler2);

      // Static route should match first
      const match = router.match('GET', '/users/me');
      expect(match?.handler).toBe(handler1);

      // Dynamic route for other values
      const match2 = router.match('GET', '/users/123');
      expect(match2?.handler).toBe(handler2);
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

    test('should support group with both static and dynamic routes', () => {
      const api = router.group('/api');
      api.get('/users', handler1);
      api.get('/users/:id', handler2);

      expect(router.match('GET', '/api/users')?.handler).toBe(handler1);
      expect(router.match('GET', '/api/users/123')?.handler).toBe(handler2);
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
      expect(routes[0].name).toBe('users.list');
    });

    test('should return route count breakdown', () => {
      router.get('/users', mockHandler);       // static
      router.get('/posts', mockHandler);       // static
      router.get('/users/:id', mockHandler);   // dynamic
      router.get('/posts/:id/comments', mockHandler); // dynamic

      const count = router.getRouteCount();
      expect(count.static).toBe(2);
      expect(count.dynamic).toBe(2);
      expect(count.total).toBe(4);
    });
  });

  describe('Middleware', () => {
    test('should accept handler with middleware', () => {
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

    test('should handle root path', () => {
      router.get('/', mockHandler);
      expect(router.match('GET', '/')).toBeDefined();
    });

    test('should handle empty optional param', () => {
      router.get('/search/:query?', mockHandler);
      const match = router.match('GET', '/search');
      expect(match).toBeDefined();
    });

    test('should handle "ALL" method for dynamic routes', () => {
      router.all('/api/*', mockHandler);
      expect(router.match('GET', '/api/users')).toBeDefined();
      expect(router.match('POST', '/api/users')).toBeDefined();
      expect(router.match('DELETE', '/api/users/123')).toBeDefined();
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
});