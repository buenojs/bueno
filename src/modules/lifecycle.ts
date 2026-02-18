/**
 * Lifecycle Hooks System
 *
 * Comprehensive lifecycle management for the Bueno framework module system.
 * Provides hooks for module initialization, application bootstrap, and shutdown.
 */

import type { Context } from "../context";

// ============= Application Lifecycle Hooks =============

/**
 * Hook called when a module is initialized.
 * Called after the module's providers are registered.
 */
export interface OnModuleInit {
	onModuleInit(): void | Promise<void>;
}

/**
 * Hook called when the application has fully bootstrapped.
 * Called after all controllers are registered.
 */
export interface OnApplicationBootstrap {
	onApplicationBootstrap(): void | Promise<void>;
}

/**
 * Hook called when a module is being destroyed.
 * Called during the shutdown process.
 */
export interface OnModuleDestroy {
	onModuleDestroy(): void | Promise<void>;
}

/**
 * Hook called before the application shuts down.
 * Called when a shutdown signal is received (SIGTERM, SIGINT).
 */
export interface BeforeApplicationShutdown {
	beforeApplicationShutdown(signal?: string): void | Promise<void>;
}

/**
 * Hook called when the application is shutting down.
 * Called at the end of the shutdown process.
 */
export interface OnApplicationShutdown {
	onApplicationShutdown(signal?: string): void | Promise<void>;
}

// ============= Request Lifecycle Hooks =============

/**
 * Hook called before a request is handled.
 */
export interface OnBeforeRequest {
	onBeforeRequest(context: Context): void | Promise<void>;
}

/**
 * Hook called after a request is handled.
 */
export interface OnAfterRequest {
	onAfterRequest(context: Context, response: Response): void | Promise<void>;
}

/**
 * Hook called when a request throws an error.
 */
export interface OnRequestError {
	onRequestError(context: Context, error: Error): void | Promise<void>;
}

// ============= Type Guards =============

/**
 * Check if an instance implements OnModuleInit
 */
export function isOnModuleInit(instance: unknown): instance is OnModuleInit {
	return (
		typeof instance === "object" &&
		instance !== null &&
		"onModuleInit" in instance &&
		typeof (instance as OnModuleInit).onModuleInit === "function"
	);
}

/**
 * Check if an instance implements OnApplicationBootstrap
 */
export function isOnApplicationBootstrap(
	instance: unknown,
): instance is OnApplicationBootstrap {
	return (
		typeof instance === "object" &&
		instance !== null &&
		"onApplicationBootstrap" in instance &&
		typeof (instance as OnApplicationBootstrap).onApplicationBootstrap ===
			"function"
	);
}

/**
 * Check if an instance implements OnModuleDestroy
 */
export function isOnModuleDestroy(instance: unknown): instance is OnModuleDestroy {
	return (
		typeof instance === "object" &&
		instance !== null &&
		"onModuleDestroy" in instance &&
		typeof (instance as OnModuleDestroy).onModuleDestroy === "function"
	);
}

/**
 * Check if an instance implements BeforeApplicationShutdown
 */
export function isBeforeApplicationShutdown(
	instance: unknown,
): instance is BeforeApplicationShutdown {
	return (
		typeof instance === "object" &&
		instance !== null &&
		"beforeApplicationShutdown" in instance &&
		typeof (instance as BeforeApplicationShutdown)
			.beforeApplicationShutdown === "function"
	);
}

/**
 * Check if an instance implements OnApplicationShutdown
 */
export function isOnApplicationShutdown(
	instance: unknown,
): instance is OnApplicationShutdown {
	return (
		typeof instance === "object" &&
		instance !== null &&
		"onApplicationShutdown" in instance &&
		typeof (instance as OnApplicationShutdown).onApplicationShutdown ===
			"function"
	);
}

/**
 * Check if an instance implements OnBeforeRequest
 */
export function isOnBeforeRequest(instance: unknown): instance is OnBeforeRequest {
	return (
		typeof instance === "object" &&
		instance !== null &&
		"onBeforeRequest" in instance &&
		typeof (instance as OnBeforeRequest).onBeforeRequest === "function"
	);
}

/**
 * Check if an instance implements OnAfterRequest
 */
export function isOnAfterRequest(instance: unknown): instance is OnAfterRequest {
	return (
		typeof instance === "object" &&
		instance !== null &&
		"onAfterRequest" in instance &&
		typeof (instance as OnAfterRequest).onAfterRequest === "function"
	);
}

/**
 * Check if an instance implements OnRequestError
 */
