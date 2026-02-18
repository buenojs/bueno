/**
 * Caching Layer
 *
 * Unified interface over Bun.redis with in-memory fallback.
 * Uses Bun 1.3+ native Redis client for production.
 */

// ============= Types =============

export interface CacheConfig {
	driver?: "redis" | "memory";
	url?: string;
	ttl?: number; // Default TTL in seconds
	keyPrefix?: string;
	enableMetrics?: boolean; // Enable metrics collection (default: true)
}

/**
 * Cache metrics for observability
 */
export interface CacheMetrics {
	hits: number;
	misses: number;
	sets: number;
	deletes: number;
	errors: number;
	avgLatency: number; // in milliseconds
	totalOperations: number;
}

export interface SessionData {
	[key: string]: unknown;
}

export interface SessionStoreOptions {
	ttl?: number; // Session TTL in seconds
	prefix?: string;
	driver?: "redis" | "memory";
	url?: string;
}

export interface PubSubMessage {
	channel: string;
	message: string;
}

// ============= In-Memory Cache (Fallback) =============

class MemoryCache {
	private store = new Map<string, { value: unknown; expiresAt: number }>();
	private cleanupInterval: ReturnType<typeof setInterval>;
	private pubsubListeners: Map<string, Set<(message: string) => void>> =
		new Map();

	constructor() {
		this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
	}

	async get(key: string): Promise<string | null> {
		const entry = this.store.get(key);
		if (!entry) return null;

		if (Date.now() > entry.expiresAt) {
			this.store.delete(key);
			return null;
		}

		return entry.value as string;
	}

	async set(key: string, value: string, ttl?: number): Promise<void> {
		const expiresAt = Date.now() + (ttl ?? 3600) * 1000;
		this.store.set(key, { value, expiresAt });
	}

	async delete(key: string): Promise<boolean> {
		return this.store.delete(key);
	}

	async has(key: string): Promise<boolean> {
		const entry = this.store.get(key);
		if (!entry) return false;

		if (Date.now() > entry.expiresAt) {
			this.store.delete(key);
			return false;
		}

		return true;
	}

	async clear(): Promise<void> {
		this.store.clear();
	}

	async incr(key: string): Promise<number> {
		const entry = this.store.get(key);
		const value = entry ? Number.parseInt(entry.value as string) || 0 : 0;
		const newValue = value + 1;
		await this.set(
			key,
			String(newValue),
			entry ? Math.floor((entry.expiresAt - Date.now()) / 1000) : undefined,
		);
		return newValue;
	}

	async expire(key: string, ttl: number): Promise<boolean> {
		const entry = this.store.get(key);
		if (!entry) return false;
		entry.expiresAt = Date.now() + ttl * 1000;
		return true;
	}

	async ttl(key: string): Promise<number> {
		const entry = this.store.get(key);
		if (!entry) return -2;
		const remaining = Math.floor((entry.expiresAt - Date.now()) / 1000);
		return remaining > 0 ? remaining : -1;
	}

	// Pub/Sub simulation
	async publish(channel: string, message: string): Promise<number> {
		const listeners = this.pubsubListeners.get(channel);
		if (listeners) {
			for (const listener of listeners) {
				listener(message);
			}
			return listeners.size;
		}
		return 0;
	}

	async subscribe(
		channel: string,
		callback: (message: string) => void,
	): Promise<void> {
		if (!this.pubsubListeners.has(channel)) {
			this.pubsubListeners.set(channel, new Set());
		}
		this.pubsubListeners.get(channel)?.add(callback);
	}

	async unsubscribe(
		channel: string,
		callback?: (message: string) => void,
	): Promise<void> {
		if (callback) {
			this.pubsubListeners.get(channel)?.delete(callback);
		} else {
			this.pubsubListeners.delete(channel);
		}
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [key, entry] of this.store.entries()) {
			if (now > entry.expiresAt) {
				this.store.delete(key);
			}
		}
	}

	destroy(): void {
		clearInterval(this.cleanupInterval);
		this.store.clear();
		this.pubsubListeners.clear();
	}
}

// ============= Redis Cache (Bun.redis Native) =============

class RedisCache {
	private client: unknown = null;
	private url: string;
	private _isConnected = false;

	constructor(url: string) {
		this.url = url;
	}

