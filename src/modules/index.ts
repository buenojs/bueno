/**
 * Module System
 *
 * NestJS-inspired module system with dependency injection,
 * controllers, and provider management.
 */

import {
	Container,
	type Provider,
	type Token,
	type ForwardRef,
	forwardRef,
	isForwardRef,
	resolveForwardRef,
	getInjectTokens,
} from "../container";
import {
	type LazyModuleLoader,
	type Constructor as LazyConstructor,
	type ModuleLoaderFn,
	type LazyModuleMetadata,
	LazyModuleLoaderImpl,
	LazyModule,
	ModuleLoader,
	MODULE_LOADER_TOKEN,
	getLazyMetadata,
	isLazyModule,
	LazyModuleRegistry,
} from "./lazy";
import type { Context } from "../context";
import { Router } from "../router";
import type { RouteHandler } from "../types";
import {
	LifecycleHookManager,
	ShutdownSignalHandler,
	type OnModuleInit,
	type OnApplicationBootstrap,
	type OnModuleDestroy,
	type BeforeApplicationShutdown,
	type OnApplicationShutdown,
	type OnBeforeRequest,
	type OnAfterRequest,
	type OnRequestError,
	type ApplicationLifecycle,
	type RequestLifecycle,
	type FullLifecycle,
	isOnModuleInit,
	isOnApplicationBootstrap,
	isOnModuleDestroy,
	isBeforeApplicationShutdown,
	isOnApplicationShutdown,
	isOnBeforeRequest,
	isOnAfterRequest,
	isOnRequestError,
} from "./lifecycle";
import {
	type Guard,
	type CanActivate,
	type GuardFn,
	getClassGuards,
	getMethodGuards,
	executeGuards,
	createForbiddenResponse,
} from "./guards";
import {
	type Interceptor,
	type NestInterceptor,
	type InterceptorFn,
	type CallHandler,
	getClassInterceptors,
	getMethodInterceptors,
	executeInterceptors,
	isNestInterceptor,
	isInterceptorFn,
} from "./interceptors";
import {
	type Pipe,
	type PipeTransform,
	type PipeFn,
	type PipeContext,
	type ParameterPipeMetadata,
	getMethodPipes,
	executePipes,
	extractParameterValue,
	createBadRequestResponse,
} from "./pipes";
import {
	type Filter,
	type ExceptionFilter,
	type FilterFn,
	type ExecuteFiltersOptions,
	UseFilters,
	Catch,
	getClassFilters,
	getMethodFilters,
	getCatchType,
	canHandleException,
	isExceptionFilter,
	isFilterFn,
	executeFilter,
	findAndExecuteFilter,
	HttpExceptionFilter,
	ValidationFilter,
	NotFoundFilter,
	AllExceptionsFilter,
	createDefaultErrorResponse,
	createInternalErrorResponse,
} from "./filters";

// ============= Types =============

// Type alias for class constructors - re-exported from metadata.ts
export type Constructor = new (...args: unknown[]) => unknown;

/**
 * @deprecated Use individual lifecycle hook interfaces instead.
 * Kept for backward compatibility.
 */
export interface LifecycleHooks {
	onModuleInit?(): void | Promise<void>;
	onModuleDestroy?(): void | Promise<void>;
	onApplicationBootstrap?(): void | Promise<void>;
	onApplicationShutdown?(): void | Promise<void>;
}

// ============= Metadata Storage =============
// Import metadata storage and decorators from isolated module to avoid circular dependencies
import {
	setMetadata,
	getMetadata,
	setPrototypeMetadata,
	getPrototypeMetadata,
	Injectable,
	Controller,
	Module,
	type ModuleMetadata,
} from "./metadata";

// Re-export decorators and types for external use
export { Injectable, Controller, Module, type ModuleMetadata };

