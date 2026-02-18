/**
 * Interceptors System
 *
 * Interceptors wrap around the handler execution and can modify both the
 * request before it reaches the handler and the response after.
 * They run after guards but before pipes in the request pipeline.
 *
 * Execution Order:
 * Incoming Request → Guards → Interceptors (pre) → Pipes → Handler → Interceptors (post) → Response
 *
 * Interceptors can:
 * - Log request/response information
 * - Transform response data
 * - Handle timeouts
 * - Cache responses
 * - Add headers or modify request/response
 */

import type { Context } from "../context";
import type { Token } from "../container";

// ============= Types =============

/**
 * Call handler interface for continuing the interceptor chain
 *
 * @example
 * ```typescript
 * const result = await next.handle();
 * ```
 */
export interface CallHandler<T = unknown> {
	/**
	 * Execute the next handler in the chain
	 * @returns Promise of the handler result
	 */
	handle(): Promise<T>;
}

/**
 * Interceptor interface for request/response transformation
 *
 * @example
 * ```typescript
 * @Injectable()
 * class LoggingInterceptor implements NestInterceptor {
 *   async intercept(context: Context, next: CallHandler) {
 *     console.log('Before...');
 *     const result = await next.handle();
 *     console.log('After...');
 *     return result;
 *   }
 * }
 * ```
 */
export interface NestInterceptor<T = unknown, R = unknown> {
	intercept(context: Context, next: CallHandler<T>): Promise<R> | R;
}

/**
 * Interceptor function type (for functional interceptors)
 *
 * @example
 * ```typescript
 * const loggingInterceptor: InterceptorFn = async (context, next) => {
 *   console.log('Request started');
 *   const result = await next();
 *   console.log('Request completed');
 *   return result;
 * };
 * ```
 */
export type InterceptorFn = (
	context: Context,
	next: () => Promise<unknown>
) => Promise<unknown> | unknown;

/**
 * Interceptor type - can be:
 * - A token for an interceptor class registered in the container
 * - An interceptor class instance
 * - An interceptor function
 */
export type Interceptor = Token<NestInterceptor> | NestInterceptor | InterceptorFn;

// ============= Metadata Storage =============

// Type alias for class constructors
type Constructor = new (...args: unknown[]) => unknown;

// WeakMap for storing interceptors metadata on classes
const interceptorsClassMetadata = new WeakMap<Constructor, Interceptor[]>();

// WeakMap for storing interceptors metadata on method prototypes
const interceptorsMethodMetadata = new WeakMap<object, Map<string | symbol, Interceptor[]>>();

/**
 * Set interceptors on a class constructor
 */
function setClassInterceptors(target: Constructor, interceptors: Interceptor[]): void {
	interceptorsClassMetadata.set(target, interceptors);
}

/**
 * Get interceptors from a class constructor
 */
export function getClassInterceptors(target: Constructor): Interceptor[] | undefined {
	return interceptorsClassMetadata.get(target);
}

/**
 * Set interceptors on a method
 */
function setMethodInterceptors(
	target: object,
	propertyKey: string | symbol,
	interceptors: Interceptor[],
): void {
	if (!interceptorsMethodMetadata.has(target)) {
		interceptorsMethodMetadata.set(target, new Map());
	}
	interceptorsMethodMetadata.get(target)?.set(propertyKey, interceptors);
}

/**
 * Get interceptors from a method
 */
export function getMethodInterceptors(
	target: object,
	propertyKey: string | symbol,
): Interceptor[] | undefined {
	return interceptorsMethodMetadata.get(target)?.get(propertyKey);
}

// ============= Decorators =============

/**
 * Decorator to apply interceptors to a controller class or method.
 * Interceptors are executed in the order they are provided.
 *
 * @param interceptors - Interceptors to apply
 * @returns ClassDecorator & MethodDecorator
 *
 * @example
 * ```typescript
 * // Apply to all methods in controller
 * @Controller('users')
 * @UseInterceptors(LoggingInterceptor)
 * class UsersController {
 *   @Get()
 *   @UseInterceptors(TransformInterceptor) // Additional interceptor
 *   getUsers() {}
 * }
 * ```
 */
