/**
 * Lazy Loading System
 *
 * Provides on-demand module loading for improved startup time
 * and reduced memory usage for large applications.
 */

import type { Container, Token, Provider } from "../container";
import { Injectable } from "./metadata";
import { Inject } from "./index";

// ============= Types =============

/**
 * Constructor type for module classes
 */
export type Constructor = new (...args: unknown[]) => unknown;

/**
 * Lazy module loader interface
 */
export interface LazyModuleLoader {
	/**
	 * Load the lazy module
	 */
	load(): Promise<void>;

	/**
	 * Check if the module is already loaded
	 */
	isLoaded(): boolean;
}

/**
 * Module loader function type for dynamic imports
 */
export type ModuleLoaderFn = () => Promise<Constructor>;

/**
 * Metadata for lazy modules
 */
export interface LazyModuleMetadata {
	loader: ModuleLoaderFn;
	loaded: boolean;
	loadedModule?: Constructor;
}

// ============= Metadata Storage =============

/**
 * WeakMap storage for lazy module metadata
 */
const lazyModuleMetadata = new WeakMap<Constructor, LazyModuleMetadata>();

/**
 * Set lazy module metadata
 */
function setLazyMetadata(
	target: Constructor,
	metadata: LazyModuleMetadata,
): void {
	lazyModuleMetadata.set(target, metadata);
}

/**
 * Get lazy module metadata
 */
export function getLazyMetadata(
	target: Constructor,
): LazyModuleMetadata | undefined {
	return lazyModuleMetadata.get(target);
}

/**
 * Check if a module is a lazy module
 */
export function isLazyModule(target: Constructor): boolean {
	return lazyModuleMetadata.has(target);
}

// ============= Lazy Module Loader Implementation =============

/**
 * Implementation of LazyModuleLoader
 */
export class LazyModuleLoaderImpl implements LazyModuleLoader {
	private loaded = false;
	private loadingPromise: Promise<void> | null = null;
	private loader: ModuleLoaderFn;
	private onModuleLoaded?: (moduleClass: Constructor) => Promise<void>;

	constructor(
		loader: ModuleLoaderFn,
		onModuleLoaded?: (moduleClass: Constructor) => Promise<void>,
	) {
		this.loader = loader;
		this.onModuleLoaded = onModuleLoaded;
	}

	async load(): Promise<void> {
		// Return existing promise if already loading
		if (this.loadingPromise) {
			return this.loadingPromise;
		}

		// Already loaded
		if (this.loaded) {
			return;
		}

		// Start loading
		this.loadingPromise = this.doLoad();
		await this.loadingPromise;
		this.loadingPromise = null;
	}