/**
 * Inject a dependency by token.
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
		const targetObj = target as Constructor;
		const existingTokens: Array<Token | ForwardRef<Token>> =
			getMetadata(targetObj, "inject:tokens") ?? [];
		existingTokens[parameterIndex] = token;
		setMetadata(targetObj, "inject:tokens", existingTokens);
	};
}

// ============= HTTP Method Decorators =============

function createMethodDecorator(
	method: string,
): (path?: string) => MethodDecorator {
	return (path = "") => {
		return (
			target: unknown,
			propertyKey: string | symbol,
			descriptor: PropertyDescriptor,
		) => {
			const targetObj = target as object;
			const routes =
				getPrototypeMetadata<
					Array<{ method: string; path: string; handler: string | symbol }>
				>(targetObj, "routes") ?? [];
			routes.push({
				method,
				path,
				handler: propertyKey,
			});
			setPrototypeMetadata(targetObj, "routes", routes);
			return descriptor;
		};
	};
}

export const Get = createMethodDecorator("GET");
export const Post = createMethodDecorator("POST");
export const Put = createMethodDecorator("PUT");
export const Patch = createMethodDecorator("PATCH");
export const Delete = createMethodDecorator("DELETE");
export const Head = createMethodDecorator("HEAD");
export const Options = createMethodDecorator("OPTIONS");

// ============= AppModule Class =============

export class AppModule {
	private moduleClass: Constructor;
	private metadata: ModuleMetadata;
	private providers: Provider[] = [];
	private controllers: Constructor[] = [];
	private visitedModules = new Set<Constructor>();
	private lazyModules: Constructor[] = [];

	constructor(moduleClass: Constructor) {
		this.moduleClass = moduleClass;
		this.metadata = getMetadata<ModuleMetadata>(moduleClass, "module") ?? {};
		this.processModule(moduleClass);
	}

	/**
	 * Process module and its imports recursively
	 * Skips lazy modules during initial processing
	 */
	private processModule(moduleClass: Constructor): void {
		if (this.visitedModules.has(moduleClass)) {
			return;
		}
		this.visitedModules.add(moduleClass);

		// Skip processing lazy modules at startup
		if (isLazyModule(moduleClass)) {
			this.lazyModules.push(moduleClass);
			return;
		}

		const metadata = getMetadata<ModuleMetadata>(moduleClass, "module") ?? {};

		// Process imports first (so dependencies are available)
		if (metadata.imports) {
			for (const importedModule of metadata.imports) {
				this.processModule(importedModule);
			}
		}

		// Add providers
		if (metadata.providers) {
			this.providers.push(...metadata.providers);
		}

		// Add controllers
		if (metadata.controllers) {
			this.controllers.push(...metadata.controllers);
		}
	}

	/**
	 * Get all collected providers
	 */
	getProviders(): Provider[] {
		return [...this.providers];
	}

	/**
	 * Get all collected controllers
	 */
	getControllers(): Constructor[] {
		return [...this.controllers];
	}

	/**
	 * Get all lazy modules that were skipped during initial processing
	 */
	getLazyModules(): Constructor[] {
		return [...this.lazyModules];
	}
}

// ============= Route Metadata for Guards and Pipes =============

/**
 * Metadata stored for each route to support guards
 */
interface RouteGuardMetadata {
	controllerClass: Constructor;
	handlerName: string | symbol;
	classGuards: Guard[];
	methodGuards: Guard[];
}

/**
 * Metadata stored for each route to support pipes
 */
interface RoutePipeMetadata {
	controllerClass: Constructor;
	handlerName: string | symbol;
	parameterPipes: ParameterPipeMetadata[];
}

/**
 * Metadata stored for each route to support filters
 */
interface RouteFilterMetadata {
	controllerClass: Constructor;
	handlerName: string | symbol;
	classFilters: Filter[];
	methodFilters: Filter[];
}

/**
 * Metadata stored for each route to support interceptors
 */
interface RouteInterceptorMetadata {
	controllerClass: Constructor;
	handlerName: string | symbol;
	classInterceptors: Interceptor[];
	methodInterceptors: Interceptor[];
}

// ============= Application Class =============

export class Application {
	container: Container;
	router: Router;
	private appModule: AppModule;
	private lifecycleManager: LifecycleHookManager;
	private shutdownHandler: ShutdownSignalHandler;
	private server: ReturnType<typeof Bun.serve> | null = null;
	private providerInstances: Map<Token, unknown> = new Map();
	private controllerInstances: unknown[] = [];
	private isInitialized = false;
	private isShuttingDown = false;
	private globalGuards: Guard[] = [];
	private globalPipes: Pipe[] = [];
	private globalFilters: Filter[] = [];
	private globalInterceptors: Interceptor[] = [];
	private routeGuardMetadata: Map<string, RouteGuardMetadata> = new Map();
	private routePipeMetadata: Map<string, RoutePipeMetadata> = new Map();
	private routeFilterMetadata: Map<string, RouteFilterMetadata> = new Map();
	private routeInterceptorMetadata: Map<string, RouteInterceptorMetadata> = new Map();
	private moduleLoader: ModuleLoader;
	private loadedLazyModules = new Set<Constructor>();