export function UseInterceptors(...interceptors: Interceptor[]): MethodDecorator & ClassDecorator {
	const decorator = (
		target: unknown,
		propertyKey?: string | symbol,
		descriptor?: PropertyDescriptor,
	): PropertyDescriptor | void => {
		if (propertyKey !== undefined && descriptor !== undefined) {
			// Method decorator
			const targetObj = target as object;
			const existingInterceptors = getMethodInterceptors(targetObj, propertyKey) ?? [];
			setMethodInterceptors(targetObj, propertyKey, [...existingInterceptors, ...interceptors]);
			return descriptor;
		} else {
			// Class decorator
			const targetClass = target as Constructor;
			const existingInterceptors = getClassInterceptors(targetClass) ?? [];
			setClassInterceptors(targetClass, [...existingInterceptors, ...interceptors]);
		}
	};
	return decorator as MethodDecorator & ClassDecorator;
}

// ============= Built-in Interceptors =============

/**
 * LoggingInterceptor - Logs request start, end, and duration
 *
 * @example
 * ```typescript
 * @Controller('api')
 * @UseInterceptors(LoggingInterceptor)
 * class ApiController {
 *   @Get('users')
 *   getUsers() {}
 * }
 * // Output:
 * // [GET] /api/users - Started
 * // [GET] /api/users - Completed in 15ms
 * ```
 */
export class LoggingInterceptor implements NestInterceptor {
	async intercept(context: Context, next: CallHandler): Promise<unknown> {
		const method = context.method;
		const path = context.path;
		const startTime = Date.now();

		console.log(`[${method}] ${path} - Started`);

		try {
			const result = await next.handle();
			const duration = Date.now() - startTime;
			console.log(`[${method}] ${path} - Completed in ${duration}ms`);
			return result;
		} catch (error) {
			const duration = Date.now() - startTime;
			console.error(`[${method}] ${path} - Failed in ${duration}ms`, error);
			throw error;
		}
	}
}

/**
 * Response wrapper interface for TransformInterceptor
 */
export interface TransformResponse<T> {
	data: T;
	timestamp: string;
}

/**
 * TransformInterceptor - Wraps response in standard format
 *
 * @example
 * ```typescript
 * @Get()
 * @UseInterceptors(new TransformInterceptor())
 * getUsers() {
 *   return [{ id: 1, name: 'John' }];
 * }
 * // Response: { data: [{ id: 1, name: 'John' }], timestamp: '2024-01-15T10:30:00.000Z' }
 * ```
 */
export class TransformInterceptor<T = unknown> implements NestInterceptor<T, TransformResponse<T>> {
	async intercept(context: Context, next: CallHandler<T>): Promise<TransformResponse<T>> {
		const result = await next.handle();
		return {
			data: result,
			timestamp: new Date().toISOString(),
		};
	}
}

/**
 * TimeoutInterceptor - Aborts request after specified timeout
 *
 * @example
 * ```typescript
 * @Get('slow-endpoint')
 * @UseInterceptors(new TimeoutInterceptor(5000)) // 5 second timeout
 * slowOperation() {}
 * ```
 */
export class TimeoutInterceptor implements NestInterceptor {
	constructor(private timeoutMs: number) {}

	async intercept(context: Context, next: CallHandler): Promise<unknown> {
		// Create a timeout promise that rejects
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new Error(`Request timeout after ${this.timeoutMs}ms`));
			}, this.timeoutMs);
		});

		// Race between the handler and timeout
		return Promise.race([next.handle(), timeoutPromise]);
	}
}

/**
 * Cache entry interface
 */
interface CacheEntry<T = unknown> {
	value: T;
	expiresAt: number;
}

