/**
 * RPC Client
 *
 * Type-safe HTTP client for making requests to Bueno servers.
 * Provides method inference, automatic serialization, request deduplication,
 * optimistic updates, and retry logic support.
 */

import type { Router } from "../router";

// ============= Types =============

export interface RPCClientOptions {
	baseUrl: string;
	headers?: Record<string, string>;
	timeout?: number;
	deduplication?: DeduplicationConfig;
	optimisticUpdates?: OptimisticUpdatesConfig;
	retry?: RetryConfig;
	interceptors?: InterceptorsConfig;
}

export interface InterceptorsConfig {
	request?: RequestInterceptor | RequestInterceptor[];
	response?: ResponseInterceptor | ResponseInterceptor[];
	error?: ErrorInterceptor | ErrorInterceptor[];
}

export type RequestInterceptor = (
	config: RequestInterceptorContext,
) => RequestInterceptorContext | Promise<RequestInterceptorContext>;

export type ResponseInterceptor = (
	response: Response,
	context: InterceptorContext,
) => Response | Promise<Response>;

export type ErrorInterceptor = (
	error: Error,
	context: InterceptorContext,
) => undefined | Response | Promise<undefined | Response>;

export interface RequestInterceptorContext extends RequestInit {
	url: string;
	method: HTTPMethod;
}

export interface InterceptorContext {
	url: string;
	method: HTTPMethod;
	requestInit: RequestInit;
}

export interface DeduplicationConfig {
	enabled?: boolean;
	ttl?: number;
	keyGenerator?: (method: HTTPMethod, url: string, body?: unknown) => string;
}

export interface OptimisticUpdatesConfig {
	enabled?: boolean;
	autoRollback?: boolean;
	onConflict?: "rollback" | "overwrite" | "merge";
}

export interface RetryConfig {
	enabled?: boolean;
	maxAttempts?: number;
	initialDelay?: number;
	maxDelay?: number;
	backoffMultiplier?: number;
	retryableStatusCodes?: number[];
	retryableErrors?: string[];
	onRetry?: (attempt: number, error: Error | null, delay: number) => void;
	shouldRetry?: (
		response: Response,
		error: Error | null,
		attempt: number,
	) => boolean;
}

export interface RequestOptions {
	headers?: Record<string, string>;
	query?: Record<string, string>;
	timeout?: number;
	skipDeduplication?: boolean;
	retry?: RetryOptions;
}

export interface RetryOptions {
	enabled?: boolean;
	maxAttempts?: number;
	initialDelay?: number;
	skipRetry?: boolean;
}

export interface OptimisticOptions<T = unknown> {
	optimisticData?: T;
	rollbackData?: T;
	cacheKey?: string;
	onRollback?: (previousData: T | undefined) => void;
	onConfirm?: (data: T) => void;
}

export type HTTPMethod =
	| "GET"
	| "POST"
	| "PUT"
	| "PATCH"
	| "DELETE"
	| "HEAD"
	| "OPTIONS";

// ============= Optimistic Update Types =============

interface PendingOptimisticUpdate<T = unknown> {
	id: string;
	cacheKey: string;
	optimisticData: T;
	previousData: T | undefined;
	timestamp: number;
	status: "pending" | "confirmed" | "rolled_back";
	onRollback?: (previousData: T | undefined) => void;
	onConfirm?: (data: T) => void;
}

// ============= Retry State =============

interface RetryState {
	attempt: number;
	lastError: Error | null;
	totalDelay: number;
}

// ============= Deduplication Store =============

interface PendingRequest {
	promise: Promise<Response>;
	timestamp: number;
	body?: string;
}

interface CachedResponse {
	response: Response;
	timestamp: number;
	ttl: number;
}

class DeduplicationStore {
	private pending: Map<string, PendingRequest> = new Map();
	private cache: Map<string, CachedResponse> = new Map();
	private cleanupInterval?: Timer;

	constructor(private defaultTTL = 5000) {
		this.cleanupInterval = setInterval(() => this.cleanup(), 10000);
	}