	constructor(moduleClass: Constructor) {
		this.container = new Container();
		this.router = new Router();
		this.appModule = new AppModule(moduleClass);
		this.lifecycleManager = new LifecycleHookManager();
		this.shutdownHandler = new ShutdownSignalHandler();
		this.moduleLoader = new ModuleLoader(this.container);
	}

	/**
	 * Add global guards that apply to all routes
	 * Global guards run before controller and method guards
	 *
	 * @param guards - Guards to add
	 * @returns this (for chaining)
	 *
	 * @example
	 * ```typescript
	 * const app = createApp(AppModule);
	 * app.useGlobalGuards(AuthGuard);
	 * await app.listen(3000);
	 * ```
	 */
	useGlobalGuards(...guards: Guard[]): this {
		this.globalGuards.push(...guards);
		return this;
	}

	/**
	 * Add global pipes that apply to all parameters
	 * Global pipes run before parameter decorator pipes
	 *
	 * @param pipes - Pipes to add
	 * @returns this (for chaining)
	 *
	 * @example
	 * ```typescript
	 * const app = createApp(AppModule);
	 * app.useGlobalPipes(new ValidationPipe());
	 * await app.listen(3000);
	 * ```
	 */
	useGlobalPipes(...pipes: Pipe[]): this {
		this.globalPipes.push(...pipes);
		return this;
	}

	/**
	 * Add global filters that apply to all routes
	 * Global filters run after controller and method filters
	 *
	 * @param filters - Filters to add
	 * @returns this (for chaining)
	 *
	 * @example
	 * ```typescript
	 * const app = createApp(AppModule);
	 * app.useGlobalFilters(new AllExceptionsFilter());
	 * await app.listen(3000);
	 * ```
	 */
	useGlobalFilters(...filters: Filter[]): this {
		this.globalFilters.push(...filters);
		return this;
	}

	/**
	 * Add global interceptors that apply to all routes
	 * Global interceptors run before controller and method interceptors
	 *
	 * @param interceptors - Interceptors to add
	 * @returns this (for chaining)
	 *
	 * @example
	 * ```typescript
	 * const app = createApp(AppModule);
	 * app.useGlobalInterceptors(new LoggingInterceptor());
	 * await app.listen(3000);
	 * ```
	 */
	useGlobalInterceptors(...interceptors: Interceptor[]): this {
		this.globalInterceptors.push(...interceptors);
		return this;
	}

	/**
	 * Register all providers in the container
	 */
	private registerProviders(): void {
		const providers = this.appModule.getProviders();
		this.container.registerAll(providers);
	}

	/**
	 * Resolve all providers and register them with lifecycle manager
	 */
	private async resolveProviders(): Promise<void> {
		const providers = this.appModule.getProviders();

		for (const provider of providers) {
			const token = provider.token;
			const instance = this.container.resolve(token as import("../container").Token);
			this.providerInstances.set(token as import("../container").Token, instance);
			this.lifecycleManager.registerInstance(instance);
		}
	}

	/**
	 * Register all controllers and their routes
	 */
	private registerControllers(): void {
		const controllers = this.appModule.getControllers();

		for (const controllerClass of controllers) {
			const instance = this.registerController(controllerClass);
			this.controllerInstances.push(instance);
			this.lifecycleManager.registerInstance(instance);
		}
	}

