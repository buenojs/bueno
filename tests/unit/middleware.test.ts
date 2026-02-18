import { describe, test, expect, beforeEach } from 'bun:test';
import { Middleware, compose, createPipeline } from '../../src/middleware';
import { Context } from '../../src/context';

describe('Middleware Pipeline', () => {
  let mockRequest: Request;
  let context: Context;

  beforeEach(() => {
    mockRequest = new Request('http://localhost:3000/test', { method: 'GET' });
    context = new Context(mockRequest, {});
  });

  describe('compose', () => {
    test('should compose empty middleware array', async () => {
      const pipeline = compose([]);
      const handler = () => new Response('OK');
      const response = await pipeline(context, handler);
      
      expect(response.status).toBe(200);
    });

    test('should compose single middleware', async () => {
      const middleware: Middleware = async (ctx, next) => {
        ctx.set('executed', true);
        return await next();
      };

      const pipeline = compose([middleware]);
      const handler = () => new Response('OK');
      const response = await pipeline(context, handler);

      expect(context.get('executed')).toBe(true);
      expect(response.status).toBe(200);
    });

    test('should compose multiple middleware in order', async () => {
      const order: number[] = [];
      
      const middleware1: Middleware = async (ctx, next) => {
        order.push(1);
        await next();
        order.push(4);
      };

      const middleware2: Middleware = async (ctx, next) => {
        order.push(2);
        await next();
        order.push(3);
      };

      const pipeline = compose([middleware1, middleware2]);
      const handler = () => {
        order.push(5);
        return new Response('OK');
      };

      await pipeline(context, handler);
      
      expect(order).toEqual([1, 2, 5, 3, 4]);
    });

    test('should pass context through middleware', async () => {
      const middleware: Middleware = async (ctx, next) => {
        ctx.set('before', 'value1');
        const response = await next();
        ctx.set('after', 'value2');
        return response;
      };

      const pipeline = compose([middleware]);
      await pipeline(context, () => new Response('OK'));

      expect(context.get('before')).toBe('value1');
      expect(context.get('after')).toBe('value2');
    });

    test('should allow early termination', async () => {
      const middleware: Middleware = async (ctx, next) => {
        return new Response('Unauthorized', { status: 401 });
      };

      const pipeline = compose([middleware]);
      const handler = () => {
        throw new Error('Should not be called');
      };

      const response = await pipeline(context, handler);
      expect(response.status).toBe(401);
    });

    test('should handle errors in middleware', async () => {
      const middleware: Middleware = async (ctx, next) => {
        try {
          return await next();
        } catch (error) {
          return new Response('Internal Server Error', { status: 500 });
        }
      };

      const pipeline = compose([middleware]);
      const handler = () => {
        throw new Error('Handler error');
      };

      const response = await pipeline(context, handler);
      expect(response.status).toBe(500);
    });
  });

  describe('createPipeline', () => {
    test('should create reusable pipeline', async () => {
      const pipeline = createPipeline();
      
      pipeline.use(async (ctx, next) => {
        ctx.set('step1', true);
        return await next();
      });

      pipeline.use(async (ctx, next) => {
        ctx.set('step2', true);
        return await next();
      });

      const response = await pipeline.execute(context, () => new Response('OK'));

      expect(context.get('step1')).toBe(true);
      expect(context.get('step2')).toBe(true);
      expect(response.status).toBe(200);
    });

    test('should allow adding middleware after creation', async () => {
      const pipeline = createPipeline();
      
      pipeline.use(async (ctx, next) => {
        ctx.set('count', 1);
        return await next();
      });

      let response = await pipeline.execute(context, () => new Response('OK'));
      expect(context.get('count')).toBe(1);

      // Add more middleware
      pipeline.use(async (ctx, next) => {
        ctx.set('count', (ctx.get('count') as number) + 1);
        return await next();
      });

      const ctx2 = new Context(mockRequest, {});
      response = await pipeline.execute(ctx2, () => new Response('OK'));
      expect(ctx2.get('count')).toBe(2);
    });
  });

  describe('Built-in Middleware', () => {
    test('logger middleware should work', async () => {
      const { logger } = await import('../../src/middleware/built-in');
      
      const pipeline = compose([logger()]);
      const response = await pipeline(context, () => new Response('OK'));
      
      expect(response.status).toBe(200);
    });

    test('CORS middleware should add headers', async () => {
      const { cors } = await import('../../src/middleware/built-in');
      
      const pipeline = compose([cors()]);
      const response = await pipeline(context, () => new Response('OK'));
      
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    test('requestId middleware should set request ID', async () => {
      const { requestId } = await import('../../src/middleware/built-in');
      
      const pipeline = compose([requestId()]);
      const response = await pipeline(context, () => new Response('OK'));
      
      expect(context.get('requestId')).toBeDefined();
      expect(response.headers.get('X-Request-Id')).toBeDefined();
    });
  });
});
