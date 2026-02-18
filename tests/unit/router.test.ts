import { describe, test, expect, beforeEach } from 'bun:test';
import { Router, createRouter, createLinearRouter, createRegexRouter, createTreeRouter, generateUrl } from '../../src/router';
import type { RouteHandler } from '../../src/types';

describe('Router (Auto-Selection)', () => {
  let router: Router;

  const mockHandler: RouteHandler = () => new Response('OK');

  beforeEach(() => {
    router = new Router();
  });

  describe('Auto Router Selection', () => {
    test('should start with linear router for few routes', () => {
      router.get('/users', mockHandler);
      router.get('/posts', mockHandler);
      expect(router.getRouterType()).toBe('linear');
    });

    test('should switch to regex router at threshold (default 10)', () => {
      for (let i = 0; i < 11; i++) {
        router.get(`/route${i}`, mockHandler);
      }
      expect(router.getRouterType()).toBe('regex');
    });

    test('should switch to tree router at threshold (default 50)', () => {
      for (let i = 0; i < 51; i++) {
        router.get(`/route${i}`, mockHandler);
      }
      expect(router.getRouterType()).toBe('tree');
    });

    test('should respect custom linear threshold', () => {
      const customRouter = new Router({ linearThreshold: 5 });
      for (let i = 0; i < 6; i++) {
        customRouter.get(`/route${i}`, mockHandler);
      }
      expect(customRouter.getRouterType()).toBe('regex');
    });

    test('should respect custom regex threshold', () => {
      const customRouter = new Router({ regexThreshold: 20 });
      for (let i = 0; i < 21; i++) {
        customRouter.get(`/route${i}`, mockHandler);
      }
      expect(customRouter.getRouterType()).toBe('tree');
    });
  });

  describe('Explicit Router Selection', () => {
    test('should use linear router when specified', () => {
      const linearRouter = new Router({ type: 'linear' });
      linearRouter.get('/users', mockHandler);
      for (let i = 0; i < 100; i++) {
        linearRouter.get(`/route${i}`, mockHandler);
      }
      expect(linearRouter.getRouterType()).toBe('linear');
    });

    test('should use regex router when specified', () => {
      const regexRouter = new Router({ type: 'regex' });
      regexRouter.get('/users', mockHandler);
      expect(regexRouter.getRouterType()).toBe('regex');
    });

    test('should use tree router when specified', () => {
      const treeRouter = new Router({ type: 'tree' });
      treeRouter.get('/users', mockHandler);
      expect(treeRouter.getRouterType()).toBe('tree');
    });
  });

  describe('Route Registration', () => {
    test('should register a GET route', () => {
      router.get('/users', mockHandler);
      const match = router.match('GET', '/users');
      expect(match).toBeDefined();
      expect(match?.handler).toBe(mockHandler);
    });

    test('should register a POST route', () => {
      router.post('/users', mockHandler);
      const match = router.match('POST', '/users');
      expect(match).toBeDefined();
    });

    test('should register a PUT route', () => {
      router.put('/users/:id', mockHandler);
      const match = router.match('PUT', '/users/123');
      expect(match).toBeDefined();
    });

    test('should register a PATCH route', () => {
      router.patch('/users/:id', mockHandler);
      const match = router.match('PATCH', '/users/123');
      expect(match).toBeDefined();
    });

    test('should register a DELETE route', () => {
      router.delete('/users/:id', mockHandler);
      const match = router.match('DELETE', '/users/123');
      expect(match).toBeDefined();
    });

    test('should register a HEAD route', () => {
      router.head('/users', mockHandler);
      const match = router.match('HEAD', '/users');
      expect(match).toBeDefined();
    });

    test('should register an OPTIONS route', () => {
      router.options('/users', mockHandler);
      const match = router.match('OPTIONS', '/users');
      expect(match).toBeDefined();
    });

    test('should register route with all method', () => {
      router.all('/catch-all', mockHandler);
      expect(router.match('GET', '/catch-all')).toBeDefined();
      expect(router.match('POST', '/catch-all')).toBeDefined();
      expect(router.match('PUT', '/catch-all')).toBeDefined();
    });
  });

  describe('Path Matching', () => {
    test('should match exact path', () => {
      router.get('/users', mockHandler);
      expect(router.match('GET', '/users')).toBeDefined();
      expect(router.match('GET', '/users/')).toBeDefined();
      expect(router.match('GET', '/users/extra')).toBeUndefined();
    });

    test('should extract path parameters', () => {
      router.get('/users/:id', mockHandler);
      const match = router.match('GET', '/users/123');
      expect(match?.params).toEqual({ id: '123' });
    });

    test('should extract multiple path parameters', () => {
      router.get('/users/:userId/posts/:postId', mockHandler);
      const match = router.match('GET', '/users/42/posts/100');
      expect(match?.params).toEqual({ userId: '42', postId: '100' });
    });

    test('should match wildcard routes', () => {
      router.get('/files/*', mockHandler);
      expect(router.match('GET', '/files/path/to/file.txt')).toBeDefined();
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

    test('should be case-insensitive by default', () => {
      router.get('/Users', mockHandler);
      expect(router.match('GET', '/users')).toBeDefined();
      expect(router.match('GET', '/USERS')).toBeDefined();
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

    test('should accumulate middleware in nested groups', () => {
      const mw1 = () => new Response('mw1');
      const mw2 = () => new Response('mw2');
      
      const api = router.group('/api', { middleware: mw1 });
      const v1 = api.group('/v1', { middleware: mw2 });
      v1.get('/users', mockHandler);

      const match = router.match('GET', '/api/v1/users');
      expect(match?.middleware).toHaveLength(2);
    });
  });

  describe('Route Matching', () => {
    test('should return undefined for non-matching route', () => {
      router.get('/users', mockHandler);
      expect(router.match('GET', '/posts')).toBeUndefined();
    });

    test('should return undefined for wrong method', () => {
      router.get('/users', mockHandler);
      expect(router.match('POST', '/users')).toBeUndefined();
    });

    test('should match static routes before dynamic', () => {
      const handler1 = () => new Response('1');
      const handler2 = () => new Response('2');

      router.get('/users/:id', handler1);
      router.get('/users/special', handler2);

      const match = router.match('GET', '/users/special');
      expect(match?.handler).toBe(handler2);
      
      const match2 = router.match('GET', '/users/123');
      expect(match2?.handler).toBe(handler1);
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

    test('should return config', () => {
      const customRouter = new Router({ 
        type: 'auto', 
        linearThreshold: 5, 
        regexThreshold: 25 
      });
      
      const config = customRouter.getConfig();
      expect(config.type).toBe('auto');
      expect(config.linearThreshold).toBe(5);
      expect(config.regexThreshold).toBe(25);
    });
  });

  describe('Route Handler Types', () => {
    test('should accept async handlers', async () => {
      const asyncHandler: RouteHandler = async () => {
        await Promise.resolve();
        return new Response('async');
      };

      router.get('/async', asyncHandler);
      const match = router.match('GET', '/async');
      expect(match?.handler).toBe(asyncHandler);
    });

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
});

describe('Factory Functions', () => {
  const mockHandler: RouteHandler = () => new Response('OK');

  test('createRouter should create auto-router', () => {
    const router = createRouter();
    router.get('/users', mockHandler);
    expect(router.getRouterType()).toBe('linear');
  });

  test('createRouter should accept config', () => {
    const router = createRouter({ type: 'tree' });
    router.get('/users', mockHandler);
    expect(router.getRouterType()).toBe('tree');
  });

  test('createLinearRouter should create linear router', () => {
    const router = createLinearRouter();
    router.get('/users', mockHandler);
    expect(router.getRouterType()).toBe('linear');
  });

  test('createRegexRouter should create regex router', () => {
    const router = createRegexRouter();
    router.get('/users', mockHandler);
    expect(router.getRouterType()).toBe('regex');
  });

  test('createTreeRouter should create tree router', () => {
    const router = createTreeRouter();
    router.get('/users', mockHandler);
    expect(router.getRouterType()).toBe('tree');
  });
});

describe('generateUrl', () => {
  test('should generate URL with params', () => {
    const url = generateUrl('/users/:id', { id: '123' });
    expect(url).toBe('/users/123');
  });

  test('should generate URL with multiple params', () => {
    const url = generateUrl('/users/:userId/posts/:postId', { userId: '42', postId: '100' });
    expect(url).toBe('/users/42/posts/100');
  });

  test('should handle wildcard', () => {
    const url = generateUrl('/files/*', { '*': 'path/to/file.txt' });
    expect(url).toBe('/files/path/to/file.txt');
  });

  test('should handle optional params', () => {
    const url = generateUrl('/users/:id?', { id: '123' });
    expect(url).toBe('/users/123');
  });

  test('should handle missing optional param', () => {
    const url = generateUrl('/users/:id?', {});
    expect(url).toBe('/users/');
  });

  test('should throw for missing required param', () => {
    expect(() => generateUrl('/users/:id', {})).toThrow('Missing required parameter: id');
  });

  test('should handle regex-constrained params', () => {
    const url = generateUrl('/users/:id<\\d+>', { id: '123' });
    expect(url).toBe('/users/123');
  });
});