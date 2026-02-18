/**
 * Incremental Static Regeneration (ISR) Implementation
 *
 * Provides ISR capabilities that extend SSG with:
 * - Time-based revalidation
 * - On-demand revalidation
 * - Stale-while-revalidate strategy
 * - Distributed cache support via Bun.redis
 */

import { createLogger, type Logger } from "../logger/index.js";
import type {
	ISRConfig,
	PartialISRConfig,
	ISRCacheEntry,
	ISRPageConfig,
	ISRRevalidationResult,
	ISRStats,
	SSRRenderOptions,
} from "./types.js";
import { SSRRenderer, createSSRContext } from "./ssr.js";
import type { SSRContext, RenderResult } from "./types.js";

// ============= Constants =============

const DEFAULT_CACHE_DIR = ".isr-cache";
const DEFAULT_REVALIDATE = 3600; // 1 hour
const DEFAULT_STALE_WHILE_REVALIDATE = 60; // 1 minute

// ============= ISR Manager Class =============

/**
 * ISR Manager handles incremental static regeneration
 * 
 * Features:
 * - Time-based revalidation with configurable TTL
 * - Stale-while-revalidate for instant responses
 * - On-demand revalidation via API or webhook
 * - Distributed cache support via Redis
 */
export class ISRManager {
	private config: ISRConfig;
	private logger: Logger;
	private cache: Map<string, ISRCacheEntry> = new Map();
	private pendingRegenerations: Map<string, Promise<ISRRevalidationResult>> = new Map();
	private ssrRenderer: SSRRenderer | null = null;
	private stats = {
		hits: 0,
		misses: 0,
		revalidations: 0,
		staleHits: 0,
	};

	constructor(config: PartialISRConfig) {
		this.config = this.normalizeConfig(config);
		this.logger = createLogger({
			level: "debug",
			pretty: true,
			context: { component: "ISRManager" },
		});
	}

	/**
	 * Normalize partial config to full config with defaults
	 */
	private normalizeConfig(config: PartialISRConfig): ISRConfig {
		return {
			cacheDir: config.cacheDir ?? DEFAULT_CACHE_DIR,
			defaultRevalidate: config.defaultRevalidate ?? DEFAULT_REVALIDATE,
			staleWhileRevalidate: config.staleWhileRevalidate ?? DEFAULT_STALE_WHILE_REVALIDATE,
			maxCacheSize: config.maxCacheSize ?? 1000,
			redis: config.redis,
			redisKeyPrefix: config.redisKeyPrefix ?? "bueno:isr:",
			enabled: config.enabled ?? true,
		};
	}

	/**
	 * Set the SSR renderer
	 */
	setSSRRenderer(renderer: SSRRenderer): void {
		this.ssrRenderer = renderer;
	}

	/**
	 * Get a page from cache or render it
	 */
	async getPage(
		url: string,
		request: Request,
		pageConfig?: ISRPageConfig
	): Promise<RenderResult> {
		if (!this.config.enabled) {
			return this.renderPage(url, request);
		}

		const cacheKey = this.getCacheKey(url);
		const entry = await this.getCacheEntry(cacheKey);

		if (entry) {
			const now = Date.now();
			const age = (now - entry.timestamp) / 1000;
			const revalidate = pageConfig?.revalidate ?? this.config.defaultRevalidate;
			const staleWhileRevalidate = pageConfig?.staleWhileRevalidate ?? this.config.staleWhileRevalidate;

			// Cache hit - check if stale
			if (age < revalidate) {
				// Fresh cache hit
				this.stats.hits++;
				this.logger.debug(`Cache hit (fresh): ${url}`);
				return entry.result;
			}

			// Stale but within stale-while-revalidate window
			if (age < revalidate + staleWhileRevalidate) {
				this.stats.staleHits++;
				this.logger.debug(`Cache hit (stale): ${url}, revalidating in background`);

				// Trigger background revalidation
				this.triggerBackgroundRevalidation(url, request, pageConfig);

				// Return stale content
				return entry.result;
			}
		}

		// Cache miss or expired - render and cache
		this.stats.misses++;
		this.logger.debug(`Cache miss: ${url}`);

		const result = await this.renderPage(url, request);
		await this.setCacheEntry(cacheKey, result, pageConfig);

		return result;
	}

	/**
	 * Render a page using SSR
	 */
	private async renderPage(url: string, request: Request): Promise<RenderResult> {
		if (!this.ssrRenderer) {
			throw new Error("SSR renderer not configured");
		}

		const options: SSRRenderOptions = {
			url,
			request,
			params: {},
			props: {},
			skipStreaming: true,
		};

		return this.ssrRenderer.renderWithOptions(options);
	}