export function isOnRequestError(instance: unknown): instance is OnRequestError {
	return (
		typeof instance === "object" &&
		instance !== null &&
		"onRequestError" in instance &&
		typeof (instance as OnRequestError).onRequestError === "function"
	);
}

// ============= Lifecycle Hook Manager =============

/**
 * Manager for lifecycle hooks.
 * Handles registration and execution of lifecycle hooks in the correct order.
 */
export class LifecycleHookManager {
	private instancesWithModuleInit: OnModuleInit[] = [];
	private instancesWithBootstrap: OnApplicationBootstrap[] = [];
	private instancesWithModuleDestroy: OnModuleDestroy[] = [];
	private instancesWithBeforeShutdown: BeforeApplicationShutdown[] = [];
	private instancesWithShutdown: OnApplicationShutdown[] = [];
	private instancesWithBeforeRequest: OnBeforeRequest[] = [];
	private instancesWithAfterRequest: OnAfterRequest[] = [];
	private instancesWithRequestError: OnRequestError[] = [];

	/**
	 * Register an instance with lifecycle hooks.
	 * The instance will be checked for all lifecycle hook interfaces.
	 */
	registerInstance(instance: unknown): void {
		if (isOnModuleInit(instance)) {
			this.instancesWithModuleInit.push(instance);
		}
		if (isOnApplicationBootstrap(instance)) {
			this.instancesWithBootstrap.push(instance);
		}
		if (isOnModuleDestroy(instance)) {
			this.instancesWithModuleDestroy.push(instance);
		}
		if (isBeforeApplicationShutdown(instance)) {
			this.instancesWithBeforeShutdown.push(instance);
		}
		if (isOnApplicationShutdown(instance)) {
			this.instancesWithShutdown.push(instance);
		}
		if (isOnBeforeRequest(instance)) {
			this.instancesWithBeforeRequest.push(instance);
		}
		if (isOnAfterRequest(instance)) {
			this.instancesWithAfterRequest.push(instance);
		}
		if (isOnRequestError(instance)) {
			this.instancesWithRequestError.push(instance);
		}
	}

	/**
	 * Register multiple instances with lifecycle hooks.
	 */
	registerInstances(instances: unknown[]): void {
		for (const instance of instances) {
			this.registerInstance(instance);
		}
	}

	// ============= Application Lifecycle Execution =============

	/**
	 * Execute onModuleInit hooks for all registered instances.
	 * Called after providers are registered.
	 */
	async executeOnModuleInit(): Promise<void> {
		for (const instance of this.instancesWithModuleInit) {
			await instance.onModuleInit();
		}
	}

	/**
	 * Execute onApplicationBootstrap hooks for all registered instances.
	 * Called after controllers are registered.
	 */
	async executeOnApplicationBootstrap(): Promise<void> {
		for (const instance of this.instancesWithBootstrap) {
			await instance.onApplicationBootstrap();
		}
	}

	/**
	 * Execute beforeApplicationShutdown hooks for all registered instances.
	 * Called when a shutdown signal is received.
	 */
	async executeBeforeApplicationShutdown(signal?: string): Promise<void> {
		for (const instance of this.instancesWithBeforeShutdown) {
			await instance.beforeApplicationShutdown(signal);
		}
	}

	/**
	 * Execute onModuleDestroy hooks for all registered instances.
	 * Called during the shutdown process.
	 */
	async executeOnModuleDestroy(): Promise<void> {
		for (const instance of this.instancesWithModuleDestroy) {
			await instance.onModuleDestroy();
		}
	}

	/**
	 * Execute onApplicationShutdown hooks for all registered instances.
	 * Called at the end of the shutdown process.
	 */
	async executeOnApplicationShutdown(signal?: string): Promise<void> {
		for (const instance of this.instancesWithShutdown) {
			await instance.onApplicationShutdown(signal);
		}
	}

	// ============= Request Lifecycle Execution =============

	/**
	 * Execute onBeforeRequest hooks for all registered instances.
	 */
	async executeOnBeforeRequest(context: Context): Promise<void> {
		for (const instance of this.instancesWithBeforeRequest) {
			await instance.onBeforeRequest(context);
		}
	}

	/**
	 * Execute onAfterRequest hooks for all registered instances.
	 */
	async executeOnAfterRequest(
		context: Context,
		response: Response,
	): Promise<void> {
		for (const instance of this.instancesWithAfterRequest) {
			await instance.onAfterRequest(context, response);
		}
	}

	/**
	 * Execute onRequestError hooks for all registered instances.
	 */
	async executeOnRequestError(context: Context, error: Error): Promise<void> {
		for (const instance of this.instancesWithRequestError) {
			await instance.onRequestError(context, error);
		}
	}

