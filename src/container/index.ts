/**
 * Dependency Injection Container
 *
 * Provides inversion of control for managing dependencies
 * with support for constructor injection, factories, and scopes.
 * Supports circular dependency resolution via forward references.
 */

import type { Provider } from "../types";
import {
	type ForwardRef,
	forwardRef,
	isForwardRef,
	resolveForwardRef,
} from "./forward-ref";

export type { Provider } from "../types";
export { type ForwardRef, forwardRef, isForwardRef, resolveForwardRef };

// ============= Token Factory =============

/**
 * Token type - represents an injection token
 */
export type Token<T = unknown> = symbol & { readonly __type?: T };

/**
 * Creates a typed injection token (symbol-based)
 */
export function createToken<T>(description: string): Token<T> {
	return Symbol(description) as Token<T>;
}

/**
 * Token function - creates a typed injection token (symbol-based)
 */
export const Token = createToken;

// ============= Provider Resolution =============

interface ResolvedProvider<T = unknown> {
	provider: Provider<T>;
	instance?: T;
}

// ============= Circular Dependency Detection =============

class ResolutionStack {
	private stack = new Set<Token>();
	/**
	 * Track tokens that are being lazily resolved for circular dependencies.
	 * These tokens have a proxy placeholder that will be resolved later.
	 */
	private lazyResolutions = new Map<Token, { resolved: boolean; instance?: unknown }>();

	push(token: Token): void {
		if (this.stack.has(token)) {
			throw new Error(
				"Circular dependency detected: Token already in resolution stack",
			);
		}
		this.stack.add(token);
	}

	pop(token: Token): void {
		this.stack.delete(token);
	}

	has(token: Token): boolean {
		return this.stack.has(token);
	}

	/**
	 * Mark a token as being lazily resolved (for circular dependency support)
	 */
	markLazy(token: Token, placeholder: { resolved: boolean; instance?: unknown }): void {
		this.lazyResolutions.set(token, placeholder);
	}

	/**
	 * Check if a token has a lazy resolution placeholder
	 */
	hasLazy(token: Token): boolean {
		return this.lazyResolutions.has(token);
	}

	/**
	 * Get the lazy resolution placeholder for a token
	 */
	getLazy(token: Token): { resolved: boolean; instance?: unknown } | undefined {
		return this.lazyResolutions.get(token);
	}

	/**
	 * Clear lazy resolution for a token after it's fully resolved
	 */
	clearLazy(token: Token): void {
		this.lazyResolutions.delete(token);
	}
}

// ============= Container =============

export class Container {
	private providers = new Map<Token, ResolvedProvider>();
	private resolutionStack = new ResolutionStack();

	/**
	 * Register a single provider
	 */
	register<T>(provider: Provider<T>): void {
		if (this.providers.has(provider.token as Token)) {
			throw new Error(
				`Provider already registered for token: ${String(provider.token)}`,
			);
		}

		this.providers.set(provider.token as Token, {
			provider: {
				...provider,
				scope: provider.scope ?? "singleton",
			},
		});
	}

	/**
	 * Register multiple providers at once
	 */
	registerAll(providers: Provider[]): void {
		for (const provider of providers) {
			this.register(provider);
		}
	}

	/**
	 * Check if a token is registered
	 */
	has(token: Token): boolean {
		return this.providers.has(token);
	}

	/**
	 * Resolve a token to its value
	 */
	resolve<T>(token: Token<T>): T {
		const resolved = this.providers.get(token as Token);

		if (!resolved) {
			throw new Error(`No provider registered for token: ${String(token)}`);
		}

		const { provider } = resolved;

		// Check for circular dependencies - return a lazy proxy instead of throwing
		if (this.resolutionStack.has(token as Token)) {
			return this.createLazyProxy<T>(token as Token, resolved);
		}

		// Singleton: return cached instance if available
		if (provider.scope === "singleton" && resolved.instance !== undefined) {
			return resolved.instance as T;
		}

		// Track resolution for circular dependency detection
		this.resolutionStack.push(token as Token);

		try {
			const instance = this.createInstance(provider);

			// Cache singleton instances
			if (provider.scope === "singleton") {
				resolved.instance = instance;
			}

			return instance as T;
		} finally {
			this.resolutionStack.pop(token as Token);
		}
	}

