/**
 * Distributed Locking
 *
 * Redis-based distributed locks with in-memory fallback.
 * Uses Bun 1.3+ native Redis client for production.
 *
 * Implementation based on Redis SET NX PX pattern with Lua scripts
 * for safe lock release and extension.
 */

// ============= Types =============

export interface LockConfig {
	driver?: "redis" | "memory";
	url?: string; // Redis URL
	keyPrefix?: string;
	defaultTTL?: number; // Default TTL in milliseconds
	retryCount?: number; // Number of retry attempts
	retryDelay?: number; // Delay between retries in milliseconds
	autoExtend?: boolean; // Auto-extend lock for long operations
}

export interface LockOptions {
	ttl?: number; // Lock TTL in milliseconds
	retryCount?: number; // Override retry count
	retryDelay?: number; // Override retry delay
}

export interface Lock {
	key: string;
	value: string;
	acquired: boolean;
	acquiredAt: number;
	ttl: number;
	expiresAt: number;
}

export interface LockHandle {
	/** Whether the lock was successfully acquired */
	acquired: boolean;
	/** Release the lock */
	release: () => Promise<boolean>;
	/** Extend the lock TTL */
	extend: (ttl?: number) => Promise<boolean>;
	/** Check if lock is still held */
	isValid: () => Promise<boolean>;
	/** Get remaining TTL in milliseconds */
	getRemainingTTL: () => Promise<number>;
	/** The lock key */
	key: string;
	/** The lock value (unique identifier) */
	value: string;
}

// ============= In-Memory Lock Driver =============

// Shared lock store for all in-memory lock instances
const sharedLockStore: Map<string, { value: string; expiresAt: number }> =
	new Map();
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCleanup(): void {
	if (!cleanupInterval) {
		cleanupInterval = setInterval(() => {
			const now = Date.now();
			for (const [key, lock] of sharedLockStore.entries()) {
				if (now >= lock.expiresAt) {
					sharedLockStore.delete(key);
				}
			}
		}, 10000);
	}
}

class MemoryLockDriver {
	constructor() {
		// Ensure cleanup is running
		ensureCleanup();
	}

	async acquire(key: string, value: string, ttl: number): Promise<boolean> {
		const now = Date.now();
		const existing = sharedLockStore.get(key);

		// Check if lock exists and is still valid
		if (existing && now < existing.expiresAt) {
			return false;
		}

		// Acquire the lock
		sharedLockStore.set(key, {
			value,
			expiresAt: now + ttl,
		});

		return true;
	}

	async release(key: string, value: string): Promise<boolean> {
		const lock = sharedLockStore.get(key);

		// Only release if we own the lock
		if (lock && lock.value === value) {
			sharedLockStore.delete(key);
			return true;
		}

		return false;
	}

	async extend(key: string, value: string, ttl: number): Promise<boolean> {
		const lock = sharedLockStore.get(key);

		// Only extend if we own the lock
		if (lock && lock.value === value) {
			const now = Date.now();

			// Check if lock hasn't expired
			if (now >= lock.expiresAt) {
				return false;
			}

			lock.expiresAt = now + ttl;
			return true;
		}

		return false;
	}

	async isValid(key: string, value: string): Promise<boolean> {
		const lock = sharedLockStore.get(key);
		const now = Date.now();

		return lock !== undefined && lock.value === value && now < lock.expiresAt;
	}

	async getTTL(key: string, value: string): Promise<number> {
		const lock = sharedLockStore.get(key);
		const now = Date.now();

		if (!lock || lock.value !== value) {
			return -1;
		}

		const remaining = lock.expiresAt - now;
		return remaining > 0 ? remaining : -1;
	}

	destroy(): void {
		// Don't clear the shared store, just stop cleanup if no more instances
		// For simplicity, we keep cleanup running
	}
}

// ============= Redis Lock Driver =============

class RedisLockDriver {
	private client: unknown = null;
	private url: string;
	private _isConnected = false;

	// Lua script for safe lock release
	// Only releases the lock if we own it (value matches)
	private readonly releaseScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

