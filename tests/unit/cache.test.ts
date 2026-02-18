import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Cache, createCache, SessionStore } from '../../src/cache';

describe('Cache', () => {
  // Skip Redis tests if not available, use in-memory for testing
  let cache: Cache;

  beforeEach(async () => {
    // Use in-memory cache for testing
    cache = createCache({ 
      driver: 'memory',
      ttl: 1, // 1 second for testing
    });
    await cache.connect();
  });

  afterEach(async () => {
    await cache.disconnect();
  });

  describe('Basic Operations', () => {
    test('should set and get value', async () => {
      await cache.set('test-key', 'test-value');
      const value = await cache.get('test-key');
      
      expect(value).toBe('test-value');
    });

    test('should return null for missing key', async () => {
      const value = await cache.get('nonexistent');
      expect(value).toBeNull();
    });

    test('should delete value', async () => {
      await cache.set('test-key', 'test-value');
      await cache.delete('test-key');
      
      const value = await cache.get('test-key');
      expect(value).toBeNull();
    });

    test('should check if key exists', async () => {
      await cache.set('test-key', 'test-value');
      
      expect(await cache.has('test-key')).toBe(true);
      expect(await cache.has('nonexistent')).toBe(false);
    });

    test('should set with TTL', async () => {
      await cache.set('ttl-key', 'value', 0.5); // 0.5 seconds
      
      expect(await cache.get('ttl-key')).toBe('value');
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 600));
      
      expect(await cache.get('ttl-key')).toBeNull();
    });
  });

  describe('Advanced Operations', () => {
    test('should increment value', async () => {
      await cache.set('counter', 0);
      const newValue = await cache.increment('counter', 1);
      
      expect(newValue).toBe(1);
    });

    test('should decrement value', async () => {
      await cache.set('counter', 10);
      const newValue = await cache.decrement('counter', 3);
      
      expect(newValue).toBe(7);
    });

    test('should set multiple values', async () => {
      await cache.mset({
        'key1': 'value1',
        'key2': 'value2',
        'key3': 'value3',
      });
      
      expect(await cache.get('key1')).toBe('value1');
      expect(await cache.get('key2')).toBe('value2');
      expect(await cache.get('key3')).toBe('value3');
    });

    test('should get multiple values', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      
      const values = await cache.mget(['key1', 'key2', 'key3']);
      
      expect(values).toEqual(['value1', 'value2', null]);
    });

    test('should clear all keys', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      
      await cache.clear();
      
      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
    });
  });

  describe('JSON Operations', () => {
    test('should store and retrieve JSON objects', async () => {
      const obj = { name: 'John', age: 30 };
      await cache.set('user:1', obj);
      
      const retrieved = await cache.get<{ name: string; age: number }>('user:1');
      
      expect(retrieved).toEqual(obj);
    });

    test('should store arrays', async () => {
      const arr = [1, 2, 3, 4, 5];
      await cache.set('array', arr);
      
      const retrieved = await cache.get<number[]>('array');
      
      expect(retrieved).toEqual(arr);
    });
  });
});

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(async () => {
    store = new SessionStore({
      ttl: 1, // 1 second
    });
  });

  test('should create session', async () => {
    const sessionId = await store.create({ userId: 1, name: 'John' });
    
    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe('string');
  });

  test('should get session', async () => {
    const sessionId = await store.create({ userId: 1 });
    const session = await store.get(sessionId);
    
    expect(session).toBeDefined();
    expect(session?.userId).toBe(1);
  });

  test('should update session', async () => {
    const sessionId = await store.create({ userId: 1 });
    await store.update(sessionId, { userId: 2, name: 'Jane' });
    
    const session = await store.get(sessionId);
    expect(session?.userId).toBe(2);
    expect(session?.name).toBe('Jane');
  });

  test('should delete session', async () => {
    const sessionId = await store.create({ userId: 1 });
    await store.delete(sessionId);
    
    const session = await store.get(sessionId);
    expect(session).toBeNull();
  });

  test('should return null for invalid session', async () => {
    const session = await store.get('invalid-session-id');
    expect(session).toBeNull();
  });
});