	/**
	 * Create a lazy proxy for circular dependency resolution.
	 * The proxy will resolve the actual instance on first property access.
	 */
	private createLazyProxy<T>(token: Token, resolved: ResolvedProvider): T {
		// Check if we already have a lazy placeholder for this token
		const existingLazy = this.resolutionStack.getLazy(token);
		if (existingLazy && existingLazy.instance) {
			return existingLazy.instance as T;
		}

		// Create a placeholder that will be resolved later
		const placeholder: { resolved: boolean; instance?: T } = {
			resolved: false,
		};
		this.resolutionStack.markLazy(token, placeholder);

		// Create a proxy that lazily resolves the dependency
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const proxy = new Proxy({} as any, {
			get: (target: T, prop: string | symbol): unknown => {
				// If already resolved, return the cached value
				if (placeholder.resolved && placeholder.instance) {
					const value = (placeholder.instance as Record<string | symbol, unknown>)[prop];
					return typeof value === 'function' ? value.bind(placeholder.instance) : value;
				}

				// Resolve the actual instance
				// At this point, the circular dependency chain has completed
				// and we can safely get the instance from the resolved provider
				if (resolved.instance !== undefined) {
					placeholder.instance = resolved.instance as T;
					placeholder.resolved = true;
				} else {
					// If not yet cached, we need to wait for the resolution to complete
					// This happens when the proxy is accessed during construction
					// Return a function that will resolve later
					if (prop === 'then') {
						// Make the proxy thenable for async contexts
						return undefined;
					}
				}

				// Try to get the value from the resolved instance
				if (placeholder.instance) {
					const value = (placeholder.instance as Record<string | symbol, unknown>)[prop];
					return typeof value === 'function' ? value.bind(placeholder.instance) : value;
				}

				// Return a no-op function for method calls during construction
				return () => undefined;
			},
			
			set: (target: T, prop: string | symbol, value: unknown): boolean => {
				if (placeholder.instance) {
					(placeholder.instance as Record<string | symbol, unknown>)[prop] = value;
					return true;
				}
				return false;
			},
			
			has: (target: T, prop: string | symbol): boolean => {
				if (placeholder.instance) {
					return prop in (placeholder.instance as object);
				}
				return false;
			},
		});

		placeholder.instance = proxy;
		return proxy;
	}

	/**
	 * Create an instance from a provider
	 */
	private createInstance<T>(provider: Provider<T>): T {
		// useValue: return the value directly
		if (provider.useValue !== undefined) {
			return provider.useValue as T;
		}

		// useFactory: call factory with injected dependencies
		if (provider.useFactory) {
			const deps = this.resolveDeps(provider.inject ?? []);
			return provider.useFactory(...deps) as T;
		}

		// useClass: instantiate with injected dependencies
		if (provider.useClass) {
			const deps = this.resolveDeps(provider.inject ?? []);
			// Use new with proper typing for abstract class constructor
			return new (provider.useClass as new (...args: unknown[]) => T)(...deps);
		}

		throw new Error(
			`Invalid provider configuration for token: ${String(provider.token)}`,
		);
	}

	/**
	 * Resolve an array of dependency tokens (including ForwardRef support)
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private resolveDeps(tokens: any[]): unknown[] {
		return tokens.map((tokenOrRef) => {
			// Resolve forward reference if needed
			const token = resolveForwardRef(tokenOrRef);
			return this.resolve(token);
		});
	}

	/**
	 * Clear all registrations
	 */
	clear(): void {
		this.providers.clear();
	}

	/**
	 * Get all registered tokens
	 */
	getTokens(): Token[] {
		return Array.from(this.providers.keys());
	}

	/**
	 * Create a child container (for request-scoped containers)
	 */
	createChild(): Container {
		const child = new Container();
		// Copy singleton providers to child
		for (const [token, resolved] of this.providers) {
			if (resolved.provider.scope === "singleton") {
				child.providers.set(token, resolved);
			}
		}
		return child;
	}
}

// ============= Decorator Helpers =============

// WeakMap for container metadata storage
const containerMetadata = new WeakMap<object, Map<string, unknown>>();

function setContainerMetadata(
	target: object,
	key: string,
	value: unknown,
): void {
	if (!containerMetadata.has(target)) {
		containerMetadata.set(target, new Map());
	}
	containerMetadata.get(target)?.set(key, value);
}

function getContainerMetadata<T>(target: object, key: string): T | undefined {
	return containerMetadata.get(target)?.get(key) as T | undefined;
}

/**
 * Helper to create injectable class decorator
 */
export function Injectable(token?: Token): ClassDecorator {
	return <TFunction extends Function>(target: TFunction): TFunction => {
		setContainerMetadata(target as object, "injectable", true);
		if (token) {
			setContainerMetadata(target as object, "token", token);
		}
		return target;
	};
}

/**
 * Helper to create parameter injection metadata.
 * Supports both Token and ForwardRef<Token> for circular dependency resolution.
 *
 * @param token - The injection token or a forward reference to the token
 * @returns A parameter decorator that registers the injection metadata
 *
 * @example
 * ```typescript
 * // Regular injection
 * constructor(@Inject(MY_TOKEN) private service: MyService) {}
 *
 * // Forward reference for circular dependency
 * constructor(@Inject(forwardRef(() => ServiceB)) private serviceB: ServiceB) {}
 * ```
 */
export function Inject(token: Token | ForwardRef<Token>): ParameterDecorator {
	return (
		target: unknown,
		propertyKey: string | symbol | undefined,
		parameterIndex: number,
	) => {
		const targetObj = target as object;
		const existingTokens: Array<Token | ForwardRef<Token>> =
			getContainerMetadata<Array<Token | ForwardRef<Token>>>(targetObj, "inject:tokens") ?? [];
		existingTokens[parameterIndex] = token;
		setContainerMetadata(targetObj, "inject:tokens", existingTokens);
	};
}

// Export getter for use by modules
export { getContainerMetadata as getInjectTokens };