	/**
	 * Trigger background revalidation
	 */
	private triggerBackgroundRevalidation(
		url: string,
		request: Request,
		pageConfig?: ISRPageConfig
	): void {
		const cacheKey = this.getCacheKey(url);

		// Don't start if already pending
		if (this.pendingRegenerations.has(cacheKey)) {
			return;
		}

		const promise = this.revalidatePage(url, request, pageConfig)
			.finally(() => {
				this.pendingRegenerations.delete(cacheKey);
			});

		this.pendingRegenerations.set(cacheKey, promise);
	}

	/**
	 * Revalidate a page
	 */
	async revalidatePage(
		url: string,
		request: Request,
		pageConfig?: ISRPageConfig
	): Promise<ISRRevalidationResult> {
		const cacheKey = this.getCacheKey(url);
		const startTime = Date.now();

		try {
			this.logger.info(`Revalidating: ${url}`);
			this.stats.revalidations++;

			const result = await this.renderPage(url, request);
			await this.setCacheEntry(cacheKey, result, pageConfig);

			const duration = Date.now() - startTime;
			this.logger.info(`Revalidated: ${url} in ${duration}ms`);

			return {
				success: true,
				url,
				duration,
				timestamp: Date.now(),
			};
		} catch (error) {
			const duration = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			this.logger.error(`Revalidation failed: ${url}`, error);

			return {
				success: false,
				url,
				duration,
				timestamp: Date.now(),
				error: errorMessage,
			};
		}
	}

	/**
	 * Invalidate a specific page
	 */
	async invalidatePage(url: string): Promise<boolean> {
		const cacheKey = this.getCacheKey(url);

		if (this.config.redis) {
			try {
				await this.config.redis.del(`${this.config.redisKeyPrefix}${cacheKey}`);
			} catch (error) {
				this.logger.error(`Failed to invalidate Redis cache: ${url}`, error);
			}
		}

		const deleted = this.cache.delete(cacheKey);
		if (deleted) {
			this.logger.info(`Invalidated: ${url}`);
		}

		return deleted;
	}

	/**
	 * Invalidate multiple pages by pattern
	 */
	async invalidatePattern(pattern: string | RegExp): Promise<number> {
		let count = 0;
		const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;

		// Invalidate local cache
		for (const key of this.cache.keys()) {
			if (regex.test(key)) {
				this.cache.delete(key);
				count++;
			}
		}

		// Invalidate Redis cache if available
		if (this.config.redis) {
			try {
				const keys = await this.config.redis.keys(`${this.config.redisKeyPrefix}*`);
				for (const key of keys) {
					const cacheKey = key.replace(this.config.redisKeyPrefix, "");
					if (regex.test(cacheKey)) {
						await this.config.redis.del(key);
						count++;
					}
				}
			} catch (error) {
				this.logger.error("Failed to invalidate Redis cache by pattern", error);
			}
		}

		this.logger.info(`Invalidated ${count} pages matching pattern: ${pattern}`);
		return count;
	}

	/**
	 * Invalidate all pages
	 */
	async invalidateAll(): Promise<void> {
		this.cache.clear();
		this.stats = { hits: 0, misses: 0, revalidations: 0, staleHits: 0 };

		if (this.config.redis) {
			try {
				const keys = await this.config.redis.keys(`${this.config.redisKeyPrefix}*`);
				if (keys.length > 0) {
					await this.config.redis.del(...keys);
				}
			} catch (error) {
				this.logger.error("Failed to clear Redis cache", error);
			}
		}

		this.logger.info("All ISR cache invalidated");
	}

	/**
	 * Get cache entry
	 */
	private async getCacheEntry(key: string): Promise<ISRCacheEntry | null> {
		// Check local cache first
		const localEntry = this.cache.get(key);
		if (localEntry) {
			return localEntry;
		}

		// Check Redis if available
		if (this.config.redis) {
			try {
				const data = await this.config.redis.get(`${this.config.redisKeyPrefix}${key}`);
				if (data) {
					const entry = JSON.parse(data) as ISRCacheEntry;
					// Cache locally for faster access
					this.cache.set(key, entry);
					return entry;
				}
			} catch (error) {
				this.logger.error("Failed to get Redis cache entry", error);
			}
		}

		return null;
	}

	/**
	 * Set cache entry
	 */
	private async setCacheEntry(
		key: string,
		result: RenderResult,
		pageConfig?: ISRPageConfig
	): Promise<void> {
		const entry: ISRCacheEntry = {
			result,
			timestamp: Date.now(),
			revalidate: pageConfig?.revalidate ?? this.config.defaultRevalidate,
			tags: pageConfig?.tags ?? [],
		};

		// Set local cache
		this.cache.set(key, entry);

		// Enforce max cache size
		if (this.cache.size > this.config.maxCacheSize) {
			this.evictOldestEntries();
		}

		// Set Redis cache if available
		if (this.config.redis) {
			try {
				const ttl = entry.revalidate + this.config.staleWhileRevalidate;
				await this.config.redis.set(
					`${this.config.redisKeyPrefix}${key}`,
					JSON.stringify(entry),
					{ EX: ttl }
				);
			} catch (error) {
				this.logger.error("Failed to set Redis cache entry", error);
			}
		}
	}

