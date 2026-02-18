import { describe, test, expect, beforeEach } from 'bun:test';
import { RegexRouter } from '../../src/router/regex';
import type { RouteHandler } from '../../src/types';

describe('RegexRouter', () => {
  let router: RegexRouter;

  const mockHandler: RouteHandler = () => new Response('OK');
  const handler1: RouteHandler = () => new Response('handler1');
  const handler2: RouteHandler = () => new Response('handler2');

  beforeEach(() => {
    router = new RegexRouter();
  });

  describe('Router Type', () => {
    test('should return "regex" as router type', () => {
      expect(router.getRouterType()).toBe('regex');
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

    test('should be case-insensitive by default', () => {
      router.get('/Users', mockHandler);
      expect(router.match('GET', '/users')).toBeDefined();
      expect(router.match('GET', '/USERS')).toBeDefined();
    });

    test('should normalize trailing slashes', () => {
      router.get('/users', mockHandler);
      expect(router.match('GET', '/users')).toBeDefined();
      expect(router.match('GET', '/users/')).toBeDefined();
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
    test('should match static routes before dynamic', () => {
      router.get('/users/:id', handler1);
      router.get('/users/me', handler2);

      const match = router.match('GET', '/users/me');
      expect(match?.handler).toBe(handler2);

      const match2 = router.match('GET', '/users/123');
      expect(match2?.handler).toBe(handler1);
    });

    test('should prioritize fewer parameters', () => {
      router.get('/a/:b/:c', handler1);
      router.get('/a/:b', handler2);

      const match = router.match('GET', '/a/test');
      expect(match?.handler).toBe(handler2);
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

    test('should return route count', () => {
      router.get('/users', mockHandler);
      router.get('/posts', mockHandler);
      router.get('/users/:id', mockHandler);

      expect(router.getRouteCount()).toBe(3);
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

    test('should handle root path', () => {
      router.get('/', mockHandler);
      expect(router.match('GET', '/')).toBeDefined();
    });

    test('should handle empty optional param', () => {
      router.get('/search/:query?', mockHandler);
      const match = router.match('GET', '/search');
      expect(match).toBeDefined();
    });

    test('should handle "ALL" method for routes', () => {
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

  describe('Regex Pattern Compilation', () => {
    test('should compile complex regex patterns', () => {
      router.get('/users/:id<[a-f0-9]{24}>', mockHandler);
      expect(router.match('GET', '/users/507f1f77bcf86cd799439011')).toBeDefined();
      expect(router.match('GET', '/users/invalid')).toBeUndefined();
    });

    test('should handle escaped special characters in pattern', () => {
      router.get('/files/:name<[^/]+\\.txt>', mockHandler);
      expect(router.match('GET', '/files/document.txt')).toBeDefined();
      expect(router.match('GET', '/files/document.pdf')).toBeUndefined();
    });
  });
});