	/**
	 * Register a single controller and its routes
	 */
	private registerController(controllerClass: Constructor): unknown {
		const basePath = getMetadata<string>(controllerClass, "path") ?? "";
		const routes =
			getPrototypeMetadata<
				Array<{ method: string; path: string; handler: string | symbol }>
			>(controllerClass.prototype, "routes") ?? [];

		// Create controller instance
		const injectTokens =
			getInjectTokens<Array<Token | ForwardRef<Token>>>(controllerClass, "inject:tokens") ?? [];
		const deps = injectTokens.map((tokenOrRef) => {
			// Resolve forward reference if needed
			const token = isForwardRef(tokenOrRef) ? resolveForwardRef(tokenOrRef) : tokenOrRef;
			return this.container.resolve(token);
		});
		const instance = new controllerClass(...deps);

		// Get class-level guards
		const classGuards = getClassGuards(controllerClass) ?? [];

		// Get class-level interceptors
		const classInterceptors = getClassInterceptors(controllerClass) ?? [];

		// Register routes
		for (const route of routes) {
			const fullPath = basePath + route.path;
			const handler = (instance as Record<string | symbol, RouteHandler>)[
				route.handler
			];

			if (typeof handler === "function") {
				const method = route.method.toLowerCase();
				const routerMethod = method as
					| "get"
					| "post"
					| "put"
					| "patch"
					| "delete"
					| "head"
					| "options";

				// Get method-level guards
				const methodGuards = getMethodGuards(controllerClass.prototype, route.handler) ?? [];

				// Get method-level pipes
				const parameterPipes = getMethodPipes(controllerClass.prototype, route.handler) ?? [];

				// Get class-level filters
				const classFilters = getClassFilters(controllerClass) ?? [];

				// Get method-level filters
				const methodFilters = getMethodFilters(controllerClass.prototype, route.handler) ?? [];

				// Get method-level interceptors
				const methodInterceptors = getMethodInterceptors(controllerClass.prototype, route.handler) ?? [];

				// Store guard metadata for this route
				const routeKey = `${method.toUpperCase()}:${fullPath}`;
				this.routeGuardMetadata.set(routeKey, {
					controllerClass,
					handlerName: route.handler,
					classGuards,
					methodGuards,
				});

				// Store pipe metadata for this route
				if (parameterPipes.length > 0) {
					this.routePipeMetadata.set(routeKey, {
						controllerClass,
						handlerName: route.handler,
						parameterPipes,
					});
				}

				// Store filter metadata for this route
				if (classFilters.length > 0 || methodFilters.length > 0) {
					this.routeFilterMetadata.set(routeKey, {
						controllerClass,
						handlerName: route.handler,
						classFilters,
						methodFilters,
					});
				}

				// Store interceptor metadata for this route
				if (classInterceptors.length > 0 || methodInterceptors.length > 0) {
					this.routeInterceptorMetadata.set(routeKey, {
						controllerClass,
						handlerName: route.handler,
						classInterceptors,
						methodInterceptors,
					});
				}

				if (
					routerMethod in this.router &&
					typeof (this.router as unknown as Record<string, unknown>)[
						routerMethod
					] === "function"
				) {
					(
						this.router as unknown as Record<
							string,
							(p: string, h: RouteHandler) => void
						>
					)[routerMethod](fullPath, ((context: Context): unknown =>
						handler.call(instance, context)) as RouteHandler);
				}
			}
		}

		return instance;
	}

	/**
	 * Initialize the application
	 *
	 * Execution order:
	 * 1. Module Registration
	 * 2. Provider Resolution
	 * 3. onModuleInit() for each provider
	 * 4. Controller Registration
	 * 5. onApplicationBootstrap() for each provider
	 */
	async init(): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		// 1. Register providers in container
		this.registerProviders();

		// Register the ModuleLoader service
		this.container.register({
			token: MODULE_LOADER_TOKEN,
			useValue: this.moduleLoader,
		});

		// 2. Resolve providers and register with lifecycle manager
		await this.resolveProviders();

		// 3. Execute onModuleInit hooks
		await this.lifecycleManager.executeOnModuleInit();

		// 4. Register controllers
		this.registerControllers();

		// 5. Execute onApplicationBootstrap hooks
		await this.lifecycleManager.executeOnApplicationBootstrap();

		// Setup callback for lazy module loading
		this.moduleLoader.setOnModuleLoadCallback(
			async (moduleClass: Constructor) => {
				await this.loadLazyModule(moduleClass);
			},
		);