/**
 * CacheInterceptor - Caches responses in memory
 *
 * Note: This is a simple in-memory cache. For production use,
 * consider using a distributed cache like Redis.
 *
 * @example
 * ```typescript
 * @Get('users')
 * @UseInterceptors(new CacheInterceptor(60000)) // Cache for 60 seconds
 * getUsers() {
 *   return this.userService.findAll(); // Only called if not cached
 * }
 * ```
 */
export class CacheInterceptor implements NestInterceptor {
	private static cache = new Map<string, CacheEntry>();
	private static cleanupInterval: Timer | null = null;

	constructor(private ttlMs: number = 60000) {
		// Setup periodic cleanup of expired entries
		CacheInterceptor.setupCleanup();
	}

	private static setupCleanup(): void {
		if (CacheInterceptor.cleanupInterval === null) {
			CacheInterceptor.cleanupInterval = setInterval(() => {
				const now = Date.now();
				for (const [key, entry] of CacheInterceptor.cache.entries()) {
					if (entry.expiresAt < now) {
						CacheInterceptor.cache.delete(key);
					}
				}
			}, 60000); // Cleanup every minute
		}
	}

	/**
	 * Generate cache key from context
	 */
	private getCacheKey(context: Context): string {
		return `${context.method}:${context.path}:${context.url.search}`;
	}

	/**
	 * Clear all cached entries
	 */
	static clearCache(): void {
		CacheInterceptor.cache.clear();
	}

	/**
	 * Clear cache for a specific key pattern
	 */
	static clearCachePattern(pattern: string): void {
		for (const key of CacheInterceptor.cache.keys()) {
			if (key.includes(pattern)) {
				CacheInterceptor.cache.delete(key);
			}
		}
	}

	async intercept(context: Context, next: CallHandler): Promise<unknown> {
		const cacheKey = this.getCacheKey(context);
		const now = Date.now();

		// Check if we have a valid cached response
		const cached = CacheInterceptor.cache.get(cacheKey);
		if (cached && cached.expiresAt > now) {
			return cached.value;
		}

		// Execute handler and cache the result
		const result = await next.handle();

		// Only cache successful responses
		CacheInterceptor.cache.set(cacheKey, {
			value: result,
			expiresAt: now + this.ttlMs,
		});

		return result;
	}
}

/**
 * HeaderInterceptor - Adds custom headers to responses
 *
 * @example
 * ```typescript
 * @Get('api/data')
 * @UseInterceptors(new HeaderInterceptor({ 'X-Custom-Header': 'value' }))
 * getData() {}
 * ```
 */
export class HeaderInterceptor implements NestInterceptor {
	constructor(private headers: Record<string, string>) {}

	async intercept(context: Context, next: CallHandler): Promise<unknown> {
		const result = await next.handle();

		// If result is a Response object, add headers
		if (result instanceof Response) {
			const newHeaders = new Headers(result.headers);
			for (const [key, value] of Object.entries(this.headers)) {
				newHeaders.set(key, value);
			}
			return new Response(result.body, {
				status: result.status,
				statusText: result.statusText,
				headers: newHeaders,
			});
		}

		return result;
	}
}

// ============= Interceptor Executor =============

/**
 * Interceptor executor options
 */
export interface InterceptorExecutorOptions {
	/** Global interceptors applied to all routes */
	globalInterceptors?: Interceptor[];
	/** Interceptors from controller class */
	classInterceptors?: Interceptor[];
	/** Interceptors from method */
	methodInterceptors?: Interceptor[];
	/** Container for resolving interceptor instances */
	resolveInterceptor?: (interceptor: Interceptor) => NestInterceptor | InterceptorFn | null;
}

/**
 * Create a call handler that chains interceptors
 */