	/**
	 * Evict oldest entries when cache is full
	 */
	private evictOldestEntries(): void {
		const entries = Array.from(this.cache.entries())
			.sort((a, b) => a[1].timestamp - b[1].timestamp);

		const toEvict = entries.slice(0, Math.floor(this.config.maxCacheSize * 0.1));
		for (const [key] of toEvict) {
			this.cache.delete(key);
		}

		this.logger.debug(`Evicted ${toEvict.length} cache entries`);
	}

	/**
	 * Generate cache key from URL
	 */
	private getCacheKey(url: string): string {
		try {
			const parsed = new URL(url, "http://localhost");
			// Normalize URL for caching
			return `${parsed.pathname}${parsed.search}`;
		} catch {
			return url;
		}
	}

	/**
	 * Get ISR statistics
	 */
	getStats(): ISRStats {
		return {
			...this.stats,
			cacheSize: this.cache.size,
			pendingRevalidations: this.pendingRegenerations.size,
			hitRate: this.stats.hits + this.stats.misses > 0
				? this.stats.hits / (this.stats.hits + this.stats.misses)
				: 0,
		};
	}

	/**
	 * Get all cached URLs
	 */
	getCachedUrls(): string[] {
		return Array.from(this.cache.keys());
	}

	/**
	 * Check if a page is cached
	 */
	isCached(url: string): boolean {
		return this.cache.has(this.getCacheKey(url));
	}

	/**
	 * Get cache entry info
	 */
	async getCacheInfo(url: string): Promise<{
		cached: boolean;
		timestamp?: number;
		age?: number;
		revalidate?: number;
		tags?: string[];
	} | null> {
		const entry = await this.getCacheEntry(this.getCacheKey(url));
		if (!entry) {
			return { cached: false };
		}

		return {
			cached: true,
			timestamp: entry.timestamp,
			age: (Date.now() - entry.timestamp) / 1000,
			revalidate: entry.revalidate,
			tags: entry.tags,
		};
	}

	/**
	 * Revalidate pages by tag
	 */
	async revalidateTag(tag: string): Promise<number> {
		let count = 0;

		for (const [key, entry] of this.cache.entries()) {
			if (entry.tags.includes(tag)) {
				this.cache.delete(key);
				count++;
			}
		}

		this.logger.info(`Revalidated ${count} pages with tag: ${tag}`);
		return count;
	}

	/**
	 * Prune expired entries
	 */
	pruneExpired(): number {
		const now = Date.now();
		let count = 0;

		for (const [key, entry] of this.cache.entries()) {
			const age = (now - entry.timestamp) / 1000;
			if (age > entry.revalidate + this.config.staleWhileRevalidate) {
				this.cache.delete(key);
				count++;
			}
		}

		if (count > 0) {
			this.logger.debug(`Pruned ${count} expired cache entries`);
		}

		return count;
	}

	/**
	 * Get configuration
	 */
	getConfig(): ISRConfig {
		return { ...this.config };
	}

	/**
	 * Check if ISR is enabled
	 */
	isEnabled(): boolean {
		return this.config.enabled;
	}
}

// ============= Factory Function =============

/**
 * Create an ISR manager
 */
export function createISRManager(config: PartialISRConfig): ISRManager {
	return new ISRManager(config);
}

// ============= Utility Functions =============

/**
 * Parse revalidation header
 * Supports formats like:
 * - "60" (seconds)
 * - "60, stale-while-revalidate=30"
 */
export function parseRevalidateHeader(header: string): {
	revalidate: number;
	staleWhileRevalidate: number;
} {
	const parts = header.split(",").map(p => p.trim());
	let revalidate = DEFAULT_REVALIDATE;
	let staleWhileRevalidate = DEFAULT_STALE_WHILE_REVALIDATE;

	for (const part of parts) {
		if (part.includes("stale-while-revalidate=")) {
			staleWhileRevalidate = parseInt(part.split("=")[1], 10);
		} else {
			revalidate = parseInt(part, 10);
		}
	}

	return { revalidate, staleWhileRevalidate };
}

/**
 * Generate Cache-Control header for ISR
 */
export function generateCacheControlHeader(
	revalidate: number,
	staleWhileRevalidate: number
): string {
	return `public, max-age=0, s-maxage=${revalidate}, stale-while-revalidate=${staleWhileRevalidate}`;
}

/**
 * Check if a page should be regenerated
 */
export function shouldRegenerate(
	entry: ISRCacheEntry,
	revalidate: number,
	staleWhileRevalidate: number
): boolean {
	const age = (Date.now() - entry.timestamp) / 1000;
	return age > revalidate && age <= revalidate + staleWhileRevalidate;
}