		this.isInitialized = true;
	}

	/**
	 * Load a lazy module dynamically
	 * This is called by the ModuleLoader service when a lazy module is loaded
	 */
	private async loadLazyModule(moduleClass: Constructor): Promise<void> {
		if (this.loadedLazyModules.has(moduleClass)) {
			return;
		}

		const metadata = getMetadata<ModuleMetadata>(moduleClass, "module") ?? {};

		// Register and resolve providers
		if (metadata.providers) {
			for (const provider of metadata.providers) {
				this.container.register(provider);
				const instance = this.container.resolve(provider.token as import("../container").Token);
				this.providerInstances.set(provider.token as import("../container").Token, instance);
				this.lifecycleManager.registerInstance(instance);
			}

			// Execute onModuleInit for new providers
			await this.lifecycleManager.executeOnModuleInit();
		}

		// Register controllers
		if (metadata.controllers) {
			for (const controllerClass of metadata.controllers) {
				const instance = this.registerController(controllerClass);
				this.controllerInstances.push(instance);
				this.lifecycleManager.registerInstance(instance);
			}
		}

		// Execute onApplicationBootstrap for new instances
		await this.lifecycleManager.executeOnApplicationBootstrap();

		this.loadedLazyModules.add(moduleClass);
	}

	/**
	 * Get the ModuleLoader service for loading lazy modules
	 */
	getModuleLoader(): ModuleLoader {
		return this.moduleLoader;
	}

	/**
	 * Setup graceful shutdown handlers
	 */
	private setupShutdownHandlers(): void {
		this.shutdownHandler.onSignal(async (signal) => {
			await this.shutdown(signal);
		});
		this.shutdownHandler.startListening();
	}

	/**
	 * Perform graceful shutdown
	 * 
	 * Execution order:
	 * 1. Stop accepting new requests
	 * 2. beforeApplicationShutdown(signal)
	 * 3. Drain existing requests
	 * 4. onModuleDestroy() for each provider
	 * 5. onApplicationShutdown(signal)
	 */
	async shutdown(signal?: string): Promise<void> {
		if (this.isShuttingDown) {
			return;
		}
		this.isShuttingDown = true;

		console.log("Starting graceful shutdown...");

		// 1. Stop accepting new requests
		if (this.server) {
			this.server.stop();
			console.log("Server stopped accepting new connections");
		}

		// 2. Execute beforeApplicationShutdown hooks
		await this.lifecycleManager.executeBeforeApplicationShutdown(signal);

		// 3. Wait for existing requests to drain (with timeout)
		// In a real implementation, you would track active requests
		// For now, we just add a small delay
		await new Promise((resolve) => setTimeout(resolve, 100));

		// 4. Execute onModuleDestroy hooks
		await this.lifecycleManager.executeOnModuleDestroy();

		// 5. Execute onApplicationShutdown hooks
		await this.lifecycleManager.executeOnApplicationShutdown(signal);

		console.log("Graceful shutdown complete");
	}

	/**
	 * Start the HTTP server
	 */
	async listen(port = 3000, hostname = "localhost"): Promise<void> {
		// Initialize if not already done
		await this.init();

		// Setup shutdown handlers
		this.setupShutdownHandlers();

		const { Context } = await import("../context");
		const { compose } = await import("../middleware");

		this.server = Bun.serve({
			port,
			hostname,
			fetch: async (request: Request) => {
				// Reject new requests during shutdown
				if (this.isShuttingDown) {
					return new Response("Service Unavailable", { status: 503 });
				}

				const url = new URL(request.url);
				const match = this.router.match(request.method as "GET", url.pathname);

				if (!match) {
					return new Response("Not Found", { status: 404 });
				}

				// Create context
				const context = new Context(request, match.params);

				// Execute onBeforeRequest hooks
				try {
					await this.lifecycleManager.executeOnBeforeRequest(context);
				} catch (error) {
					console.error("Error in onBeforeRequest hook:", error);
				}

				// Execute guards (before interceptors and pipes)
				const routeKey = `${request.method}:${url.pathname}`;
				const guardMetadata = this.routeGuardMetadata.get(routeKey);
				
				if (guardMetadata || this.globalGuards.length > 0) {
					const guardsPassed = await executeGuards(context, {
						globalGuards: this.globalGuards,
						classGuards: guardMetadata?.classGuards ?? [],
						methodGuards: guardMetadata?.methodGuards ?? [],
						resolveGuard: (guard: Guard) => {
							// Try to resolve from container if it's a token
							if (typeof guard === "object" && guard !== null && !("canActivate" in guard)) {
								try {
									return this.container.resolve(guard as Token) as CanActivate;
								} catch {
									return null;
								}
							}
							return null;
						},
					});

					if (!guardsPassed) {
						return createForbiddenResponse();
					}
				}
	
					// Get interceptor metadata
					const interceptorMetadata = this.routeInterceptorMetadata.get(routeKey);
	
					// Create the handler function that executes pipes and middleware
					const executeHandler = async (): Promise<Response> => {
						// Execute pipes (after guards, before handler)
						const pipeMetadata = this.routePipeMetadata.get(routeKey);
						if (pipeMetadata || this.globalPipes.length > 0) {
							try {
								// Process each parameter with pipes
								const params = pipeMetadata?.parameterPipes ?? [];
								for (const paramMeta of params) {
									// Extract the initial value for this parameter
									const initialValue = await extractParameterValue(context, paramMeta);
									
									// Create pipe context
									const pipeContext: PipeContext = {
										context,
										metadata: {
											index: paramMeta.index,
											name: paramMeta.key,
											decorator: paramMeta.decorator,
										},
									};
									
									// Execute pipes for this parameter
									const transformedValue = await executePipes(initialValue, pipeContext, {
										globalPipes: this.globalPipes,
										parameterPipes: paramMeta.pipes,
										resolvePipe: (pipe: Pipe) => {
											// Try to resolve from container if it's a token
											if (typeof pipe === "object" && pipe !== null && !("transform" in pipe)) {
												try {
													return this.container.resolve(pipe as Token) as PipeTransform;
												} catch {
													return null;
												}
											}
											return null;
										},
									});
									
									// Store the transformed value in context for handler access
									context.set(`pipe:param:${paramMeta.index}`, transformedValue);
								}
							} catch (error) {
								// Pipe transformation failed - return 400 Bad Request
								if (error instanceof Error) {
									return createBadRequestResponse(error);
								}
								return createBadRequestResponse(new Error("Pipe transformation failed"));
							}
						}
	
						// Execute middleware and handler
						const pipeline = compose((match.middleware ?? []) as import("../middleware").Middleware[]);
						return pipeline(context, match.handler as import("../middleware").Handler);
					};
	
					// Execute interceptors wrapping around the handler
					// Interceptors run after guards, before pipes
					try {
						const response = await executeInterceptors(context, executeHandler, {
							globalInterceptors: this.globalInterceptors,
							classInterceptors: interceptorMetadata?.classInterceptors ?? [],
							methodInterceptors: interceptorMetadata?.methodInterceptors ?? [],
							resolveInterceptor: (interceptor: Interceptor): NestInterceptor | InterceptorFn | null => {
								// Try to resolve from container if it's a token
								if (typeof interceptor === "object" && interceptor !== null && !isNestInterceptor(interceptor) && !isInterceptorFn(interceptor)) {
									try {
										return this.container.resolve(interceptor as Token) as NestInterceptor;
									} catch {
										return null;
									}
								}
								// Try to instantiate if it's a class constructor
								if (typeof interceptor === "function" && !isInterceptorFn(interceptor)) {
									try {
										const Constructor = interceptor as new () => NestInterceptor;
										const instance = new Constructor();
										if (isNestInterceptor(instance)) {
											return instance;
										}
									} catch {
										// Cannot instantiate
									}
								}
								return null;
							},
						});
	
						// Execute onAfterRequest hooks
						try {
							await this.lifecycleManager.executeOnAfterRequest(context, response as Response);
						} catch (error) {
							console.error("Error in onAfterRequest hook:", error);
						}
	
						return response as Response;
					} catch (error) {
						// Execute onRequestError hooks
						try {
							await this.lifecycleManager.executeOnRequestError(
								context,
								error as Error,
							);
						} catch (hookError) {
							console.error("Error in onRequestError hook:", hookError);
						}
	
						// Handle exception with filters
						return this.handleException(error as Error, context, routeKey);
					}
			},
		});

		console.log(`Server running at http://${hostname}:${port}`);
	}

	/**
	 * Handle request directly (for testing)
	 */
	async handle(request: Request): Promise<Response> {
		const { Context } = await import("../context");
		const { compose } = await import("../middleware");

		const url = new URL(request.url);
		const match = this.router.match(request.method as "GET", url.pathname);

		if (!match) {
			return new Response("Not Found", { status: 404 });
		}

		const context = new Context(request, match.params);

		// Execute guards (before interceptors and pipes)
		const routeKey = `${request.method}:${url.pathname}`;
		const guardMetadata = this.routeGuardMetadata.get(routeKey);
		
		if (guardMetadata || this.globalGuards.length > 0) {
			const guardsPassed = await executeGuards(context, {
				globalGuards: this.globalGuards,
				classGuards: guardMetadata?.classGuards ?? [],
				methodGuards: guardMetadata?.methodGuards ?? [],
				resolveGuard: (guard: Guard) => {
					// Try to resolve from container if it's a token
					if (typeof guard === "object" && guard !== null && !("canActivate" in guard)) {
						try {
							return this.container.resolve(guard as Token) as CanActivate;
						} catch {
							return null;
						}
					}
					return null;
				},
			});

			if (!guardsPassed) {
				return createForbiddenResponse();
			}
		}
	
			// Get interceptor metadata
			const interceptorMetadata = this.routeInterceptorMetadata.get(routeKey);
	
			// Create the handler function that executes pipes and middleware
			const executeHandler = async (): Promise<Response> => {
				// Execute pipes (after guards, before handler)
				const pipeMetadata = this.routePipeMetadata.get(routeKey);
				if (pipeMetadata || this.globalPipes.length > 0) {
					try {
						// Process each parameter with pipes
						const params = pipeMetadata?.parameterPipes ?? [];
						for (const paramMeta of params) {
							// Extract the initial value for this parameter
							const initialValue = await extractParameterValue(context, paramMeta);
							
							// Create pipe context
							const pipeContext: PipeContext = {
								context,
								metadata: {
									index: paramMeta.index,
									name: paramMeta.key,
									decorator: paramMeta.decorator,
								},
							};
							
							// Execute pipes for this parameter
							const transformedValue = await executePipes(initialValue, pipeContext, {
								globalPipes: this.globalPipes,
								parameterPipes: paramMeta.pipes,
								resolvePipe: (pipe: Pipe) => {
									// Try to resolve from container if it's a token
									if (typeof pipe === "object" && pipe !== null && !("transform" in pipe)) {
										try {
											return this.container.resolve(pipe as Token) as PipeTransform;
										} catch {
											return null;
										}
									}
									return null;
								},
							});
							
							// Store the transformed value in context for handler access
							context.set(`pipe:param:${paramMeta.index}`, transformedValue);
						}
					} catch (error) {
						// Pipe transformation failed - return 400 Bad Request
						if (error instanceof Error) {
							return createBadRequestResponse(error);
						}
						return createBadRequestResponse(new Error("Pipe transformation failed"));
					}
				}
	
				// Execute middleware and handler
				const pipeline = compose((match.middleware ?? []) as import("../middleware").Middleware[]);
				return pipeline(context, match.handler as import("../middleware").Handler);
			};
	
			// Execute interceptors wrapping around the handler
			// Interceptors run after guards, before pipes
			try {
				const response = await executeInterceptors(context, executeHandler, {
					globalInterceptors: this.globalInterceptors,
					classInterceptors: interceptorMetadata?.classInterceptors ?? [],
					methodInterceptors: interceptorMetadata?.methodInterceptors ?? [],
					resolveInterceptor: (interceptor: Interceptor): NestInterceptor | InterceptorFn | null => {
						// Try to resolve from container if it's a token
						if (typeof interceptor === "object" && interceptor !== null && !isNestInterceptor(interceptor) && !isInterceptorFn(interceptor)) {
							try {
								return this.container.resolve(interceptor as Token) as NestInterceptor;
							} catch {
								return null;
							}
						}
						// Try to instantiate if it's a class constructor
						if (typeof interceptor === "function" && !isInterceptorFn(interceptor)) {
							try {
								const Constructor = interceptor as new () => NestInterceptor;
								const instance = new Constructor();
								if (isNestInterceptor(instance)) {
									return instance;
								}
							} catch {
								// Cannot instantiate
							}
						}
						return null;
					},
				});
	
				return response as Response;
				} catch (error) {
					// Handle exception with filters
					return this.handleException(error as Error, context, routeKey);
				}
		}
	
		/**
			* Get the lifecycle manager for this application
			*/
	getLifecycleManager(): LifecycleHookManager {
		return this.lifecycleManager;
	}

	/**
		* Check if the application is shutting down
		*/
	isShuttingDownNow(): boolean {
		return this.isShuttingDown;
	}

	/**
		* Handle an exception using the filters system
		* Filters are checked in order: method → class → global
		*/
	private async handleException(
		exception: Error,
		context: Context,
		routeKey: string,
	): Promise<Response> {
		const filterMetadata = this.routeFilterMetadata.get(routeKey);

		return findAndExecuteFilter(exception, context, {
			globalFilters: this.globalFilters,
			classFilters: filterMetadata?.classFilters ?? [],
			methodFilters: filterMetadata?.methodFilters ?? [],
			resolveFilter: (filter: Filter): ExceptionFilter | null => {
				// Try to resolve from container if it's a token
				if (typeof filter === "object" && filter !== null && !isExceptionFilter(filter)) {
					try {
						return this.container.resolve(filter as Token) as ExceptionFilter;
					} catch {
						return null;
					}
				}
				// Try to instantiate if it's a class constructor
				if (typeof filter === "function" && !isFilterFn(filter)) {
					try {
						const Constructor = filter as new () => ExceptionFilter;
						const instance = new Constructor();
						if (isExceptionFilter(instance)) {
							return instance;
						}
					} catch {
						// Cannot instantiate
					}
				}
				return null;
			},
		});
	}
}

