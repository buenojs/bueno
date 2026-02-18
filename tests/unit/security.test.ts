import { describe, test, expect, beforeEach } from 'bun:test';
import { Password, JWT, CSRF, createAuthMiddleware } from '../../src/security';
import { Context } from '../../src/context';

describe('Security', () => {
  describe('Password', () => {
    test('should hash password', async () => {
      const password = 'mySecretPassword123';
      const hash = await Password.hash(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
    });

    test('should verify correct password', async () => {
      const password = 'mySecretPassword123';
      const hash = await Password.hash(password);
      
      const isValid = await Password.verify(password, hash);
      expect(isValid).toBe(true);
    });

    test('should reject wrong password', async () => {
      const password = 'mySecretPassword123';
      const hash = await Password.hash(password);
      
      const isValid = await Password.verify('wrongPassword', hash);
      expect(isValid).toBe(false);
    });

    test('should generate unique hashes for same password', async () => {
      const password = 'mySecretPassword123';
      const hash1 = await Password.hash(password);
      const hash2 = await Password.hash(password);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('JWT', () => {
    const secret = 'test-secret-key';
    let jwt: JWT;

    beforeEach(() => {
      jwt = new JWT(secret);
    });

    test('should sign payload', async () => {
      const payload = { userId: 123, email: 'test@example.com' };
      const token = await jwt.sign(payload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // header.payload.signature
    });

    test('should verify and decode token', async () => {
      const payload = { userId: 123, email: 'test@example.com' };
      const token = await jwt.sign(payload);
      
      const decoded = await jwt.verify(token);
      
      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(123);
      expect(decoded?.email).toBe('test@example.com');
    });

    test('should reject invalid token', async () => {
      const decoded = await jwt.verify('invalid.token.here');
      expect(decoded).toBeNull();
    });

    test('should reject token signed with different secret', async () => {
      const payload = { userId: 123 };
      const token = await jwt.sign(payload);
      
      const otherJwt = new JWT('different-secret');
      const decoded = await otherJwt.verify(token);
      
      expect(decoded).toBeNull();
    });

    test('should handle expired tokens', async () => {
      const jwtWithExpiry = new JWT(secret, { expiresIn: -1 }); // Already expired
      
      const payload = { userId: 123 };
      const token = await jwtWithExpiry.sign(payload);
      
      // Wait a moment for expiry
      const decoded = await jwtWithExpiry.verify(token);
      expect(decoded).toBeNull();
    });
  });

  describe('CSRF', () => {
    test('should generate CSRF token', () => {
      const token = CSRF.generate();
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    test('should generate unique tokens', () => {
      const token1 = CSRF.generate();
      const token2 = CSRF.generate();
      
      expect(token1).not.toBe(token2);
    });

    test('should validate token with same value', () => {
      const token = CSRF.generate();
      
      expect(CSRF.verify(token, token)).toBe(true);
    });

    test('should reject invalid token', () => {
      expect(CSRF.verify('invalid-token', 'different-token')).toBe(false);
    });
  });

  describe('Auth Middleware', () => {
    const secret = 'test-secret';
    let jwt: JWT;

    beforeEach(() => {
      jwt = new JWT(secret);
    });

    test('should allow valid JWT', async () => {
      const token = await jwt.sign({ userId: 1 });
      const request = new Request('http://localhost:3000/protected', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const context = new Context(request, {});

      const middleware = createAuthMiddleware({ jwt });
      let passed = false;
      
      const response = await middleware(context, async () => {
        passed = true;
        return new Response('OK');
      });

      expect(passed).toBe(true);
      expect(context.get('user')).toBeDefined();
    });

    test('should reject missing token', async () => {
      const request = new Request('http://localhost:3000/protected');
      const context = new Context(request, {});

      const middleware = createAuthMiddleware({ jwt });
      
      const response = await middleware(context, async () => new Response('OK'));

      expect(response.status).toBe(401);
    });

    test('should reject invalid token', async () => {
      const request = new Request('http://localhost:3000/protected', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      const context = new Context(request, {});

      const middleware = createAuthMiddleware({ jwt });
      
      const response = await middleware(context, async () => new Response('OK'));

      expect(response.status).toBe(401);
    });
  });
});
