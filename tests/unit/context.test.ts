import { describe, test, expect, beforeEach } from 'bun:test';
import { Context } from '../../src/context';
import type { PathParams } from '../../src/types';

describe('Context', () => {
  let mockRequest: Request;
  let context: Context;

  beforeEach(() => {
    mockRequest = new Request('http://localhost:3000/users/123?page=1&limit=10', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123',
      },
    });
    const params: PathParams = { id: '123' };
    context = new Context(mockRequest, params);
  });

  describe('Request Access', () => {
    test('should provide access to raw request', () => {
      expect(context.req).toBe(mockRequest);
    });

    test('should provide request method', () => {
      expect(context.method).toBe('GET');
    });

    test('should provide request URL', () => {
      expect(context.url).toBeInstanceOf(URL);
      expect(context.url.pathname).toBe('/users/123');
    });

    test('should provide path name', () => {
      expect(context.path).toBe('/users/123');
    });
  });

  describe('Parameters', () => {
    test('should provide path parameters', () => {
      expect(context.params).toEqual({ id: '123' });
    });

    test('should provide query parameters', () => {
      expect(context.query.page).toBe('1');
      expect(context.query.limit).toBe('10');
    });

    test('should handle missing query parameters', () => {
      expect(context.query.missing).toBeUndefined();
    });
  });

  describe('Headers', () => {
    test('should get header value', () => {
      expect(context.getHeader('content-type')).toBe('application/json');
      expect(context.getHeader('authorization')).toBe('Bearer token123');
    });

    test('should be case-insensitive for headers', () => {
      expect(context.getHeader('Content-Type')).toBe('application/json');
      expect(context.getHeader('CONTENT-TYPE')).toBe('application/json');
    });

    test('should return undefined for missing headers', () => {
      expect(context.getHeader('x-custom')).toBeUndefined();
    });
  });

  describe('Cookies', () => {
    test('should parse cookies from header', () => {
      const requestWithCookies = new Request('http://localhost:3000/', {
        headers: {
          Cookie: 'session=abc123; user=john',
        },
      });
      const ctx = new Context(requestWithCookies, {});

      expect(ctx.getCookie('session')).toBe('abc123');
      expect(ctx.getCookie('user')).toBe('john');
    });

    test('should return undefined for missing cookie', () => {
      expect(context.getCookie('session')).toBeUndefined();
    });
  });

  describe('Body Parsing', () => {
    test('should parse JSON body', async () => {
      const request = new Request('http://localhost:3000/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John', age: 30 }),
      });
      const ctx = new Context(request, {});

      const body = await ctx.body();
      expect(body).toEqual({ name: 'John', age: 30 });
    });

    test('should parse form data', async () => {
      const request = new Request('http://localhost:3000/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'name=John&age=30',
      });
      const ctx = new Context(request, {});

      const body = await ctx.bodyFormData();
      expect(body.get('name')).toBe('John');
      expect(body.get('age')).toBe('30');
    });

    test('should get text body', async () => {
      const request = new Request('http://localhost:3000/', {
        method: 'POST',
        body: 'plain text body',
      });
      const ctx = new Context(request, {});

      const body = await ctx.bodyText();
      expect(body).toBe('plain text body');
    });

    test('should cache parsed body', async () => {
      const request = new Request('http://localhost:3000/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John' }),
      });
      const ctx = new Context(request, {});

      const body1 = await ctx.body();
      const body2 = await ctx.body();

      expect(body1).toBe(body2);
    });
  });

  describe('Variable Storage', () => {
    test('should set and get variables', () => {
      context.set('user', { id: 1, name: 'John' });
      expect(context.get('user')).toEqual({ id: 1, name: 'John' });
    });

    test('should return undefined for missing variables', () => {
      expect(context.get('missing')).toBeUndefined();
    });

    test('should check if variable exists', () => {
      context.set('user', { id: 1 });
      expect(context.has('user')).toBe(true);
      expect(context.has('missing')).toBe(false);
    });
  });

  describe('Response Building', () => {
    test('should create JSON response', () => {
      const response = context.json({ message: 'success' });
      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('Content-Type')).toContain('application/json');
    });

    test('should create text response', () => {
      const response = context.text('Hello World');
      expect(response).toBeInstanceOf(Response);
    });

    test('should create HTML response', () => {
      const response = context.html('<h1>Hello</h1>');
      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('Content-Type')).toContain('text/html');
    });

    test('should create redirect response', () => {
      const response = context.redirect('/new-location');
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/new-location');
    });

    test('should create redirect with custom status', () => {
      const response = context.redirect('/new-location', 301);
      expect(response.status).toBe(301);
    });

    test('should set status code', () => {
      context.status(201);
      const response = context.json({ created: true });
      expect(response.status).toBe(201);
    });

    test('should set response headers', () => {
      context.setHeader('X-Custom', 'value');
      const response = context.json({});
      expect(response.headers.get('X-Custom')).toBe('value');
    });

    test('should create 404 response', () => {
      const response = context.notFound('Resource not found');
      expect(response.status).toBe(404);
    });

    test('should create error response', () => {
      const response = context.error('Something went wrong', 500);
      expect(response.status).toBe(500);
    });
  });

  describe('Response Chain', () => {
    test('should support method chaining', () => {
      const response = context
        .status(201)
        .setHeader('X-Created', 'true')
        .json({ id: 1 });

      expect(response.status).toBe(201);
      expect(response.headers.get('X-Created')).toBe('true');
    });
  });
});