	// ============= Utility Methods =============

	/**
	 * Check if there are any registered instances with lifecycle hooks.
	 */
	hasRegisteredHooks(): boolean {
		return (
			this.instancesWithModuleInit.length > 0 ||
			this.instancesWithBootstrap.length > 0 ||
			this.instancesWithModuleDestroy.length > 0 ||
			this.instancesWithBeforeShutdown.length > 0 ||
			this.instancesWithShutdown.length > 0 ||
			this.instancesWithBeforeRequest.length > 0 ||
			this.instancesWithAfterRequest.length > 0 ||
			this.instancesWithRequestError.length > 0
		);
	}

	/**
	 * Get count of registered instances for each hook type.
	 */
	getHookCounts(): {
		onModuleInit: number;
		onApplicationBootstrap: number;
		onModuleDestroy: number;
		beforeApplicationShutdown: number;
		onApplicationShutdown: number;
		onBeforeRequest: number;
		onAfterRequest: number;
		onRequestError: number;
	} {
		return {
			onModuleInit: this.instancesWithModuleInit.length,
			onApplicationBootstrap: this.instancesWithBootstrap.length,
			onModuleDestroy: this.instancesWithModuleDestroy.length,
			beforeApplicationShutdown: this.instancesWithBeforeShutdown.length,
			onApplicationShutdown: this.instancesWithShutdown.length,
			onBeforeRequest: this.instancesWithBeforeRequest.length,
			onAfterRequest: this.instancesWithAfterRequest.length,
			onRequestError: this.instancesWithRequestError.length,
		};
	}

	/**
	 * Clear all registered instances.
	 * Useful for testing or when resetting the application.
	 */
	clear(): void {
		this.instancesWithModuleInit = [];
		this.instancesWithBootstrap = [];
		this.instancesWithModuleDestroy = [];
		this.instancesWithBeforeShutdown = [];
		this.instancesWithShutdown = [];
		this.instancesWithBeforeRequest = [];
		this.instancesWithAfterRequest = [];
		this.instancesWithRequestError = [];
	}
}

// ============= Shutdown Signal Handler =============

/**
 * Handler for graceful shutdown signals.
 */
export class ShutdownSignalHandler {
	private isShuttingDown = false;
	private signalListeners: Array<(signal: string) => Promise<void>> = [];

	/**
	 * Register a listener for shutdown signals.
	 */
	onSignal(listener: (signal: string) => Promise<void>): void {
		this.signalListeners.push(listener);
	}

	/**
	 * Remove a listener for shutdown signals.
	 */
	offSignal(listener: (signal: string) => Promise<void>): void {
		const index = this.signalListeners.indexOf(listener);
		if (index > -1) {
			this.signalListeners.splice(index, 1);
		}
	}

	/**
	 * Start listening for shutdown signals (SIGTERM, SIGINT).
	 */
	startListening(): void {
		process.on("SIGTERM", () => this.handleSignal("SIGTERM"));
		process.on("SIGINT", () => this.handleSignal("SIGINT"));
	}

	/**
	 * Stop listening for shutdown signals.
	 */
	stopListening(): void {
		process.off("SIGTERM", () => this.handleSignal("SIGTERM"));
		process.off("SIGINT", () => this.handleSignal("SIGINT"));
	}

	/**
	 * Handle a shutdown signal.
	 */
	private async handleSignal(signal: string): Promise<void> {
		if (this.isShuttingDown) {
			console.log(`Already shutting down, ignoring ${signal}`);
			return;
		}

		this.isShuttingDown = true;
		console.log(`\nReceived ${signal}, starting graceful shutdown...`);

		for (const listener of this.signalListeners) {
			try {
				await listener(signal);
			} catch (error) {
				console.error("Error during shutdown:", error);
			}
		}

		// Exit with success code
		process.exit(0);
	}

	/**
	 * Check if the application is shutting down.
	 */
	isShuttingDownNow(): boolean {
		return this.isShuttingDown;
	}
}

// ============= Combined Lifecycle Interfaces =============

/**
 * Combined interface for all application lifecycle hooks.
 */
export interface ApplicationLifecycle
	extends OnModuleInit,
		OnApplicationBootstrap,
		OnModuleDestroy,
		BeforeApplicationShutdown,
		OnApplicationShutdown {}

/**
 * Combined interface for all request lifecycle hooks.
 */
export interface RequestLifecycle
	extends OnBeforeRequest,
		OnAfterRequest,
		OnRequestError {}

/**
 * Combined interface for all lifecycle hooks.
 */
export interface FullLifecycle extends ApplicationLifecycle, RequestLifecycle {}