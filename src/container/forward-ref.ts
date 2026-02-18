/**
 * Forward Reference for Circular Dependencies
 *
 * Provides a way to resolve circular dependencies by deferring the resolution
 * of a dependency until it's actually needed. This allows two or more services
 * to depend on each other without causing infinite loops during instantiation.
 */

/**
 * Forward reference container for lazy resolution of circular dependencies.
 * 
 * @template T - The type of the referenced value
 * 
 * @example
 * ```typescript
 * // Creating a forward reference
 * const ref = forwardRef(() => ServiceB);
 * 
 * // Using with @Inject decorator
 * @Injectable()
 * class ServiceA {
 *   constructor(
 *     @Inject(forwardRef(() => ServiceB))
 *     private serviceB: ServiceB
 *   ) {}
 * }
 * ```
 */
export interface ForwardRef<T> {
	/**
	 * The unique symbol identifying this as a ForwardRef
	 */
	readonly __forwardRef: unique symbol;
	
	/**
	 * Factory function that returns the actual value when called.
	 * This is invoked lazily when the dependency is first accessed.
	 */
	forwardRef: () => T;
}

/**
 * Symbol used to identify ForwardRef objects
 */
const FORWARD_REF_SYMBOL = Symbol.for('buno.forwardRef');

/**
 * Create a forward reference for circular dependency resolution.
 * 
 * The provided factory function is called lazily when the dependency
 * is actually resolved, allowing the referenced class to be defined
 * later in the module loading process.
 * 
 * @template T - The type of the referenced value
 * @param fn - Factory function that returns the actual token or value
 * @returns A ForwardRef object that can be used with @Inject()
 * 
 * @example
 * ```typescript
 * // service-a.ts
 * @Injectable()
 * export class ServiceA {
 *   constructor(
 *     @Inject(forwardRef(() => ServiceB))
 *     private serviceB: ServiceB
 *   ) {}
 *   
 *   doSomething() {
 *     return this.serviceB.help();
 *   }
 * }
 * 
 * // service-b.ts
 * @Injectable()
 * export class ServiceB {
 *   constructor(
 *     @Inject(forwardRef(() => ServiceA))
 *     private serviceA: ServiceA
 *   ) {}
 *   
 *   help() {
 *     return 'helping';
 *   }
 * }
 * ```
 */
export function forwardRef<T>(fn: () => T): ForwardRef<T> {
	return {
		__forwardRef: FORWARD_REF_SYMBOL,
		forwardRef: fn,
	} as unknown as ForwardRef<T>;
}

/**
 * Type guard to check if a value is a ForwardRef.
 * 
 * @param value - The value to check
 * @returns True if the value is a ForwardRef, false otherwise
 * 
 * @example
 * ```typescript
 * const ref = forwardRef(() => MyService);
 * if (isForwardRef(ref)) {
 *   const actualToken = resolveForwardRef(ref);
 * }
 * ```
 */
export function isForwardRef(value: unknown): value is ForwardRef<unknown> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'__forwardRef' in value &&
		'forwardRef' in value &&
		typeof (value as ForwardRef<unknown>).forwardRef === 'function'
	);
}

/**
 * Resolve a forward reference to its actual value.
 * 
 * If the provided value is a ForwardRef, this function calls its
 * factory function to get the actual value. If it's not a ForwardRef,
 * the value is returned as-is.
 * 
 * @template T - The expected type of the resolved value
 * @param ref - Either a ForwardRef or a direct value
 * @returns The resolved value
 * 
 * @example
 * ```typescript
 * const token = Token<ServiceB>('ServiceB');
 * const ref = forwardRef(() => token);
 * 
 * // Resolves to the token
 * const actualToken = resolveForwardRef(ref);
 * ```
 */
export function resolveForwardRef<T>(ref: ForwardRef<T> | T): T {
	if (isForwardRef(ref)) {
		return ref.forwardRef();
	}
	return ref;
}