	async connect(): Promise<void> {
		try {
			// Use Bun's native Redis client
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
		// Bun.redis handles connection management automatically
		this._isConnected = false;
		this.client = null;
	}

	get isConnected(): boolean {
		return this._isConnected;
	}

	async get(key: string): Promise<string | null> {
		const client = this.client as {
			get: (key: string) => Promise<string | null>;
		};
		return client.get(key);
	}

	async set(key: string, value: string, ttl?: number): Promise<void> {
		const client = this.client as {
			set: (
				key: string,
				value: string,
				options?: { ex?: number },
			) => Promise<unknown>;
		};

		if (ttl) {
			await client.set(key, value, { ex: ttl });
		} else {
			await client.set(key, value);
		}
	}

	async delete(key: string): Promise<boolean> {
		const client = this.client as {
			del: (key: string) => Promise<number>;
		};
		const result = await client.del(key);
		return result > 0;
	}

	async has(key: string): Promise<boolean> {
		const client = this.client as {
			exists: (key: string) => Promise<number>;
		};
		const result = await client.exists(key);
		return result > 0;
	}

	async clear(): Promise<void> {
		const client = this.client as {
			flushdb: () => Promise<unknown>;
		};
		await client.flushdb();
	}

	async incr(key: string): Promise<number> {
		const client = this.client as {
			incr: (key: string) => Promise<number>;
		};
		return client.incr(key);
	}

	async expire(key: string, ttl: number): Promise<boolean> {
		const client = this.client as {
			expire: (key: string, seconds: number) => Promise<number>;
		};
		const result = await client.expire(key, ttl);
		return result === 1;
	}

	async ttl(key: string): Promise<number> {
		const client = this.client as {
			ttl: (key: string) => Promise<number>;
		};
		return client.ttl(key);
	}

	async publish(channel: string, message: string): Promise<number> {
		const client = this.client as {
			publish: (channel: string, message: string) => Promise<number>;
		};
		return client.publish(channel, message);
	}

	async subscribe(
		channel: string,
		callback: (message: string) => void,
	): Promise<void> {
		// Bun.redis subscribe uses a different pattern
		// For simplicity, we'll use the command pattern
		const client = this.client as {
			subscribe: (
				channel: string,
				callback: (message: string) => void,
			) => Promise<void>;
		};
		await client.subscribe(channel, callback);
	}
}

// ============= Cache Driver Interface =============

interface CacheDriver {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ttl?: number): Promise<void>;
	delete(key: string): Promise<boolean>;
	has(key: string): Promise<boolean>;
	clear(): Promise<void>;
	incr(key: string): Promise<number>;
	expire?(key: string, ttl: number): Promise<boolean>;
	ttl?(key: string): Promise<number>;
	publish?(channel: string, message: string): Promise<number>;
	subscribe?(
		channel: string,
		callback: (message: string) => void,
	): Promise<void>;
	destroy?(): void;
}

// ============= Cache Class =============

export class Cache {
	private driver: CacheDriver;
	private keyPrefix: string;
	private defaultTTL: number;
	private _isConnected = false;
	private driverType: "redis" | "memory";
	private enableMetrics: boolean;

	// Metrics tracking
	private metrics: CacheMetrics = {
		hits: 0,
		misses: 0,
		sets: 0,
		deletes: 0,
		errors: 0,
		avgLatency: 0,
		totalOperations: 0,
	};
	private totalLatency = 0; // For calculating average

	constructor(config: CacheConfig = {}) {
		this.driverType = config.driver ?? "memory";
		this.keyPrefix = config.keyPrefix ?? "bueno:";
		this.defaultTTL = config.ttl ?? 3600;
		this.enableMetrics = config.enableMetrics ?? true;

		if (this.driverType === "redis" && config.url) {
			this.driver = new RedisCache(config.url);
		} else {
			this.driver = new MemoryCache();
		}
	}

	/**
	 * Get current metrics snapshot
	 */
	getMetrics(): CacheMetrics {
		return { ...this.metrics };
	}

	/**
	 * Reset metrics counters
	 */
	resetMetrics(): void {
		this.metrics = {
			hits: 0,
			misses: 0,
			sets: 0,
			deletes: 0,
			errors: 0,
			avgLatency: 0,
			totalOperations: 0,
		};
		this.totalLatency = 0;
	}

	/**
	 * Update metrics counters
	 */
	private updateMetrics(
		operation: "get" | "set" | "delete",
		hit?: boolean,
		latency?: number,
		error?: boolean,
	): void {
		if (!this.enableMetrics) return;

		this.metrics.totalOperations++;

		if (latency !== undefined) {
			this.totalLatency += latency;
			this.metrics.avgLatency = this.totalLatency / this.metrics.totalOperations;
		}

		if (error) {
			this.metrics.errors++;
		}

		switch (operation) {
			case "get":
				if (hit === true) {
					this.metrics.hits++;
				} else if (hit === false) {
					this.metrics.misses++;
				}
				break;
			case "set":
				this.metrics.sets++;
				break;
			case "delete":
				this.metrics.deletes++;
				break;
		}
	}

