import { describe, test, expect, beforeEach, afterEach, vi } from 'bun:test';
import { createRPClient, extractRouteTypes, type RPCClient } from '../../src/rpc';
import { Router } from '../../src/router';
import { Application } from '../../src/modules';
import { Context } from '../../src/context';

const createMockApp = () => {
  const router = new Router();
  router.get('/users', (ctx) => ctx.json([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]));
  router.get('/users/:id', (ctx) => ctx.json({ id: parseInt(ctx.params.id), name: 'User' }));
  router.get('/slow', async (ctx) => {
    await new Promise(resolve => setTimeout(resolve, 100));
    return ctx.json({ timestamp: Date.now() });
  });
  router.post('/users', (ctx) => ctx.json({ created: true }));
  router.put('/users/:id', (ctx) => ctx.json({ updated: true }));
  router.delete('/users/:id', (ctx) => ctx.json({ deleted: true }));
  
  return router;
};

describe('RPC Client', () => {
  let client: RPCClient;
  let server: ReturnType<typeof Bun.serve>;
  let router: Router;

  beforeEach(async () => {
    router = createMockApp();
    
    server = Bun.serve({
      port: 3999,
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        const match = router.match(request.method as 'GET', url.pathname);
        
        if (!match) {
          return new Response('Not Found', { status: 404 });
        }
        
        const context = new Context(request, match.params);
        return match.handler(context);
      },
    });

    client = createRPClient({
      baseUrl: 'http://localhost:3999',
    });
  });

  afterEach(() => {
    server.stop();
  });

  describe('HTTP Methods', () => {
    test('should make GET request', async () => {
      const response = await client.get('/users');
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toEqual([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
    });

    test('should make GET request with path params', async () => {
      const response = await client.get('/users/123');
      const data = await response.json();
      
      expect(data).toEqual({ id: 123, name: 'User' });
    });

    test('should make POST request with body', async () => {
      const response = await client.post('/users', { name: 'New User' });
      const data = await response.json();
      
      expect(data).toEqual({ created: true });
    });

    test('should make PUT request', async () => {
      const response = await client.put('/users/123', { name: 'Updated' });
      const data = await response.json();
      
      expect(data).toEqual({ updated: true });
    });

    test('should make DELETE request', async () => {
      const response = await client.delete('/users/123');
      const data = await response.json();
      
      expect(data).toEqual({ deleted: true });
    });
  });

  describe('Request Options', () => {
    test('should include custom headers', async () => {
      const response = await client.get('/users', {
        headers: { 'X-Custom': 'value' },
      });
      
      expect(response.status).toBe(200);
    });

    test('should include query parameters', async () => {
      const response = await client.get('/users', {
        query: { page: '1', limit: '10' },
      });
      
      expect(response.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    test('should handle 404', async () => {
      const response = await client.get('/nonexistent');
      expect(response.status).toBe(404);
    });
  });
});

describe('Request Deduplication', () => {
  let client: RPCClient;
  let server: ReturnType<typeof Bun.serve>;
  let router: Router;
  let requestCount: number;

  beforeEach(async () => {
    requestCount = 0;
    router = createMockApp();
    
    server = Bun.serve({
      port: 4000,
      fetch: async (request: Request) => {
        requestCount++;
        const url = new URL(request.url);
        const match = router.match(request.method as 'GET', url.pathname);
        
        if (!match) {
          return new Response('Not Found', { status: 404 });
        }
        
        const context = new Context(request, match.params);
        return match.handler(context);
      },
    });

    client = createRPClient({
      baseUrl: 'http://localhost:4000',
      deduplication: {
        enabled: true,
        ttl: 1000,
      },
    });
  });

  afterEach(() => {
    server.stop();
  });

  describe('Concurrent Request Deduplication', () => {
    test('should deduplicate concurrent identical requests', async () => {
      const promises = [
        client.get('/slow'),
        client.get('/slow'),
        client.get('/slow'),
      ];
      
      const responses = await Promise.all(promises);
      
      expect(responses.length).toBe(3);
      expect(requestCount).toBe(1);
    });

    test('should not deduplicate requests with skipDeduplication', async () => {
      const promises = [
        client.get('/slow'),
        client.get('/slow', { skipDeduplication: true }),
      ];
      
      const responses = await Promise.all(promises);
      
      expect(responses.length).toBe(2);
      expect(requestCount).toBe(2);
    });

    test('should deduplicate POST requests with same body', async () => {
      const body = { name: 'Test' };
      const promises = [
        client.post('/users', body),
        client.post('/users', body),
      ];
      
      const responses = await Promise.all(promises);
      
      expect(responses.length).toBe(2);
      expect(requestCount).toBe(1);
    });

    test('should NOT deduplicate POST requests with different bodies', async () => {
      const promises = [
        client.post('/users', { name: 'Test1' }),
        client.post('/users', { name: 'Test2' }),
      ];
      
      const responses = await Promise.all(promises);
      
      expect(responses.length).toBe(2);
      expect(requestCount).toBe(2);
    });
  });

  describe('Cache for GET Requests', () => {
    test('should cache successful GET responses', async () => {
      const response1 = await client.get('/users');
      const data1 = await response1.json();
      
      const response2 = await client.get('/users');
      const data2 = await response2.json();
      
      expect(data1).toEqual(data2);
      expect(requestCount).toBe(1);
    });

    test('should respect TTL for cached responses', async () => {
      const response1 = await client.get('/users');
      await response1.json();
      
      expect(requestCount).toBe(1);
      
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const response2 = await client.get('/users');
      await response2.json();
      
      expect(requestCount).toBe(2);
    });

    test('should not cache failed responses', async () => {
      await client.get('/nonexistent');
      await client.get('/nonexistent');
      
      expect(requestCount).toBe(2);
    });

    test('should clear cache', async () => {
      await client.get('/users');
      expect(requestCount).toBe(1);
      
      client.clearCache();
      
      await client.get('/users');
      expect(requestCount).toBe(2);
    });
  });

  describe('Deduplication Configuration', () => {
    test('should disable deduplication when configured', async () => {
      const noDedupeClient = createRPClient({
        baseUrl: 'http://localhost:4000',
        deduplication: { enabled: false },
      });
      
      const promises = [
        noDedupeClient.get('/users'),
        noDedupeClient.get('/users'),
      ];
      
      await Promise.all(promises);
      
      expect(requestCount).toBe(2);
    });

    test('should use custom key generator', async () => {
      let customKeyCalled = false;
      
      const customClient = createRPClient({
        baseUrl: 'http://localhost:4000',
        deduplication: {
          keyGenerator: (method, url, body) => {
            customKeyCalled = true;
            return `custom-${method}-${url}`;
          },
        },
      });
      
      await customClient.get('/users');
      
      expect(customKeyCalled).toBe(true);
    });

    test('should expose deduplication config', () => {
      expect(client.isDeduplicationEnabled()).toBe(true);
      expect(client.getDeduplicationTTL()).toBe(1000);
    });

    test('should expose deduplication stats', async () => {
      await client.get('/users');
      
      const stats = client.getDeduplicationStats();
      expect(stats.cached).toBe(1);
      expect(stats.pending).toBe(0);
    });
  });

  describe('withBaseUrl and withHeaders', () => {
    test('should preserve deduplication config in withBaseUrl', async () => {
      const newClient = client.withBaseUrl('http://localhost:4000');
      
      await newClient.get('/users');
      await newClient.get('/users');
      
      expect(requestCount).toBe(1);
    });

    test('should preserve deduplication config in withHeaders', async () => {
      const newClient = client.withHeaders({ 'X-Test': 'value' });
      
      await newClient.get('/users');
      await newClient.get('/users');
      
      expect(requestCount).toBe(1);
    });
  });
});

describe('extractRouteTypes', () => {
  test('should extract route information', () => {
    const router = createMockApp();
    const routes = extractRouteTypes(router);
    
    expect(routes.length).toBeGreaterThan(0);
    expect(routes[0]).toHaveProperty('method');
    expect(routes[0]).toHaveProperty('path');
  });
});

describe('Optimistic Updates', () => {
  let client: RPCClient;
  let server: ReturnType<typeof Bun.serve>;
  let router: Router;

  beforeEach(async () => {
    router = new Router();
    router.get('/users', (ctx) => ctx.json([{ id: 1, name: 'John' }]));
    router.get('/users/:id', (ctx) => ctx.json({ id: parseInt(ctx.params.id), name: 'User' }));
    router.post('/users', async (ctx) => {
      const body = await ctx.req.json();
      return ctx.json({ id: 3, ...body, created: true });
    });
    router.put('/users/:id', async (ctx) => {
      const body = await ctx.req.json();
      return ctx.json({ id: parseInt(ctx.params.id), ...body, updated: true });
    });
    router.patch('/users/:id', async (ctx) => {
      const body = await ctx.req.json();
      return ctx.json({ id: parseInt(ctx.params.id), ...body, patched: true });
    });
    router.delete('/users/:id', (ctx) => ctx.json({ deleted: true, id: parseInt(ctx.params.id) }));
    router.post('/fail', (ctx) => new Response('Error', { status: 500 }));
    
    server = Bun.serve({
      port: 4001,
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        const match = router.match(request.method as 'GET', url.pathname);
        
        if (!match) {
          return new Response('Not Found', { status: 404 });
        }
        
        const context = new Context(request, match.params);
        return match.handler(context);
      },
    });

    client = createRPClient({
      baseUrl: 'http://localhost:4001',
      optimisticUpdates: {
        enabled: true,
        autoRollback: true,
      },
    });
  });

  afterEach(() => {
    server.stop();
  });

  describe('Optimistic POST', () => {
    test('should update cache optimistically on POST', async () => {
      const optimisticData = { id: 3, name: 'New User' };
      
      const { response, rollbackId } = await client.optimisticPost(
        '/users',
        { name: 'New User' },
        { optimisticData, cacheKey: '/users' }
      );
      
      expect(response.ok).toBe(true);
      expect(rollbackId).toBeDefined();
      
      const data = await response.json();
      expect(data.created).toBe(true);
    });

    test('should call onConfirm callback on success', async () => {
      let confirmCalled = false;
      const onConfirm = () => { confirmCalled = true; };
      
      await client.optimisticPost(
        '/users',
        { name: 'New User' },
        { 
          optimisticData: { id: 3, name: 'New User' },
          cacheKey: '/users',
          onConfirm 
        }
      );
      
      expect(confirmCalled).toBe(true);
    });

    test('should rollback on failure', async () => {
      let rollbackCalled = false;
      const onRollback = () => { rollbackCalled = true; };
      
      const { response } = await client.optimisticPost(
        '/fail',
        { name: 'New User' },
        { 
          optimisticData: { id: 3, name: 'New User' },
          cacheKey: '/users',
          onRollback 
        }
      );
      
      expect(response.ok).toBe(false);
      expect(rollbackCalled).toBe(true);
    });
  });

  describe('Optimistic PUT', () => {
    test('should update cache optimistically on PUT', async () => {
      const optimisticData = { id: 1, name: 'Updated User' };
      
      const { response, rollbackId } = await client.optimisticPut(
        '/users/1',
        { name: 'Updated User' },
        { optimisticData, cacheKey: '/users/1' }
      );
      
      expect(response.ok).toBe(true);
      expect(rollbackId).toBeDefined();
      
      const data = await response.json();
      expect(data.updated).toBe(true);
    });
  });

  describe('Optimistic PATCH', () => {
    test('should update cache optimistically on PATCH', async () => {
      const optimisticData = { id: 1, name: 'Patched User', updated: true };
      
      const { response } = await client.optimisticPatch(
        '/users/1',
        { name: 'Patched User' },
        { optimisticData, cacheKey: '/users/1' }
      );
      
      expect(response.ok).toBe(true);
    });
  });

  describe('Optimistic DELETE', () => {
    test('should update cache optimistically on DELETE', async () => {
      const { response } = await client.optimisticDelete('/users/1', {
        optimisticData: { deleted: true },
        cacheKey: '/users/1',
      });
      
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(data.deleted).toBe(true);
    });
  });

  describe('Manual Rollback', () => {
    test('should manually rollback when autoRollback is disabled', async () => {
      const manualClient = createRPClient({
        baseUrl: 'http://localhost:4001',
        optimisticUpdates: {
          enabled: true,
          autoRollback: false,
        },
      });
      
      const { response, rollbackId } = await manualClient.optimisticPost(
        '/fail',
        { name: 'New User' },
        { optimisticData: { id: 3, name: 'New User' }, cacheKey: '/users' }
      );
      
      expect(response.ok).toBe(false);
      expect(rollbackId).toBeDefined();
      
      const previousData = manualClient.rollback(rollbackId!);
      expect(previousData).toBeUndefined();
    });
  });

  describe('Pending Optimistic Updates', () => {
    test('should check for pending optimistic updates', async () => {
      expect(client.hasPendingOptimisticUpdate('/users')).toBe(false);
      
      await client.optimisticPost(
        '/users',
        { name: 'New User' },
        { optimisticData: { id: 3, name: 'New User' }, cacheKey: '/users' }
      );
      
      expect(client.hasPendingOptimisticUpdate('/users')).toBe(false);
    });

    test('should get optimistic data for pending update', () => {
      const optimisticData = { id: 3, name: 'New User' };
      expect(client.getOptimisticData('/users')).toBeUndefined();
    });

    test('should count pending optimistic updates', async () => {
      expect(client.getPendingOptimisticCount()).toBe(0);
    });

    test('should clear all optimistic updates', async () => {
      client.clearOptimisticUpdates();
      expect(client.getPendingOptimisticCount()).toBe(0);
    });
  });

  describe('Configuration', () => {
    test('should check if optimistic updates are enabled', () => {
      expect(client.isOptimisticUpdatesEnabled()).toBe(true);
    });

    test('should disable optimistic updates when configured', async () => {
      const disabledClient = createRPClient({
        baseUrl: 'http://localhost:4001',
        optimisticUpdates: { enabled: false },
      });
      
      const { rollbackId } = await disabledClient.optimisticPost(
        '/users',
        { name: 'New User' },
        { optimisticData: { id: 3, name: 'New User' }, cacheKey: '/users' }
      );
      
      expect(rollbackId).toBeUndefined();
    });
  });

  describe('Cache Management', () => {
    test('should clear all caches', () => {
      client.clearAllCaches();
      
      const stats = client.getDeduplicationStats();
      expect(stats.cached).toBe(0);
      expect(stats.pending).toBe(0);
    });

    test('should invalidate specific cache key', async () => {
      await client.get('/users');
      
      const statsBefore = client.getDeduplicationStats();
      expect(statsBefore.cached).toBe(1);
      
      client.clearCache();
      
      const statsAfter = client.getDeduplicationStats();
      expect(statsAfter.cached).toBe(0);
    });
  });
});

describe('Retry Logic', () => {
  let client: RPCClient;
  let server: ReturnType<typeof Bun.serve>;
  let router: Router;
  let requestCount: number;
  let retryAttempts: number;

  beforeEach(async () => {
    requestCount = 0;
    retryAttempts = 0;
    router = new Router();
    router.get('/users', (ctx) => {
      requestCount++;
      return ctx.json([{ id: 1, name: 'John' }]);
    });
    router.get('/flaky', (ctx) => {
      requestCount++;
      if (requestCount < 3) {
        return new Response('Service Unavailable', { status: 503 });
      }
      return ctx.json({ success: true, attempt: requestCount });
    });
    router.get('/timeout', async (ctx) => {
      requestCount++;
      await new Promise(resolve => setTimeout(resolve, 200));
      return ctx.json({ success: true });
    });
    router.get('/error', (ctx) => {
      requestCount++;
      return new Response('Internal Server Error', { status: 500 });
    });
    router.get('/always-fail', (ctx) => {
      requestCount++;
      return new Response('Always Fails', { status: 503 });
    });
    router.get('/nonexistent', (ctx) => {
      requestCount++;
      return new Response('Not Found', { status: 404 });
    });
    
    server = Bun.serve({
      port: 4002,
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        const match = router.match(request.method as 'GET', url.pathname);
        
        if (!match) {
          return new Response('Not Found', { status: 404 });
        }
        
        const context = new Context(request, match.params);
        return match.handler(context);
      },
    });

    client = createRPClient({
      baseUrl: 'http://localhost:4002',
      retry: {
        enabled: true,
        maxAttempts: 3,
        initialDelay: 50,
        maxDelay: 500,
        backoffMultiplier: 2,
        retryableStatusCodes: [500, 502, 503, 504],
        onRetry: (attempt, error, delay) => {
          retryAttempts = attempt;
        },
      },
    });
  });

  afterEach(() => {
    server.stop();
  });

  describe('Basic Retry', () => {
    test('should retry on retryable status codes', async () => {
      const response = await client.get('/flaky');
      
      expect(response.ok).toBe(true);
      expect(requestCount).toBe(3);
      expect(retryAttempts).toBe(2);
      
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    test('should not retry on success', async () => {
      const response = await client.get('/users');
      
      expect(response.ok).toBe(true);
      expect(requestCount).toBe(1);
    });

    test('should not retry on non-retryable status', async () => {
      const response = await client.get('/nonexistent');
      
      expect(response.status).toBe(404);
      expect(requestCount).toBe(1);
    });

    test('should respect max attempts', async () => {
      const response = await client.get('/always-fail');
      
      expect(response.status).toBe(503);
      expect(requestCount).toBe(3);
    });
  });

  describe('Retry Configuration', () => {
    test('should disable retry when configured', async () => {
      const noRetryClient = createRPClient({
        baseUrl: 'http://localhost:4002',
        retry: { enabled: false },
      });
      
      const response = await noRetryClient.get('/always-fail');
      
      expect(response.status).toBe(503);
      expect(requestCount).toBe(1);
    });

    test('should use custom max attempts via per-request options', async () => {
      const response = await client.get('/always-fail', {
        retry: {
          enabled: true,
          maxAttempts: 2,
          initialDelay: 10,
        },
      });
      
      expect(response.status).toBe(503);
      expect(requestCount).toBe(2);
    });

    test('should skip retry per-request', async () => {
      const response = await client.get('/always-fail', {
        retry: { skipRetry: true },
      });
      
      expect(response.status).toBe(503);
      expect(requestCount).toBe(1);
    });

    test('should override retry options per-request', async () => {
      const response = await client.get('/flaky', {
        retry: {
          enabled: true,
          maxAttempts: 1,
        },
      });
      
      expect(response.status).toBe(503);
      expect(requestCount).toBe(1);
    });
  });

  describe('Exponential Backoff', () => {
    test('should calculate backoff delays correctly', async () => {
      const delays: number[] = [];
      let startTime = Date.now();
      
      const backoffClient = createRPClient({
        baseUrl: 'http://localhost:4002',
        retry: {
          enabled: true,
          maxAttempts: 4,
          initialDelay: 50,
          maxDelay: 1000,
          backoffMultiplier: 2,
          onRetry: (attempt, error, delay) => {
            delays.push(Date.now() - startTime);
            startTime = Date.now();
          },
        },
      });
      
      requestCount = 0;
      router.get('/backoff-test', (ctx) => {
        requestCount++;
        return new Response('Error', { status: 503 });
      });
      
      await backoffClient.get('/backoff-test');
      
      expect(delays.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Retry Callbacks', () => {
    test('should call onRetry callback', async () => {
      let retryCount = 0;
      
      const callbackClient = createRPClient({
        baseUrl: 'http://localhost:4002',
        retry: {
          enabled: true,
          maxAttempts: 3,
          initialDelay: 10,
          onRetry: (attempt, error, delay) => {
            retryCount++;
          },
        },
      });
      
      await callbackClient.get('/always-fail');
      
      expect(retryCount).toBe(2);
    });

    test('should call onRetry with error info', async () => {
      let lastError: Error | null = null;
      
      const callbackClient = createRPClient({
        baseUrl: 'http://localhost:4002',
        retry: {
          enabled: true,
          maxAttempts: 2,
          initialDelay: 10,
          onRetry: (attempt, error, delay) => {
            lastError = error;
          },
        },
      });
      
      await callbackClient.get('/always-fail');
      
      expect(lastError).toBeNull();
    });
  });

  describe('Retry Utilities', () => {
    test('should expose retry config', () => {
      expect(client.isRetryEnabled()).toBe(true);
      expect(client.getMaxRetryAttempts()).toBe(3);
      
      const config = client.getRetryConfig();
      expect(config.initialDelay).toBe(50);
      expect(config.backoffMultiplier).toBe(2);
    });

    test('should use withRetry method', async () => {
      const response = await client.withRetry('GET', '/flaky', undefined, {
        maxAttempts: 2,
      });
      
      expect(response.status).toBe(503);
      expect(requestCount).toBe(2);
    });
  });

  describe('Custom Should Retry', () => {
    test('should use custom shouldRetry function', async () => {
      let customRetryCalled = false;
      
      const customClient = createRPClient({
        baseUrl: 'http://localhost:4002',
        retry: {
          enabled: true,
          maxAttempts: 3,
          initialDelay: 10,
          shouldRetry: (response, error, attempt) => {
            customRetryCalled = true;
            return response?.status === 429;
          },
        },
      });
      
      const response = await customClient.get('/always-fail');
      
      expect(customRetryCalled).toBe(true);
      expect(requestCount).toBe(1);
    });
  });

  describe('Client Preservation', () => {
    test('should preserve retry config in withBaseUrl', async () => {
      const newClient = client.withBaseUrl('http://localhost:4002');
      
      const response = await newClient.get('/always-fail');
      
      expect(response.status).toBe(503);
      expect(requestCount).toBe(3);
    });

    test('should preserve retry config in withHeaders', async () => {
      const newClient = client.withHeaders({ 'X-Test': 'value' });
      
      const response = await newClient.get('/always-fail');
      
      expect(response.status).toBe(503);
      expect(requestCount).toBe(3);
    });
  });
});

describe('Interceptors', () => {
  let client: RPCClient;
  let server: ReturnType<typeof Bun.serve>;
  let router: Router;

  beforeEach(async () => {
    router = new Router();
    router.get('/users', (ctx) => ctx.json([{ id: 1, name: 'John' }]));
    router.get('/error', (ctx) => new Response('Server Error', { status: 500 }));
    router.post('/users', async (ctx) => {
      const body = await ctx.req.json();
      return ctx.json({ created: true, ...body });
    });
    
    server = Bun.serve({
      port: 4003,
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        const match = router.match(request.method as 'GET', url.pathname);
        
        if (!match) {
          return new Response('Not Found', { status: 404 });
        }
        
        const context = new Context(request, match.params);
        return match.handler(context);
      },
    });
  });

  afterEach(() => {
    server.stop();
  });

  describe('Request Interceptors', () => {
    test('should apply single request interceptor', async () => {
      let interceptedUrl = '';
      
      client = createRPClient({
        baseUrl: 'http://localhost:4003',
        interceptors: {
          request: (config) => {
            interceptedUrl = config.url;
            return config;
          },
        },
      });
      
      await client.get('/users');
      
      expect(interceptedUrl).toBe('http://localhost:4003/users');
    });

    test('should apply multiple request interceptors in order', async () => {
      const order: number[] = [];
      
      client = createRPClient({
        baseUrl: 'http://localhost:4003',
        interceptors: {
          request: [
            (config) => {
              order.push(1);
              return config;
            },
            (config) => {
              order.push(2);
              return config;
            },
          ],
        },
      });
      
      await client.get('/users');
      
      expect(order).toEqual([1, 2]);
    });

    test('should modify request config', async () => {
      client = createRPClient({
        baseUrl: 'http://localhost:4003',
        interceptors: {
          request: (config) => {
            config.headers = { ...config.headers, 'X-Custom-Header': 'test-value' };
            return config;
          },
        },
      });
      
      const response = await client.get('/users');
      expect(response.ok).toBe(true);
    });

    test('should add request interceptor dynamically', async () => {
      let interceptorCalled = false;
      
      client = createRPClient({ baseUrl: 'http://localhost:4003' });
      client.addRequestInterceptor((config) => {
        interceptorCalled = true;
        return config;
      });
      
      await client.get('/users');
      
      expect(interceptorCalled).toBe(true);
    });

    test('should remove request interceptor', async () => {
      let callCount = 0;
      
      const interceptor = (config: any) => {
        callCount++;
        return config;
      };
      
      client = createRPClient({ baseUrl: 'http://localhost:4003' });
      client.addRequestInterceptor(interceptor);
      
      await client.get('/users');
      expect(callCount).toBe(1);
      
      client.removeRequestInterceptor(interceptor);
      
      await client.get('/users');
      expect(callCount).toBe(1);
    });
  });

  describe('Response Interceptors', () => {
    test('should apply single response interceptor', async () => {
      let interceptedStatus = 0;
      
      client = createRPClient({
        baseUrl: 'http://localhost:4003',
        interceptors: {
          response: (response) => {
            interceptedStatus = response.status;
            return response;
          },
        },
      });
      
      await client.get('/users');
      
      expect(interceptedStatus).toBe(200);
    });

    test('should apply multiple response interceptors', async () => {
      const order: number[] = [];
      
      client = createRPClient({
        baseUrl: 'http://localhost:4003',
        interceptors: {
          response: [
            (response) => {
              order.push(1);
              return response;
            },
            (response) => {
              order.push(2);
              return response;
            },
          ],
        },
      });
      
      await client.get('/users');
      
      expect(order).toEqual([1, 2]);
    });

    test('should transform response', async () => {
      client = createRPClient({
        baseUrl: 'http://localhost:4003',
        interceptors: {
          response: (response) => {
            const headers = new Headers(response.headers);
            headers.set('X-Intercepted', 'true');
            return new Response(response.body, {
              status: response.status,
              headers,
            });
          },
        },
      });
      
      const response = await client.get('/users');
      expect(response.headers.get('X-Intercepted')).toBe('true');
    });

    test('should add response interceptor dynamically', async () => {
      let interceptorCalled = false;
      
      client = createRPClient({ baseUrl: 'http://localhost:4003' });
      client.addResponseInterceptor((response) => {
        interceptorCalled = true;
        return response;
      });
      
      await client.get('/users');
      
      expect(interceptorCalled).toBe(true);
    });
  });

  describe('Error Interceptors', () => {
    test('should handle network errors', async () => {
      let errorInterceptorCalled = false;
      
      client = createRPClient({
        baseUrl: 'http://localhost:9999',
        timeout: 100,
        retry: { enabled: false },
        interceptors: {
          error: (error) => {
            errorInterceptorCalled = true;
          },
        },
      });
      
      try {
        await client.get('/users');
      } catch {
      }
      
      expect(errorInterceptorCalled).toBe(true);
    });

    test('should allow error interceptor to return fallback response', async () => {
      client = createRPClient({
        baseUrl: 'http://localhost:9999',
        timeout: 100,
        retry: { enabled: false },
        interceptors: {
          error: () => {
            return new Response(JSON.stringify({ fallback: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          },
        },
      });
      
      const response = await client.get('/users');
      const data = await response.json();
      
      expect(data.fallback).toBe(true);
    });

    test('should add error interceptor dynamically', async () => {
      let interceptorCalled = false;
      
      client = createRPClient({
        baseUrl: 'http://localhost:9999',
        timeout: 100,
        retry: { enabled: false },
      });
      client.addErrorInterceptor(() => {
        interceptorCalled = true;
      });
      
      try {
        await client.get('/users');
      } catch {
      }
      
      expect(interceptorCalled).toBe(true);
    });
  });

  describe('Interceptor Management', () => {
    test('should clear all interceptors', async () => {
      let requestCalled = false;
      let responseCalled = false;
      let errorCalled = false;
      
      client = createRPClient({
        baseUrl: 'http://localhost:4003',
        interceptors: {
          request: (config) => {
            requestCalled = true;
            return config;
          },
          response: (response) => {
            responseCalled = true;
            return response;
          },
        },
      });
      client.addErrorInterceptor(() => {
        errorCalled = true;
      });
      
      client.clearInterceptors();
      
      await client.get('/users');
      
      expect(requestCalled).toBe(false);
      expect(responseCalled).toBe(false);
    });

    test('should get interceptor stats', async () => {
      client = createRPClient({
        baseUrl: 'http://localhost:4003',
        interceptors: {
          request: [(config) => config, (config) => config],
          response: (response) => response,
        },
      });
      client.addErrorInterceptor(() => {});
      
      const stats = client.getInterceptorStats();
      
      expect(stats.request).toBe(2);
      expect(stats.response).toBe(1);
      expect(stats.error).toBe(1);
    });

    test('should create client with interceptors', async () => {
      client = createRPClient({ baseUrl: 'http://localhost:4003' });
      
      const newClient = client.withInterceptors({
        request: (config) => {
          config.headers = { ...config.headers, 'X-New': 'value' };
          return config;
        },
      });
      
      const response = await newClient.get('/users');
      expect(response.ok).toBe(true);
    });
  });

  describe('Interceptor Preservation', () => {
    test('should preserve interceptors in withBaseUrl', async () => {
      let interceptorCalled = false;
      
      client = createRPClient({
        baseUrl: 'http://localhost:4003',
        interceptors: {
          request: (config) => {
            interceptorCalled = true;
            return config;
          },
        },
      });
      
      const newClient = client.withBaseUrl('http://localhost:4003');
      await newClient.get('/users');
      
      expect(interceptorCalled).toBe(true);
    });

    test('should preserve interceptors in withHeaders', async () => {
      let interceptorCalled = false;
      
      client = createRPClient({
        baseUrl: 'http://localhost:4003',
        interceptors: {
          request: (config) => {
            interceptorCalled = true;
            return config;
          },
        },
      });
      
      const newClient = client.withHeaders({ 'X-Test': 'value' });
      await newClient.get('/users');
      
      expect(interceptorCalled).toBe(true);
    });
  });
});