	private async doLoad(): Promise<void> {
		try {
			const moduleClass = await this.loader();
			this.loaded = true;

			// Notify callback if provided
			if (this.onModuleLoaded) {
				await this.onModuleLoaded(moduleClass);
			}
		} catch (error) {
			this.loadingPromise = null;
			throw new Error(
				`Failed to load lazy module: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	isLoaded(): boolean {
		return this.loaded;
	}
}

// ============= Lazy Module Decorator =============

/**
 * Decorator to mark a module as lazy-loaded
 *
 * @param loader - Function that returns a Promise resolving to the module class
 *
 * @example
 * ```typescript
 * @LazyModule(() => import('./users.module').then(m => m.UsersModule))
 * export class LazyUsersModule {}
 * ```
 */
export function LazyModule(loader: ModuleLoaderFn): ClassDecorator {
	return <TFunction extends Function>(target: TFunction): TFunction => {
		// Store metadata about the lazy module
		setLazyMetadata(target as unknown as Constructor, {
			loader,
			loaded: false,
		});

		return target;
	};
}

// ============= Module Loader Service =============

/**
 * Token for the ModuleLoader service
 */
export const MODULE_LOADER_TOKEN = Symbol.for("ModuleLoader") as Token<ModuleLoader>;

/**
 * Options for loading lazy modules
 */
export interface LoadModuleOptions {
	/**
	 * Skip lifecycle hooks when loading
	 */
	skipLifecycle?: boolean;
}

/**
 * Module loader service for programmatically loading lazy modules
 *
 * @example
 * ```typescript
 * @Controller('admin')
 * class AdminController {
 *   constructor(private moduleLoader: ModuleLoader) {}
 *
 *   @Post('load-users-module')
 *   async loadUsersModule() {
 *     await this.moduleLoader.load(LazyUsersModule);
 *     return { message: 'Users module loaded' };
 *   }
 * }
 * ```
 */
@Injectable()
export class ModuleLoader {
	private container: Container;
	private loadedModules = new Set<Constructor>();
	private moduleLoaders = new Map<Constructor, LazyModuleLoaderImpl>();
	private onModuleLoadCallback?: (
		moduleClass: Constructor,
	) => Promise<void>;

	constructor(container: Container) {
		this.container = container;
	}

	/**
	 * Set callback to be called when a module is loaded
	 * Used by Application to register controllers and providers
	 */
	setOnModuleLoadCallback(
		callback: (moduleClass: Constructor) => Promise<void>,
	): void {
		this.onModuleLoadCallback = callback;
	}

	/**
	 * Load a lazy module by its token/class
	 *
	 * @param moduleToken - The module class or token to load
	 * @param options - Options for loading
	 */
	async load(
		moduleToken: Token | Constructor,
		options: LoadModuleOptions = {},
	): Promise<void> {
		// Normalize to Constructor if it's a token
		const moduleClass =
			typeof moduleToken === "function"
				? (moduleToken as Constructor)
				: null;

		if (!moduleClass) {
			throw new Error("Module token must be a class constructor");
		}

		// Check if already loaded
		if (this.isLoaded(moduleClass)) {
			return;
		}

		// Check if it's a lazy module
		const metadata = getLazyMetadata(moduleClass);
		if (!metadata) {
			throw new Error(
				`Module ${moduleClass.name} is not a lazy module. Use @LazyModule decorator.`,
			);
		}

		// Get or create loader
		let loader = this.moduleLoaders.get(moduleClass);
		if (!loader) {
			loader = new LazyModuleLoaderImpl(
				metadata.loader,
				async (loadedModule) => {
					// Update metadata
					metadata.loaded = true;
					metadata.loadedModule = loadedModule;

					// Call the callback if set
					if (this.onModuleLoadCallback && !options.skipLifecycle) {
						await this.onModuleLoadCallback(loadedModule);
					}
				},
			);
			this.moduleLoaders.set(moduleClass, loader);
		}

		await loader.load();
		this.loadedModules.add(moduleClass);
	}

	/**
	 * Check if a module is loaded
	 *
	 * @param moduleToken - The module class or token to check
	 */
	isLoaded(moduleToken: Token | Constructor): boolean {
		if (typeof moduleToken === "function") {
			const metadata = getLazyMetadata(moduleToken as Constructor);
			if (metadata) {
				return metadata.loaded;
			}
			return this.loadedModules.has(moduleToken as unknown as Constructor);
		}
		return this.loadedModules.has(moduleToken as unknown as Constructor);
	}

	/**
	 * Get all loaded module classes
	 */
	getLoadedModules(): Constructor[] {
		return Array.from(this.loadedModules);
	}

	/**
	 * Preload multiple lazy modules
	 *
	 * @param moduleTokens - Array of module tokens to preload
	 */
	async preload(moduleTokens: Array<Token | Constructor>): Promise<void> {
		await Promise.all(moduleTokens.map((token) => this.load(token)));
	}
}

// ============= Lazy Module Registry =============

/**
 * Registry for tracking lazy modules across the application
 */
export class LazyModuleRegistry {
	private static instance: LazyModuleRegistry;
	private lazyModules = new Map<Token, LazyModuleMetadata>();

	private constructor() {}

	static getInstance(): LazyModuleRegistry {
		if (!LazyModuleRegistry.instance) {
			LazyModuleRegistry.instance = new LazyModuleRegistry();
		}
		return LazyModuleRegistry.instance;
	}

	/**
	 * Register a lazy module
	 */
	register(token: Token, metadata: LazyModuleMetadata): void {
		this.lazyModules.set(token, metadata);
	}

	/**
	 * Get lazy module metadata
	 */
	get(token: Token): LazyModuleMetadata | undefined {
		return this.lazyModules.get(token);
	}

	/**
	 * Check if a token is a registered lazy module
	 */
	has(token: Token): boolean {
		return this.lazyModules.has(token);
	}

	/**
	 * Get all registered lazy module tokens
	 */
	getAllTokens(): Token[] {
		return Array.from(this.lazyModules.keys());
	}

	/**
	 * Clear the registry
	 */
	clear(): void {
		this.lazyModules.clear();
	}
}

// ============= Helper Functions =============

/**
 * Create a lazy module loader for dynamic imports
 *
 * @param importFn - Dynamic import function
 * @param exportName - Name of the exported module class (default: 'default')
 *
 * @example
 * ```typescript
 * const loadUsersModule = createLazyLoader(
 *   () => import('./users.module'),
 *   'UsersModule'
 * );
 * ```
 */
export function createLazyLoader(
	importFn: () => Promise<Record<string, unknown>>,
	exportName = "default",
): ModuleLoaderFn {
	return async () => {
		const module = await importFn();
		const moduleClass = module[exportName] as Constructor;
		if (!moduleClass) {
			throw new Error(
				`Export "${exportName}" not found in lazy loaded module`,
			);
		}
		return moduleClass;
	};
}

/**
 * Check if all lazy modules in a list are loaded
 */
export function areAllLazyModulesLoaded(
	modules: Constructor[],
): boolean {
	return modules.every((module) => {
		const metadata = getLazyMetadata(module);
		return !metadata || metadata.loaded;
	});
}

/**
 * Get list of unloaded lazy modules
 */
export function getUnloadedLazyModules(
	modules: Constructor[],
): Constructor[] {
	return modules.filter((module) => {
		const metadata = getLazyMetadata(module);
		return metadata && !metadata.loaded;
	});
}