	/**
	 * Get current timestamp in milliseconds
	 */
	private getTimestamp(): number {
		// Use Bun.nanoseconds() if available, otherwise performance.now()
		try {
			return Bun.nanoseconds() / 1_000_000;
		} catch {
			return performance.now();
		}
	}

	/**
	 * Connect to cache
	 */
	async connect(): Promise<void> {
		if ("connect" in this.driver && typeof this.driver.connect === "function") {
			await (this.driver as RedisCache).connect();
		}
		this._isConnected = true;
	}

	/**
	 * Disconnect from cache
	 */
	async disconnect(): Promise<void> {
		if (
			"disconnect" in this.driver &&
			typeof this.driver.disconnect === "function"
		) {
			await (this.driver as RedisCache).disconnect();
		} else if (
			"destroy" in this.driver &&
			typeof this.driver.destroy === "function"
		) {
			(this.driver as MemoryCache).destroy();
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
	 * Get a value
	 */
	async get<T = unknown>(key: string): Promise<T | null> {
		const startTime = this.getTimestamp();
		const fullKey = this.keyPrefix + key;

		try {
			const value = await this.driver.get(fullKey);
			const latency = this.getTimestamp() - startTime;

			if (value === null || value === undefined) {
				this.updateMetrics("get", false, latency, false);
				return null;
			}

			// Try to parse JSON
			try {
				const parsed = JSON.parse(value) as T;
				this.updateMetrics("get", true, latency, false);
				return parsed;
			} catch {
				this.updateMetrics("get", true, latency, false);
				return value as T;
			}
		} catch (error) {
			const latency = this.getTimestamp() - startTime;
			this.updateMetrics("get", false, latency, true);
			throw error;
		}
	}

	/**
	 * Set a value
	 */
	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		const startTime = this.getTimestamp();
		const fullKey = this.keyPrefix + key;
		const serialized =
			typeof value === "string" ? value : JSON.stringify(value);

		try {
			await this.driver.set(fullKey, serialized, ttl ?? this.defaultTTL);
			const latency = this.getTimestamp() - startTime;
			this.updateMetrics("set", undefined, latency, false);
		} catch (error) {
			const latency = this.getTimestamp() - startTime;
			this.updateMetrics("set", undefined, latency, true);
			throw error;
		}
	}

	/**
	 * Delete a value
	 */
	async delete(key: string): Promise<boolean> {
		const startTime = this.getTimestamp();
		const fullKey = this.keyPrefix + key;

		try {
			const result = await this.driver.delete(fullKey);
			const latency = this.getTimestamp() - startTime;
			this.updateMetrics("delete", undefined, latency, false);
			return result;
		} catch (error) {
			const latency = this.getTimestamp() - startTime;
			this.updateMetrics("delete", undefined, latency, true);
			throw error;
		}
	}

	/**
	 * Check if key exists
	 */
	async has(key: string): Promise<boolean> {
		const fullKey = this.keyPrefix + key;
		return this.driver.has(fullKey);
	}

	/**
	 * Increment a value
	 */
	async increment(key: string, by = 1): Promise<number> {
		const fullKey = this.keyPrefix + key;
		if (by === 1) {
			return this.driver.incr(fullKey);
		}
		// For non-1 increments, get and set
		const current = (await this.get<number>(key)) ?? 0;
		const newValue = current + by;
		await this.set(key, newValue);
		return newValue;
	}

	/**
	 * Decrement a value
	 */
	async decrement(key: string, by = 1): Promise<number> {
		return this.increment(key, -by);
	}

	/**
	 * Get remaining TTL
	 */
	async ttl(key: string): Promise<number> {
		const fullKey = this.keyPrefix + key;
		if (this.driver.ttl) {
			return this.driver.ttl(fullKey);
		}
		return -1;
	}

	/**
	 * Set expiration on a key
	 */
	async expire(key: string, ttl: number): Promise<boolean> {
		const fullKey = this.keyPrefix + key;
		if (this.driver.expire) {
			return this.driver.expire(fullKey, ttl);
		}
		return false;
	}

	/**
	 * Set multiple values
	 */
	async mset(values: Record<string, unknown>, ttl?: number): Promise<void> {
		for (const [key, value] of Object.entries(values)) {
			await this.set(key, value, ttl);
		}
	}

	/**
	 * Get multiple values
	 */
	async mget<T = unknown>(keys: string[]): Promise<(T | null)[]> {
		return Promise.all(keys.map((key) => this.get<T>(key)));
	}

	/**
	 * Clear all keys with prefix
	 */
	async clear(): Promise<void> {
		await this.driver.clear();
	}

	/**
	 * Get or set (cache-aside pattern)
	 */
	async getOrSet<T>(
		key: string,
		factory: () => Promise<T>,
		ttl?: number,
	): Promise<T> {
		const cached = await this.get<T>(key);

		if (cached !== null) {
			return cached;
		}

		const value = await factory();
		await this.set(key, value, ttl);
		return value;
	}

	/**
	 * Delete multiple keys
	 */
	async mdelete(keys: string[]): Promise<void> {
		for (const key of keys) {
			await this.delete(key);
		}
	}

	/**
	 * Publish a message to a channel (Redis only)
	 */
	async publish(channel: string, message: string): Promise<number> {
		if (this.driver.publish) {
			return this.driver.publish(channel, message);
		}
		console.warn("Publish only available with Redis driver");
		return 0;
	}

	/**
	 * Subscribe to a channel (Redis only)
	 */
	async subscribe(
		channel: string,
		callback: (message: string) => void,
	): Promise<void> {
		if (this.driver.subscribe) {
			return this.driver.subscribe(channel, callback);
		}
		console.warn("Subscribe only available with Redis driver");
	}

	/**
	 * Remember with lock (prevent cache stampede)
	 */
	async remember<T>(
		key: string,
		factory: () => Promise<T>,
		ttl?: number,
		lockTimeout = 10,
	): Promise<T> {
		const cached = await this.get<T>(key);
		if (cached !== null) {
			return cached;
		}

		// Try to acquire lock
		const lockKey = `lock:${key}`;
		const lockAcquired = await this.has(lockKey);

		if (lockAcquired) {
			// Wait and retry
			await new Promise((resolve) => setTimeout(resolve, 100));
			return this.remember(key, factory, ttl, lockTimeout);
		}

		// Set lock
		await this.set(lockKey, "1", lockTimeout);

		try {
			const value = await factory();
			await this.set(key, value, ttl);
			return value;
		} finally {
			// Release lock
			await this.delete(lockKey);
		}
	}
}

// ============= Session Store =============

export class SessionStore {
	private cache: Cache;
	private ttl: number;