/**
 * Create an application from a module
 */
export function createApp(moduleClass: Constructor): Application {
	return new Application(moduleClass);
}

// Re-export lifecycle types and utilities
export {
	LifecycleHookManager,
	ShutdownSignalHandler,
	OnModuleInit,
	OnApplicationBootstrap,
	OnModuleDestroy,
	BeforeApplicationShutdown,
	OnApplicationShutdown,
	OnBeforeRequest,
	OnAfterRequest,
	OnRequestError,
	ApplicationLifecycle,
	RequestLifecycle,
	FullLifecycle,
	isOnModuleInit,
	isOnApplicationBootstrap,
	isOnModuleDestroy,
	isBeforeApplicationShutdown,
	isOnApplicationShutdown,
	isOnBeforeRequest,
	isOnAfterRequest,
	isOnRequestError,
};

// Re-export guards types and utilities
export {
	type CanActivate,
	type GuardFn,
	type Guard,
	type User,
	UseGuards,
	AuthGuard,
	RolesGuard,
	Roles,
	getClassGuards,
	getMethodGuards,
	getMethodRoles,
	executeGuards,
	createForbiddenResponse,
} from "./guards";

// Re-export pipes types and utilities
export {
	type PipeTransform,
	type PipeFn,
	type Pipe,
	type PipeContext,
	type ParameterMetadata,
	type ParameterPipeMetadata,
	UsePipes,
	Body,
	Query,
	Param,
	ValidationPipe,
	ParseIntPipe,
	ParseFloatPipe,
	ParseBoolPipe,
	DefaultValuePipe,
	TrimPipe,
	ParseJsonPipe,
	ParseArrayPipe,
	getMethodPipes,
	executePipes,
	extractParameterValue,
	createBadRequestResponse,
	isPipeTransform,
	isPipeFn,
} from "./pipes";