	private cleanup(): void {
		const now = Date.now();

		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > entry.ttl) {
				this.cache.delete(key);
			}
		}

		for (const [key, entry] of this.pending.entries()) {
			if (now - entry.timestamp > 60000) {
				this.pending.delete(key);
			}
		}
	}

	getPending(key: string, body?: string): PendingRequest | undefined {
		const pending = this.pending.get(key);
		if (pending && (body === undefined || pending.body === body)) {
			return pending;
		}
		return undefined;
	}

	setPending(key: string, promise: Promise<Response>, body?: string): void {
		this.pending.set(key, { promise, timestamp: Date.now(), body });
	}

	removePending(key: string): void {
		this.pending.delete(key);
	}

	getCached(key: string, ttl: number): Response | undefined {
		const cached = this.cache.get(key);
		if (cached && Date.now() - cached.timestamp < ttl) {
			return cached.response.clone() as Response;
		}
		return undefined;
	}

	setCached(key: string, response: Response, ttl: number): void {
		this.cache.set(key, {
			response: response.clone() as Response,
			timestamp: Date.now(),
			ttl,
		});
	}

	getCachedData<T>(key: string): T | undefined {
		return (this.cache.get(key) as unknown as { data?: T })?.data;
	}

	setCachedData<T>(key: string, data: T, ttl: number): void {
		this.cache.set(key, {
			response: new Response(JSON.stringify(data)),
			timestamp: Date.now(),
			ttl,
		});
	}

	invalidate(key: string): void {
		this.cache.delete(key);
	}

	clear(): void {
		this.pending.clear();
		this.cache.clear();
	}

	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}
		this.clear();
	}

	getStats(): { pending: number; cached: number } {
		return {
			pending: this.pending.size,
			cached: this.cache.size,
		};
	}
}

// ============= Optimistic Update Store =============

class OptimisticStore {
	private pending: Map<string, PendingOptimisticUpdate> = new Map();
	private idCounter = 0;

	create<T>(
		cacheKey: string,
		optimisticData: T,
		previousData: T | undefined,
		callbacks?: {
			onRollback?: (prev: T | undefined) => void;
			onConfirm?: (data: T) => void;
		},
	): string {
		const id = `optimistic-${++this.idCounter}`;
		this.pending.set(id, {
			id,
			cacheKey,
			optimisticData,
			previousData,
			timestamp: Date.now(),
			status: "pending",
			onRollback: callbacks?.onRollback as ((previousData: unknown) => void) | undefined,
			onConfirm: callbacks?.onConfirm as ((data: unknown) => void) | undefined,
		});
		return id;
	}

	confirm(id: string, serverData?: unknown): void {
		const update = this.pending.get(id);
		if (update) {
			update.status = "confirmed";
			if (update.onConfirm && serverData !== undefined) {
				update.onConfirm(serverData as typeof update.optimisticData);
			}
			this.pending.delete(id);
		}
	}

	rollback<T>(id: string): T | undefined {
		const update = this.pending.get(id);
		if (update) {
			update.status = "rolled_back";
			const previousData = update.previousData as T | undefined;
			if (update.onRollback) {
				update.onRollback(previousData);
			}
			this.pending.delete(id);
			return previousData;
		}
		return undefined;
	}

	get(id: string): PendingOptimisticUpdate | undefined {
		return this.pending.get(id);
	}

	getByCacheKey(cacheKey: string): PendingOptimisticUpdate | undefined {
		for (const update of this.pending.values()) {
			if (update.cacheKey === cacheKey) {
				return update;
			}
		}
		return undefined;
	}

	hasPending(cacheKey: string): boolean {
		for (const update of this.pending.values()) {
			if (update.cacheKey === cacheKey && update.status === "pending") {
				return true;
			}
		}
		return false;
	}

	getOptimisticData<T>(cacheKey: string): T | undefined {
		const update = this.getByCacheKey(cacheKey);
		if (update && update.status === "pending") {
			return update.optimisticData as T;
		}
		return undefined;
	}

	clear(): void {
		this.pending.clear();
	}

