import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  DistributedLock,
  createDistributedLock,
  createMemoryLock,
  LockAcquireError,
} from '../../src/lock';

describe('DistributedLock (In-Memory)', () => {
  let lock: DistributedLock;

  beforeEach(() => {
    lock = createMemoryLock();
  });

  afterEach(() => {
    lock.disconnect();
  });

  describe('Basic Lock Acquisition', () => {
    test('should acquire a lock successfully', async () => {
      const handle = await lock.acquire('test-key');

      expect(handle.acquired).toBe(true);
      expect(handle.key).toBe('lock:test-key');
      expect(handle.value).toBeDefined();
      expect(handle.value.length).toBe(32); // 16 bytes = 32 hex chars
    });

    test('should prevent concurrent access', async () => {
      const handle1 = await lock.acquire('shared-key');
      expect(handle1.acquired).toBe(true);

      const handle2 = await lock.acquire('shared-key', { retryCount: 0 });
      expect(handle2.acquired).toBe(false);
    });

    test('should release a lock', async () => {
      const handle = await lock.acquire('release-test');
      expect(handle.acquired).toBe(true);

      const released = await handle.release();
      expect(released).toBe(true);

      // Should be able to acquire again
      const handle2 = await lock.acquire('release-test');
      expect(handle2.acquired).toBe(true);
    });

    test('should not release a lock we dont own', async () => {
      const handle = await lock.acquire('ownership-test');
      
      // Create another lock instance trying to release
      const otherLock = createMemoryLock();
      const otherHandle = await otherLock.acquire('ownership-test', { retryCount: 0 });
      
      // Other lock should fail to acquire
      expect(otherHandle.acquired).toBe(false);
      
      // Other handle release should return false
      const released = await otherHandle.release();
      expect(released).toBe(false);

      otherLock.disconnect();
    });
  });

  describe('Lock Extension', () => {
    test('should extend a lock', async () => {
      const handle = await lock.acquire('extend-test', { ttl: 1000 });
      expect(handle.acquired).toBe(true);

      const extended = await handle.extend(2000);
      expect(extended).toBe(true);

      const remaining = await handle.getRemainingTTL();
      expect(remaining).toBeGreaterThan(1000);
    });

    test('should not extend a released lock', async () => {
      const handle = await lock.acquire('extend-released-test');
      await handle.release();

      const extended = await handle.extend(1000);
      expect(extended).toBe(false);
    });
  });

  describe('Lock Validity', () => {
    test('should check if lock is valid', async () => {
      const handle = await lock.acquire('validity-test');
      expect(await handle.isValid()).toBe(true);

      await handle.release();
      expect(await handle.isValid()).toBe(false);
    });

    test('should get remaining TTL', async () => {
      const handle = await lock.acquire('ttl-test', { ttl: 5000 });
      const remaining = await handle.getRemainingTTL();

      expect(remaining).toBeGreaterThan(4000);
      expect(remaining).toBeLessThanOrEqual(5000);
    });

    test('should return -1 for invalid lock TTL', async () => {
      const handle = await lock.acquire('ttl-invalid-test', { retryCount: 0 });
      
      if (!handle.acquired) {
        const remaining = await handle.getRemainingTTL();
        expect(remaining).toBe(-1);
      }
    });
  });

  describe('Retry Logic', () => {
    test('should retry on failure', async () => {
      const handle1 = await lock.acquire('retry-test', { ttl: 100 });

      // Start acquiring the same lock
      const acquirePromise = lock.acquire('retry-test', {
        ttl: 500,
        retryCount: 5,
        retryDelay: 50,
      });

      // Release the first lock after a short delay
      setTimeout(() => handle1.release(), 80);

      const handle2 = await acquirePromise;
      expect(handle2.acquired).toBe(true);
    });

    test('should fail after max retries', async () => {
      const handle1 = await lock.acquire('max-retry-test', { ttl: 10000 });

      const handle2 = await lock.acquire('max-retry-test', {
        ttl: 500,
        retryCount: 2,
        retryDelay: 10,
      });

      expect(handle2.acquired).toBe(false);

      await handle1.release();
    });
  });

  describe('withLock Helper', () => {
    test('should execute function with lock', async () => {
      const result = await lock.withLock('withlock-test', async (handle) => {
        expect(handle.acquired).toBe(true);
        return 'success';
      });

      expect(result).toBe('success');

      // Lock should be released
      const handle2 = await lock.acquire('withlock-test');
      expect(handle2.acquired).toBe(true);
    });

    test('should release lock on error', async () => {
      try {
        await lock.withLock('error-test', async () => {
          throw new Error('Test error');
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect((error as Error).message).toBe('Test error');
      }

      // Lock should be released even after error
      const handle = await lock.acquire('error-test');
      expect(handle.acquired).toBe(true);
    });

    test('should throw LockAcquireError if lock fails', async () => {
      const handle1 = await lock.acquire('acquire-fail-test', { ttl: 10000 });

      try {
        await lock.withLock('acquire-fail-test', async () => 'success', {
          retryCount: 0,
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(LockAcquireError);
      }

      await handle1.release();
    });
  });

  describe('withAutoExtend', () => {
    test('should auto-extend lock for long operations', async () => {
      const result = await lock.withAutoExtend(
        'autoextend-test',
        async (handle) => {
          // Simulate long operation
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Lock should still be valid
          expect(await handle.isValid()).toBe(true);
          
          return 'completed';
        },
        { ttl: 50 } // Short TTL to trigger extension
      );

      expect(result).toBe('completed');
    });
  });

  describe('tryLock', () => {
    test('should try to acquire without waiting', async () => {
      const handle = await lock.tryLock('trylock-test');
      expect(handle.acquired).toBe(true);

      const handle2 = await lock.tryLock('trylock-test');
      expect(handle2.acquired).toBe(false);
    });
  });

  describe('isLocked', () => {
    test('should check if a key is locked', async () => {
      expect(await lock.isLocked('check-locked')).toBe(false);

      const handle = await lock.acquire('check-locked');
      expect(await lock.isLocked('check-locked')).toBe(true);

      await handle.release();
      expect(await lock.isLocked('check-locked')).toBe(false);
    });
  });
});

describe('DistributedLock Factory Functions', () => {
  test('createDistributedLock should create memory lock by default', () => {
    const lock = createDistributedLock();
    expect(lock.getDriverType()).toBe('memory');
    lock.disconnect();
  });

  test('createMemoryLock should create memory lock', () => {
    const lock = createMemoryLock();
    expect(lock.getDriverType()).toBe('memory');
    lock.disconnect();
  });
});

describe('DistributedLock Connection State', () => {
  test('should be connected after initialization for memory', () => {
    const lock = createMemoryLock();
    expect(lock.isConnected).toBe(true);
    lock.disconnect();
  });

  test('should not be connected after disconnect', async () => {
    const lock = createMemoryLock();
    await lock.disconnect();
    expect(lock.isConnected).toBe(false);
  });
});

describe('Default Lock Instance', () => {
  test('should use default lock instance', async () => {
    const { getDefaultLock, lock: withLockFn } = await import('../../src/lock');
    
    const result = await withLockFn('default-test', async () => 'default-result');
    expect(result).toBe('default-result');

    const defaultLock = getDefaultLock();
    expect(defaultLock).toBeDefined();
  });
});

describe('Key Prefix', () => {
  test('should use custom key prefix', async () => {
    const lock = createDistributedLock({ keyPrefix: 'myapp:lock:' });
    
    const handle = await lock.acquire('prefixed-key');
    expect(handle.key).toBe('myapp:lock:prefixed-key');

    lock.disconnect();
  });
});

describe('Concurrent Access Simulation', () => {
  test('should handle sequential lock attempts', async () => {
    const lock = createMemoryLock();
    const results: number[] = [];
    const lockKey = 'sequential-test';

    // Sequential execution - each waits for the previous to complete
    await lock.withLock(lockKey, async () => {
      results.push(1);
      await new Promise(r => setTimeout(r, 20));
    });
    
    await lock.withLock(lockKey, async () => {
      results.push(2);
      await new Promise(r => setTimeout(r, 20));
    });
    
    await lock.withLock(lockKey, async () => {
      results.push(3);
      await new Promise(r => setTimeout(r, 20));
    });

    expect(results).toEqual([1, 2, 3]);

    lock.disconnect();
  });

  test('should allow retry on lock contention', async () => {
    const lock = createMemoryLock();
    const lockKey = 'retry-contention-test';
    
    // Acquire lock
    const handle1 = await lock.acquire(lockKey, { ttl: 10000 });
    expect(handle1.acquired).toBe(true);
    
    // Try to acquire with retry - should fail initially
    let acquired = false;
    const acquirePromise = lock.acquire(lockKey, { retryCount: 5, retryDelay: 20 });
    
    // Release after a short delay
    setTimeout(() => handle1.release(), 50);
    
    const handle2 = await acquirePromise;
    expect(handle2.acquired).toBe(true);
    
    await handle2.release();
    lock.disconnect();
  });
});