	constructor(options: SessionStoreOptions = {}) {
		this.cache = new Cache({
			keyPrefix: options.prefix ?? "session:",
			ttl: options.ttl ?? 86400, // 1 day default
			driver: options.driver ?? "memory",
			url: options.url,
		});
		this.ttl = options.ttl ?? 86400;
	}

	/**
	 * Initialize the session store
	 */
	async init(): Promise<void> {
		await this.cache.connect();
	}

	/**
	 * Create a new session
	 */
	async create(data: SessionData): Promise<string> {
		const sessionId = crypto.randomUUID();
		await this.cache.set(sessionId, data, this.ttl);
		return sessionId;
	}

	/**
	 * Get session data
	 */
	async get(sessionId: string): Promise<SessionData | null> {
		return this.cache.get<SessionData>(sessionId);
	}

	/**
	 * Update session data
	 */
	async update(sessionId: string, data: SessionData): Promise<void> {
		const existing = await this.get(sessionId);
		if (existing) {
			await this.cache.set(sessionId, { ...existing, ...data }, this.ttl);
		}
	}

	/**
	 * Delete a session
	 */
	async delete(sessionId: string): Promise<void> {
		await this.cache.delete(sessionId);
	}

	/**
	 * Refresh session TTL
	 */
	async refresh(sessionId: string): Promise<boolean> {
		const data = await this.get(sessionId);
		if (data) {
			await this.cache.set(sessionId, data, this.ttl);
			return true;
		}
		return false;
	}

	/**
	 * Check if session exists
	 */
	async has(sessionId: string): Promise<boolean> {
		return this.cache.has(sessionId);
	}
}

// ============= Factory Functions =============

/**
 * Create a cache instance
 */
export function createCache(config?: CacheConfig): Cache {
	const cache = new Cache(config);
	return cache;
}

/**
 * Create a session store
 */
export function createSessionStore(
	options?: SessionStoreOptions,
): SessionStore {
	return new SessionStore(options);
}