	getStats(): { pending: number } {
		return { pending: this.pending.size };
	}
}

// ============= Default Key Generator =============

function defaultKeyGenerator(
	method: HTTPMethod,
	url: string,
	body?: unknown,
): string {
	const bodyHash = body ? JSON.stringify(body) : "";
	return `${method}:${url}:${bodyHash}`;
}

// ============= Default Retry Decision =============

const DEFAULT_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];
const DEFAULT_RETRYABLE_ERRORS = [
	"ECONNRESET",
	"ETIMEDOUT",
	"ENOTFOUND",
	"EAI_AGAIN",
];

function defaultShouldRetry(
	response: Response | null,
	error: Error | null,
	attempt: number,
	config?: Required<RetryConfig>,
): boolean {
	const maxAttempts = config?.maxAttempts ?? 3;
	const retryableStatusCodes =
		config?.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES;
	const retryableErrors = config?.retryableErrors ?? DEFAULT_RETRYABLE_ERRORS;

	if (attempt >= maxAttempts) {
		return false;
	}

	if (error) {
		if (retryableErrors.length > 0) {
			return retryableErrors.some(
				(code) => error.message.includes(code) || error.name === code,
			);
		}
		return DEFAULT_RETRYABLE_ERRORS.some(
			(code) => error.message.includes(code) || error.name === code,
		);
	}

	if (response) {
		if (retryableStatusCodes.length > 0) {
			return retryableStatusCodes.includes(response.status);
		}
		return DEFAULT_RETRYABLE_STATUS_CODES.includes(response.status);
	}

	return false;
}

// ============= Calculate Delay =============

function calculateDelay(
	attempt: number,
	config: Required<RetryConfig>,
): number {
	const delay = config.initialDelay * config.backoffMultiplier ** (attempt - 1);
	return Math.min(delay, config.maxDelay);
}

// ============= Sleep Utility =============

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============= RPC Client =============

export class RPCClient {
	private baseUrl: string;
	private defaultHeaders: Record<string, string>;
	private defaultTimeout: number;
	private requestInterceptors: RequestInterceptor[] = [];
	private responseInterceptors: ResponseInterceptor[] = [];
	private errorInterceptors: ErrorInterceptor[] = [];
	private deduplicationConfig: Required<DeduplicationConfig>;
	private optimisticConfig: Required<OptimisticUpdatesConfig>;
	private retryConfig: Required<RetryConfig>;
	private deduplicationStore: DeduplicationStore;
	private optimisticStore: OptimisticStore;

	constructor(options: RPCClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/$/, "");
		this.defaultHeaders = {
			"Content-Type": "application/json",
			...options.headers,
		};
		this.defaultTimeout = options.timeout ?? 30000;

		if (options.interceptors?.request) {
			this.requestInterceptors = Array.isArray(options.interceptors.request)
				? options.interceptors.request
				: [options.interceptors.request];
		}
		if (options.interceptors?.response) {
			this.responseInterceptors = Array.isArray(options.interceptors.response)
				? options.interceptors.response
				: [options.interceptors.response];
		}
		if (options.interceptors?.error) {
			this.errorInterceptors = Array.isArray(options.interceptors.error)
				? options.interceptors.error
				: [options.interceptors.error];
		}

		this.deduplicationConfig = {
			enabled: options.deduplication?.enabled ?? true,
			ttl: options.deduplication?.ttl ?? 5000,
			keyGenerator: options.deduplication?.keyGenerator ?? defaultKeyGenerator,
		};

		this.optimisticConfig = {
			enabled: options.optimisticUpdates?.enabled ?? true,
			autoRollback: options.optimisticUpdates?.autoRollback ?? true,
			onConflict: options.optimisticUpdates?.onConflict ?? "rollback",
		};