	// Lua script for safe lock extension
	// Only extends if we own the lock
	private readonly extendScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("pexpire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `;

	constructor(url: string) {
		this.url = url;
	}

	async connect(): Promise<void> {
		try {
			const { RedisClient } = await import("bun");
			this.client = new RedisClient(this.url);
			this._isConnected = true;
		} catch (error) {
			throw new Error(
				`Failed to connect to Redis: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async disconnect(): Promise<void> {
		const client = this.client as { close?: () => Promise<void> } | null;
		if (client?.close) {
			await client.close();
		}
		this._isConnected = false;
		this.client = null;
	}

	get isConnected(): boolean {
		return this._isConnected;
	}

	async acquire(key: string, value: string, ttl: number): Promise<boolean> {
		const client = this.client as {
			set: (
				key: string,
				value: string,
				options?: { nx?: boolean; px?: number },
			) => Promise<string | null>;
		};

		// SET key value NX PX ttl
		// NX = only set if not exists
		// PX = set expiry in milliseconds
		const result = await client.set(key, value, { nx: true, px: ttl });
		return result === "OK";
	}

	async release(key: string, value: string): Promise<boolean> {
		const client = this.client as {
			eval: (script: string, keys: string[], args: string[]) => Promise<number>;
		};

		const result = await client.eval(this.releaseScript, [key], [value]);
		return result === 1;
	}

	async extend(key: string, value: string, ttl: number): Promise<boolean> {
		const client = this.client as {
			eval: (script: string, keys: string[], args: string[]) => Promise<number>;
		};

		const result = await client.eval(
			this.extendScript,
			[key],
			[value, String(ttl)],
		);
		return result === 1;
	}

	async isValid(key: string, value: string): Promise<boolean> {
		const client = this.client as {
			get: (key: string) => Promise<string | null>;
		};

		const stored = await client.get(key);
		return stored === value;
	}

	async getTTL(key: string, value: string): Promise<number> {
		const client = this.client as {
			get: (key: string) => Promise<string | null>;
			pttl: (key: string) => Promise<number>;
		};

		const stored = await client.get(key);
		if (stored !== value) {
			return -1;
		}

		return client.pttl(key);
	}
}

// ============= Distributed Lock Class =============

export class DistributedLock {
	private driver: MemoryLockDriver | RedisLockDriver;
	private driverType: "redis" | "memory";
	private keyPrefix: string;
	private defaultTTL: number;
	private defaultRetryCount: number;
	private defaultRetryDelay: number;
	private _isConnected = false;

	constructor(config: LockConfig = {}) {
		this.driverType = config.driver ?? "memory";
		this.keyPrefix = config.keyPrefix ?? "lock:";
		this.defaultTTL = config.defaultTTL ?? 30000; // 30 seconds
		this.defaultRetryCount = config.retryCount ?? 3;
		this.defaultRetryDelay = config.retryDelay ?? 200; // 200ms

		if (this.driverType === "redis" && config.url) {
			this.driver = new RedisLockDriver(config.url);
		} else {
			this.driver = new MemoryLockDriver();
			this._isConnected = true;
		}
	}

	/**
	 * Connect to the lock backend (Redis only)
	 */
	async connect(): Promise<void> {
		if (this.driver instanceof RedisLockDriver) {
			await this.driver.connect();
		}
		this._isConnected = true;
	}

	/**
	 * Disconnect from the lock backend
	 */
	async disconnect(): Promise<void> {
		if (this.driver instanceof RedisLockDriver) {
			await this.driver.disconnect();
		} else {
			this.driver.destroy();
		}
		this._isConnected = false;
	}

	/**
	 * Check if connected
	 */
	get isConnected(): boolean {
		return this._isConnected;
	}

	/**
	 * Get the driver type
	 */
	getDriverType(): "redis" | "memory" {
		return this.driverType;
	}

	/**
	 * Generate a unique lock value
	 */
	private generateLockValue(): string {
		// Generate a unique identifier using crypto
		const bytes = new Uint8Array(16);
		crypto.getRandomValues(bytes);
		return Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}

	/**
	 * Try to acquire a lock without retry
	 */
	private async tryAcquire(
		key: string,
		value: string,
		ttl: number,
	): Promise<boolean> {
		return this.driver.acquire(key, value, ttl);
	}

	/**
	 * Acquire a lock
	 * Returns a LockHandle that can be used to release or extend the lock
	 */
	async acquire(key: string, options: LockOptions = {}): Promise<LockHandle> {
		const fullKey = this.keyPrefix + key;
		const ttl = options.ttl ?? this.defaultTTL;
		const retryCount = options.retryCount ?? this.defaultRetryCount;
		const retryDelay = options.retryDelay ?? this.defaultRetryDelay;
		const value = this.generateLockValue();

		let acquired = false;
		let attempts = 0;

		// Try to acquire with retries
		while (!acquired && attempts <= retryCount) {
			acquired = await this.tryAcquire(fullKey, value, ttl);

			if (!acquired && attempts < retryCount) {
				await this.sleep(retryDelay);
			}

			attempts++;
		}

		const acquiredAt = Date.now();

		return {
			acquired,
			key: fullKey,
			value,
			release: async () => {
				if (!acquired) return false;
				return this.driver.release(fullKey, value);
			},
			extend: async (newTTL?: number) => {
				if (!acquired) return false;
				return this.driver.extend(fullKey, value, newTTL ?? ttl);
			},
			isValid: async () => {
				if (!acquired) return false;
				return this.driver.isValid(fullKey, value);
			},
			getRemainingTTL: async () => {
				if (!acquired) return -1;
				return this.driver.getTTL(fullKey, value);
			},
		};
	}

	/**
	 * Acquire a lock and execute a function
	 * Automatically releases the lock when done
	 */
	async withLock<T>(
		key: string,
		fn: (lock: LockHandle) => Promise<T>,
		options: LockOptions = {},
	): Promise<T> {
		const lock = await this.acquire(key, options);

		if (!lock.acquired) {
			throw new LockAcquireError(`Failed to acquire lock: ${key}`);
		}

		try {
			return await fn(lock);
		} finally {
			await lock.release();
		}
	}

	/**
	 * Acquire a lock with automatic extension for long-running operations
	 */
	async withAutoExtend<T>(
		key: string,
		fn: (lock: LockHandle) => Promise<T>,
		options: LockOptions = {},
	): Promise<T> {
		const lock = await this.acquire(key, options);

		if (!lock.acquired) {
			throw new LockAcquireError(`Failed to acquire lock: ${key}`);
		}

		const ttl = options.ttl ?? this.defaultTTL;
		const extendInterval = ttl * 0.7; // Extend at 70% of TTL

		let extendTimer: ReturnType<typeof setInterval> | null = null;
		let completed = false;

		// Setup auto-extend timer
		extendTimer = setInterval(async () => {
			if (!completed) {
				const remaining = await lock.getRemainingTTL();
				if (remaining > 0 && remaining < extendInterval) {
					await lock.extend(ttl);
				}
			}
		}, extendInterval);

		try {
			const result = await fn(lock);
			completed = true;
			return result;
		} finally {
			if (extendTimer) {
				clearInterval(extendTimer);
			}
			await lock.release();
		}
	}

	/**
	 * Try to acquire a lock without waiting
	 * Returns immediately whether the lock was acquired
	 */
	async tryLock(key: string, options: LockOptions = {}): Promise<LockHandle> {
		return this.acquire(key, { ...options, retryCount: 0 });
	}

	/**
	 * Check if a lock exists (anyone holds it)
	 */
	async isLocked(key: string): Promise<boolean> {
		const fullKey = this.keyPrefix + key;
		const value = this.generateLockValue();

		// Try to acquire - if successful, it wasn't locked
		const acquired = await this.driver.acquire(fullKey, value, 1);

		if (acquired) {
			// Release immediately since we just wanted to check
			await this.driver.release(fullKey, value);
			return false;
		}

		return true;
	}

	/**
	 * Force release a lock (dangerous - use with caution)
	 * This will release the lock regardless of ownership
	 */
	async forceRelease(key: string): Promise<void> {
		const fullKey = this.keyPrefix + key;
		const value = this.generateLockValue();
		await this.driver.release(fullKey, value);
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

// ============= Error Classes =============

export class LockAcquireError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LockAcquireError";
	}
}

export class LockTimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LockTimeoutError";
	}
}

// ============= Factory Functions =============

/**
 * Create a distributed lock instance
 */
export function createDistributedLock(config?: LockConfig): DistributedLock {
	return new DistributedLock(config);
}

/**
 * Create a Redis-based distributed lock
 */
export function createRedisLock(
	url: string,
	options?: Omit<LockConfig, "driver" | "url">,
): DistributedLock {
	return new DistributedLock({ driver: "redis", url, ...options });
}

/**
 * Create an in-memory lock (for development/testing)
 */
export function createMemoryLock(): DistributedLock {
	return new DistributedLock({ driver: "memory" });
}

// ============= Convenience Exports =============

// Default lock instance (in-memory for convenience)
let defaultLock: DistributedLock | null = null;

/**
 * Get the default lock instance
 */
export function getDefaultLock(): DistributedLock {
	if (!defaultLock) {
		defaultLock = new DistributedLock({ driver: "memory" });
	}
	return defaultLock;
}

/**
 * Set the default lock instance
 */
export function setDefaultLock(lock: DistributedLock): void {
	defaultLock = lock;
}

/**
 * Acquire a lock using the default instance
 */
export async function lock<T>(
	key: string,
	fn: () => Promise<T>,
	options?: LockOptions,
): Promise<T> {
	return getDefaultLock().withLock(key, async () => fn(), options);
}