function createCallHandler(
	interceptors: Array<NestInterceptor | InterceptorFn>,
	context: Context,
	finalHandler: () => Promise<unknown>,
	resolveInterceptor?: (interceptor: Interceptor) => NestInterceptor | InterceptorFn | null,
): CallHandler {
	let index = 0;

	const execute: () => Promise<unknown> = async () => {
		if (index >= interceptors.length) {
			return finalHandler();
		}

		const interceptor = interceptors[index++];
		let interceptorInstance: NestInterceptor | InterceptorFn | null = interceptor;

		// Resolve if needed
		if (resolveInterceptor && !isNestInterceptor(interceptor) && !isInterceptorFn(interceptor)) {
			interceptorInstance = resolveInterceptor(interceptor);
		}

		if (!interceptorInstance) {
			console.warn("Interceptor could not be resolved:", interceptor);
			return execute();
		}

		// Create the next call handler
		const next: CallHandler = {
			handle: () => execute(),
		};

		// Execute the interceptor
		if (isInterceptorFn(interceptorInstance)) {
			return interceptorInstance(context, () => execute());
		} else {
			return interceptorInstance.intercept(context, next);
		}
	};

	return {
		handle: execute,
	};
}

/**
 * Execute interceptors wrapping around the handler
 *
 * @param context - Request context
 * @param handler - The final handler to execute
 * @param options - Interceptor executor options
 * @returns Promise of the result
 */
export async function executeInterceptors(
	context: Context,
	handler: () => Promise<unknown>,
	options: InterceptorExecutorOptions,
): Promise<unknown> {
	const {
		globalInterceptors = [],
		classInterceptors = [],
		methodInterceptors = [],
		resolveInterceptor,
	} = options;

	// Combine all interceptors in execution order
	// Global → Class → Method
	const allInterceptors: Interceptor[] = [
		...globalInterceptors,
		...classInterceptors,
		...methodInterceptors,
	];

	// If no interceptors, just execute the handler
	if (allInterceptors.length === 0) {
		return handler();
	}

	// Resolve all interceptors
	const resolvedInterceptors: Array<NestInterceptor | InterceptorFn> = [];

	for (const interceptor of allInterceptors) {
		let instance: NestInterceptor | InterceptorFn | null = null;

		// Resolve the interceptor
		if (typeof interceptor === "function") {
			// Check if it's an interceptor function or a class constructor
			const funcInterceptor = interceptor as { prototype?: unknown; intercept?: unknown };
			if (
				funcInterceptor.prototype &&
				typeof funcInterceptor.prototype === "object" &&
				"intercept" in (funcInterceptor.prototype as object)
			) {
				// It's a class constructor - try to resolve from container or create instance
				instance = resolveInterceptor ? resolveInterceptor(interceptor) : null;
				if (!instance) {
					// Create a new instance if not in container
					const InterceptorClass = interceptor as unknown as new () => NestInterceptor;
					instance = new InterceptorClass();
				}
			} else {
				// It's an interceptor function
				instance = interceptor as InterceptorFn;
			}
		} else if (typeof interceptor === "object" && interceptor !== null) {
			// It's a token or already an instance
			const objInterceptor = interceptor as { intercept?: unknown };
			if (
				"intercept" in objInterceptor &&
				typeof objInterceptor.intercept === "function"
			) {
				// It's already a NestInterceptor instance
				instance = interceptor as NestInterceptor;
			} else {
				// It's a token - try to resolve
				instance = resolveInterceptor ? resolveInterceptor(interceptor) : null;
			}
		}

		if (instance) {
			resolvedInterceptors.push(instance);
		} else {
			console.warn("Interceptor could not be resolved:", interceptor);
		}
	}

	// Create the call handler chain
	const callHandler = createCallHandler(
		resolvedInterceptors,
		context,
		handler,
		resolveInterceptor,
	);

	return callHandler.handle();
}

// ============= Type Guards =============

/**
 * Check if a value is a NestInterceptor instance
 */
export function isNestInterceptor(value: unknown): value is NestInterceptor {
	return (
		typeof value === "object" &&
		value !== null &&
		"intercept" in value &&
		typeof (value as NestInterceptor).intercept === "function"
	);
}

/**
 * Check if a value is an interceptor function
 */
export function isInterceptorFn(value: unknown): value is InterceptorFn {
	return typeof value === "function" && !isNestInterceptor(value);
}