// Re-export filters types and utilities
export {
	type ExceptionFilter,
	type FilterFn,
	type Filter,
	type ExecuteFiltersOptions,
	UseFilters,
	Catch,
	getClassFilters,
	getMethodFilters,
	getCatchType,
	canHandleException,
	isExceptionFilter,
	isFilterFn,
	executeFilter,
	findAndExecuteFilter,
	HttpExceptionFilter,
	ValidationFilter,
	NotFoundFilter,
	AllExceptionsFilter,
	createDefaultErrorResponse,
	createInternalErrorResponse,
} from "./filters";

// Re-export interceptors types and utilities
export {
	type NestInterceptor,
	type InterceptorFn,
	type Interceptor,
	type CallHandler,
	type TransformResponse,
	type InterceptorExecutorOptions,
	UseInterceptors,
	LoggingInterceptor,
	TransformInterceptor,
	TimeoutInterceptor,
	CacheInterceptor,
	HeaderInterceptor,
	getClassInterceptors,
	getMethodInterceptors,
	executeInterceptors,
	isNestInterceptor,
	isInterceptorFn,
} from "./interceptors";

// Re-export lazy loading types and utilities
export {
	type LazyModuleLoader,
	type Constructor as LazyModuleConstructor,
	type ModuleLoaderFn,
	type LazyModuleMetadata,
	type LoadModuleOptions,
	LazyModuleLoaderImpl,
	LazyModule,
	ModuleLoader,
	MODULE_LOADER_TOKEN,
	getLazyMetadata,
	isLazyModule,
	LazyModuleRegistry,
	createLazyLoader,
	areAllLazyModulesLoaded,
	getUnloadedLazyModules,
} from "./lazy";

// Re-export forward reference utilities for circular dependencies
export {
	type ForwardRef,
	forwardRef,
	isForwardRef,
	resolveForwardRef,
} from "../container";