		this.retryConfig = {
			enabled: options.retry?.enabled ?? true,
			maxAttempts: options.retry?.maxAttempts ?? 3,
			initialDelay: options.retry?.initialDelay ?? 1000,
			maxDelay: options.retry?.maxDelay ?? 30000,
			backoffMultiplier: options.retry?.backoffMultiplier ?? 2,
			retryableStatusCodes: options.retry?.retryableStatusCodes ?? [
				...DEFAULT_RETRYABLE_STATUS_CODES,
			],
			retryableErrors: options.retry?.retryableErrors ?? [
				...DEFAULT_RETRYABLE_ERRORS,
			],
			onRetry: options.retry?.onRetry ?? (() => {}),
			shouldRetry:
				options.retry?.shouldRetry ??
				((response: Response, error: Error | null, attempt: number) =>
					defaultShouldRetry(response, error, attempt, undefined)),
		};

		this.deduplicationStore = new DeduplicationStore(
			this.deduplicationConfig.ttl,
		);
		this.optimisticStore = new OptimisticStore();
	}

	/**
	 * Make a GET request
	 */
	async get(path: string, options?: RequestOptions): Promise<Response> {
		return this.request("GET", path, undefined, options);
	}

	/**
	 * Make a POST request
	 */
	async post<T>(
		path: string,
		body?: T,
		options?: RequestOptions,
	): Promise<Response> {
		return this.request("POST", path, body, options);
	}

	/**
	 * Make a PUT request
	 */
	async put<T>(
		path: string,
		body?: T,
		options?: RequestOptions,
	): Promise<Response> {
		return this.request("PUT", path, body, options);
	}

	/**
	 * Make a PATCH request
	 */
	async patch<T>(
		path: string,
		body?: T,
		options?: RequestOptions,
	): Promise<Response> {
		return this.request("PATCH", path, body, options);
	}

	/**
	 * Make a DELETE request
	 */
	async delete(path: string, options?: RequestOptions): Promise<Response> {
		return this.request("DELETE", path, undefined, options);
	}

	/**
	 * Make a HEAD request
	 */
	async head(path: string, options?: RequestOptions): Promise<Response> {
		return this.request("HEAD", path, undefined, options);
	}

	/**
	 * Make an OPTIONS request
	 */
	async options(path: string, options?: RequestOptions): Promise<Response> {
		return this.request("OPTIONS", path, undefined, options);
	}

	/**
	 * Make a generic request with deduplication and retry support
	 */
	private async request<T>(
		method: HTTPMethod,
		path: string,
		body?: T,
		options?: RequestOptions,
	): Promise<Response> {
		let url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

		if (options?.query) {
			const searchParams = new URLSearchParams(options.query);
			url += `?${searchParams.toString()}`;
		}

		const skipDeduplication =
			options?.skipDeduplication || options?.retry?.skipRetry;

		if (
			this.deduplicationConfig.enabled &&
			method === "GET" &&
			!skipDeduplication
		) {
			const cacheKey = this.deduplicationConfig.keyGenerator(method, url);
			const cached = this.deduplicationStore.getCached(
				cacheKey,
				this.deduplicationConfig.ttl,
			);
			if (cached) {
				return cached;
			}
		}

		if (this.deduplicationConfig.enabled && !skipDeduplication) {
			const bodyStr = body ? JSON.stringify(body) : undefined;
			const dedupeKey = this.deduplicationConfig.keyGenerator(
				method,
				url,
				body,
			);

			const pending = this.deduplicationStore.getPending(dedupeKey, bodyStr);
			if (pending) {
				return pending.promise;
			}

			const requestPromise = this.executeWithRetry<T>(
				method,
				url,
				body,
				options,
				dedupeKey,
			);

			this.deduplicationStore.setPending(dedupeKey, requestPromise, bodyStr);

			try {
				const response = await requestPromise;
				return response;
			} finally {
				this.deduplicationStore.removePending(dedupeKey);
			}
		}

		return this.executeWithRetry<T>(method, url, body, options);
	}

	/**
	 * Execute request with retry logic
	 */
	private async executeWithRetry<T>(
		method: HTTPMethod,
		url: string,
		body?: T,
		options?: RequestOptions,
		cacheKey?: string,
	): Promise<Response> {
		const retryOptions = options?.retry;
		const retryEnabled = retryOptions?.enabled ?? this.retryConfig.enabled;
		const skipRetry = retryOptions?.skipRetry ?? false;

		if (!retryEnabled || skipRetry) {
			return this.executeRequest<T>(method, url, body, options, cacheKey);
		}

		const maxAttempts =
			retryOptions?.maxAttempts ?? this.retryConfig.maxAttempts;
		const initialDelay =
			retryOptions?.initialDelay ?? this.retryConfig.initialDelay;

		const state: RetryState = {
			attempt: 0,
			lastError: null,
			totalDelay: 0,
		};

		while (state.attempt < maxAttempts) {
			state.attempt++;

			try {
				const response = await this.executeRequest<T>(
					method,
					url,
					body,
					options,
					cacheKey,
				);

				if (
					response.ok ||
					!this.shouldRetryResponse(response, null, state.attempt, maxAttempts)
				) {
					return response;
				}

				if (state.attempt < maxAttempts) {
					const delay = calculateDelay(state.attempt, {
						...this.retryConfig,
						initialDelay,
						maxAttempts,
					});
					this.retryConfig.onRetry(state.attempt, null, delay);
					await sleep(delay);
					state.totalDelay += delay;
				} else {
					return response;
				}
			} catch (error) {
				state.lastError =
					error instanceof Error ? error : new Error(String(error));

				if (
					state.attempt < maxAttempts &&
					this.shouldRetryError(state.lastError, state.attempt, maxAttempts)
				) {
					const delay = calculateDelay(state.attempt, {
						...this.retryConfig,
						initialDelay,
						maxAttempts,
					});
					this.retryConfig.onRetry(state.attempt, state.lastError, delay);
					await sleep(delay);
					state.totalDelay += delay;
				} else {
					throw state.lastError;
				}
			}
		}

		throw state.lastError || new Error("Max retry attempts exceeded");
	}

	/**
	 * Check if response should trigger a retry
	 */
	private shouldRetryResponse(
		response: Response,
		error: Error | null,
		attempt: number,
		maxAttempts: number,
	): boolean {
		if (attempt >= maxAttempts) {
			return false;
		}
		return this.retryConfig.shouldRetry(response, error, attempt);
	}

	/**
	 * Check if error should trigger a retry
	 */
	private shouldRetryError(
		error: Error,
		attempt: number,
		maxAttempts: number,
	): boolean {
		if (attempt >= maxAttempts) {
			return false;
		}
		return this.retryConfig.shouldRetry(
			null as unknown as Response,
			error,
			attempt,
		);
	}

	/**
	 * Execute the actual HTTP request
	 */
	private async executeRequest<T>(
		method: HTTPMethod,
		url: string,
		body?: T,
		options?: RequestOptions,
		cacheKey?: string,
	): Promise<Response> {
		let config: RequestInit = {
			method,
			headers: {
				...this.defaultHeaders,
				...options?.headers,
			},
		};

		if (body && !["GET", "HEAD", "OPTIONS"].includes(method)) {
			config.body = JSON.stringify(body);
		}

		const context: InterceptorContext = { url, method, requestInit: config };

		for (const interceptor of this.requestInterceptors) {
			const interceptorContext: RequestInterceptorContext = {
				...config,
				url,
				method,
			};
			const result = await interceptor(interceptorContext);
			config = result;
			context.requestInit = config;
		}

		const controller = new AbortController();
		const timeout = options?.timeout ?? this.defaultTimeout;
		const timeoutId = setTimeout(() => controller.abort(), timeout);
		config.signal = controller.signal;

		try {
			let response = (await fetch(url, config)) as Response;

			if (cacheKey && method === "GET" && response.ok) {
				this.deduplicationStore.setCached(
					cacheKey,
					response,
					this.deduplicationConfig.ttl,
				);
			}

			for (const interceptor of this.responseInterceptors) {
				response = await interceptor(response, context);
			}

			return response;
		} catch (error) {
			const processedError =
				error instanceof Error ? error : new Error(String(error));

			for (const interceptor of this.errorInterceptors) {
				const result = await interceptor(processedError, context);
				if (result instanceof Response) {
					return result;
				}
			}

			if (processedError.name === "AbortError") {
				throw new Error(`Request timeout after ${timeout}ms`);
			}
			throw processedError;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	// ============= Optimistic Updates =============

	/**
	 * Perform an optimistic update
	 */
	async optimistic<T = unknown, R = unknown>(
		method: "POST" | "PUT" | "PATCH" | "DELETE",
		path: string,
		options?: {
			body?: T;
			query?: Record<string, string>;
			headers?: Record<string, string>;
		} & OptimisticOptions<R>,
	): Promise<{ response: Response; rollbackId?: string }> {
		if (!this.optimisticConfig.enabled) {
			const response = await this.request(method, path, options?.body, options);
			return { response };
		}

		const cacheKey = options?.cacheKey ?? path;
		const previousData = this.deduplicationStore.getCachedData<R>(cacheKey);
		const optimisticData = options?.optimisticData;

		let rollbackId: string | undefined;

		if (optimisticData !== undefined) {
			rollbackId = this.optimisticStore.create<R>(
				cacheKey,
				optimisticData,
				previousData,
				{ onRollback: options?.onRollback, onConfirm: options?.onConfirm },
			);

			this.deduplicationStore.setCachedData(
				cacheKey,
				optimisticData,
				this.deduplicationConfig.ttl,
			);
		}

		try {
			const response = await this.request(method, path, options?.body, {
				query: options?.query,
				headers: options?.headers,
				skipDeduplication: true,
			});

			if (response.ok) {
				if (rollbackId) {
					const responseData = await response
						.clone()
						.json()
						.catch(() => undefined);
					this.optimisticStore.confirm(rollbackId, responseData);
				}
				return { response, rollbackId };
			}
			if (rollbackId && this.optimisticConfig.autoRollback) {
				this.rollback(rollbackId);
			}
			return { response, rollbackId };
		} catch (error) {
			if (rollbackId && this.optimisticConfig.autoRollback) {
				this.rollback(rollbackId);
			}
			throw error;
		}
	}

	/**
	 * Optimistic POST - create a resource optimistically
	 */
	async optimisticPost<T = unknown, R = unknown>(
		path: string,
		body: T,
		options?: OptimisticOptions<R> & {
			query?: Record<string, string>;
			headers?: Record<string, string>;
		},
	): Promise<{ response: Response; rollbackId?: string }> {
		return this.optimistic<T, R>("POST", path, { body, ...options });
	}

	/**
	 * Optimistic PUT - update a resource optimistically
	 */
	async optimisticPut<T = unknown, R = unknown>(
		path: string,
		body: T,
		options?: OptimisticOptions<R> & {
			query?: Record<string, string>;
			headers?: Record<string, string>;
		},
	): Promise<{ response: Response; rollbackId?: string }> {
		return this.optimistic<T, R>("PUT", path, { body, ...options });
	}

	/**
	 * Optimistic PATCH - partially update a resource optimistically
	 */
	async optimisticPatch<T = unknown, R = unknown>(
		path: string,
		body: T,
		options?: OptimisticOptions<R> & {
			query?: Record<string, string>;
			headers?: Record<string, string>;
		},
	): Promise<{ response: Response; rollbackId?: string }> {
		return this.optimistic<T, R>("PATCH", path, { body, ...options });
	}

	/**
	 * Optimistic DELETE - delete a resource optimistically
	 */
	async optimisticDelete<R = unknown>(
		path: string,
		options?: OptimisticOptions<R> & {
			query?: Record<string, string>;
			headers?: Record<string, string>;
		},
	): Promise<{ response: Response; rollbackId?: string }> {
		return this.optimistic<never, R>("DELETE", path, options);
	}

	/**
	 * Rollback an optimistic update
	 */
	rollback<T>(rollbackId: string): T | undefined {
		const previousData = this.optimisticStore.rollback<T>(rollbackId);

		if (previousData !== undefined) {
			const update = this.optimisticStore.get(rollbackId);
			if (update) {
				this.deduplicationStore.setCachedData(
					update.cacheKey,
					previousData,
					this.deduplicationConfig.ttl,
				);
			}
		}

		return previousData;
	}

	/**
	 * Confirm an optimistic update
	 */
	confirm(rollbackId: string, serverData?: unknown): void {
		this.optimisticStore.confirm(rollbackId, serverData);
	}

	/**
	 * Check if there's a pending optimistic update for a cache key
	 */
	hasPendingOptimisticUpdate(cacheKey: string): boolean {
		return this.optimisticStore.hasPending(cacheKey);
	}

	/**
	 * Get optimistic data for a cache key
	 */
	getOptimisticData<T>(cacheKey: string): T | undefined {
		return this.optimisticStore.getOptimisticData<T>(cacheKey);
	}

	/**
	 * Get all pending optimistic updates count
	 */
	getPendingOptimisticCount(): number {
		return this.optimisticStore.getStats().pending;
	}

	/**
	 * Clear all pending optimistic updates
	 */
	clearOptimisticUpdates(): void {
		this.optimisticStore.clear();
	}

	// ============= Retry Utilities =============

	/**
	 * Make a request with explicit retry options
	 */
	async withRetry<T>(
		method: HTTPMethod,
		path: string,
		body?: T,
		retryOptions?: RetryOptions,
	): Promise<Response> {
		return this.request(method, path, body, { retry: retryOptions });
	}

	/**
	 * Check if retry is enabled
	 */
	isRetryEnabled(): boolean {
		return this.retryConfig.enabled;
	}

	/**
	 * Get max retry attempts
	 */
	getMaxRetryAttempts(): number {
		return this.retryConfig.maxAttempts;
	}

	/**
	 * Get retry configuration
	 */
	getRetryConfig(): Required<RetryConfig> {
		return { ...this.retryConfig };
	}

	// ============= Interceptor Management =============

	/**
	 * Add a request interceptor
	 */
	addRequestInterceptor(interceptor: RequestInterceptor): void {
		this.requestInterceptors.push(interceptor);
	}

	/**
	 * Add a response interceptor
	 */
	addResponseInterceptor(interceptor: ResponseInterceptor): void {
		this.responseInterceptors.push(interceptor);
	}

	/**
	 * Add an error interceptor
	 */
	addErrorInterceptor(interceptor: ErrorInterceptor): void {
		this.errorInterceptors.push(interceptor);
	}

	/**
	 * Remove a request interceptor
	 */
	removeRequestInterceptor(interceptor: RequestInterceptor): boolean {
		const index = this.requestInterceptors.indexOf(interceptor);
		if (index > -1) {
			this.requestInterceptors.splice(index, 1);
			return true;
		}
		return false;
	}

	/**
	 * Remove a response interceptor
	 */
	removeResponseInterceptor(interceptor: ResponseInterceptor): boolean {
		const index = this.responseInterceptors.indexOf(interceptor);
		if (index > -1) {
			this.responseInterceptors.splice(index, 1);
			return true;
		}
		return false;
	}

	/**
	 * Remove an error interceptor
	 */
	removeErrorInterceptor(interceptor: ErrorInterceptor): boolean {
		const index = this.errorInterceptors.indexOf(interceptor);
		if (index > -1) {
			this.errorInterceptors.splice(index, 1);
			return true;
		}
		return false;
	}

	/**
	 * Clear all interceptors
	 */
	clearInterceptors(): void {
		this.requestInterceptors = [];
		this.responseInterceptors = [];
		this.errorInterceptors = [];
	}

	/**
	 * Get interceptor counts
	 */
	getInterceptorStats(): { request: number; response: number; error: number } {
		return {
			request: this.requestInterceptors.length,
			response: this.responseInterceptors.length,
			error: this.errorInterceptors.length,
		};
	}

	/**
	 * Create client with interceptors
	 */
	withInterceptors(interceptors: InterceptorsConfig): RPCClient {
		return new RPCClient({
			baseUrl: this.baseUrl,
			headers: this.defaultHeaders,
			timeout: this.defaultTimeout,
			deduplication: this.deduplicationConfig,
			optimisticUpdates: this.optimisticConfig,
			retry: this.retryConfig,
			interceptors,
		});
	}

	// ============= Client Utilities =============

	/**
	 * Create a new client with different base URL
	 */
	withBaseUrl(baseUrl: string): RPCClient {
		const interceptors: InterceptorsConfig = {};
		if (this.requestInterceptors.length > 0)
			interceptors.request = this.requestInterceptors;
		if (this.responseInterceptors.length > 0)
			interceptors.response = this.responseInterceptors;
		if (this.errorInterceptors.length > 0)
			interceptors.error = this.errorInterceptors;

		return new RPCClient({
			baseUrl,
			headers: this.defaultHeaders,
			timeout: this.defaultTimeout,
			deduplication: this.deduplicationConfig,
			optimisticUpdates: this.optimisticConfig,
			retry: this.retryConfig,
			interceptors,
		});
	}

	/**
	 * Create a new client with additional headers
	 */
	withHeaders(headers: Record<string, string>): RPCClient {
		const interceptors: InterceptorsConfig = {};
		if (this.requestInterceptors.length > 0)
			interceptors.request = this.requestInterceptors;
		if (this.responseInterceptors.length > 0)
			interceptors.response = this.responseInterceptors;
		if (this.errorInterceptors.length > 0)
			interceptors.error = this.errorInterceptors;

		return new RPCClient({
			baseUrl: this.baseUrl,
			headers: { ...this.defaultHeaders, ...headers },
			timeout: this.defaultTimeout,
			deduplication: this.deduplicationConfig,
			optimisticUpdates: this.optimisticConfig,
			retry: this.retryConfig,
			interceptors,
		});
	}

	/**
	 * Clear the deduplication cache
	 */
	clearCache(): void {
		this.deduplicationStore.clear();
	}

	/**
	 * Clear all caches
	 */
	clearAllCaches(): void {
		this.deduplicationStore.clear();
		this.optimisticStore.clear();
	}

	/**
	 * Invalidate a specific cache key
	 */
	invalidateCache(cacheKey: string): void {
		this.deduplicationStore.invalidate(cacheKey);
	}

	/**
	 * Get deduplication statistics
	 */
	getDeduplicationStats(): { pending: number; cached: number } {
		return this.deduplicationStore.getStats();
	}

	/**
	 * Check if deduplication is enabled
	 */
	isDeduplicationEnabled(): boolean {
		return this.deduplicationConfig.enabled;
	}

	/**
	 * Get deduplication TTL
	 */
	getDeduplicationTTL(): number {
		return this.deduplicationConfig.ttl;
	}

	/**
	 * Check if optimistic updates are enabled
	 */
	isOptimisticUpdatesEnabled(): boolean {
		return this.optimisticConfig.enabled;
	}
}

// ============= Client Factory =============

export function createRPClient(options: RPCClientOptions): RPCClient {
	return new RPCClient(options);
}

export function bc<T>(options: RPCClientOptions): RPCClient {
	return createRPClient(options);
}

// ============= Route Type Extraction =============

export interface RouteTypeInfo {
	method: HTTPMethod;
	path: string;
}

export function extractRouteTypes(router: Router): RouteTypeInfo[] {
	const routes = router.getRoutes();
	return routes.map((r) => ({
		method: r.method as HTTPMethod,
		path: r.pattern,
	}));
}

// ============= Response Helpers =============

export async function parseJSON<T>(response: Response): Promise<T> {
	return response.json() as Promise<T>;
}

export async function parseText(response: Response): Promise<string> {
	return response.text();
}

export function isOK(response: Response): boolean {
	return response.ok;
}

export function isStatus(response: Response, status: number): boolean {
	return response.status === status;
}

export async function throwIfNotOK(response: Response): Promise<Response> {
	if (!response.ok) {
		const error = await response.text();
		throw new Error(`HTTP ${response.status}: ${error}`);
	}
	return response;
}
