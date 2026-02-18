/**
 * Configuration System for Bueno Framework
 *
 * Provides a comprehensive configuration system supporting:
 * - `bueno.config.ts` file loading
 * - Environment variables
 * - Schema validation
 * - Deep merging of config sources
 */

// Re-export types
export type {
	BuenoConfig,
	ServerConfig,
	DatabaseConfig,
	CacheConfig,
	LoggerConfig,
	HealthConfig,
	MetricsConfig,
	TelemetryConfig,
	FrontendConfig,
	DeepPartial,
	UserConfig,
	UserConfigFn,
	InferConfig,
} from "./types";

// Re-export merge utilities
export { deepMerge, mergeConfigs, isObject } from "./merge";

// Re-export environment utilities
export {
	loadEnv,
	getEnvConfig,
	getEnvValue,
	setEnvValue,
	envConfigMapping,
	type EnvConfigMapping,
} from "./env";

// Re-export loader utilities
export {
	loadConfig,
	loadConfigFile,
	loadConfigFiles,
	findConfigFile,
	clearConfigCache,
	getCachedConfig,
	watchConfig,
	validateConfigStructure,
	getConfigPathFromArgs,
	getConfigPathFromEnv,
	type LoadedConfig,
} from "./loader";

// Re-export validation utilities
export {
	validateConfig,
	validateConfigSync,
	validateConfigDefaults,
	validateWithSchema,
	assertValidConfig,
	formatValidationErrors,
	createConfigError,
	createCustomValidator,
	isStandardSchema,
	type ConfigValidationResult,
	type ConfigValidationError,
	type ConfigValidationWarning,
} from "./validation";

import type { StandardSchema } from "../types";
import type {
	BuenoConfig,
	DeepPartial,
	UserConfig,
	UserConfigFn,
	InferConfig,
} from "./types";
import { deepMerge, mergeConfigs } from "./merge";
import { loadEnv, getEnvConfig } from "./env";
import { loadConfig, findConfigFile, clearConfigCache } from "./loader";
import {
	validateConfig,
	validateConfigSync,
	assertValidConfig,
	type ConfigValidationResult,
} from "./validation";

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: BuenoConfig = {
	server: {
		port: 3000,
		host: "localhost",
		development: false,
	},
	database: {
		url: undefined,
		poolSize: 10,
		enableMetrics: true,
		slowQueryThreshold: 100,
	},
	cache: {
		driver: "memory",
		url: undefined,
		ttl: 3600,
		keyPrefix: "",
		enableMetrics: true,
	},
	logger: {
		level: "info",
		pretty: false,
		output: "console",
	},
	health: {
		enabled: true,
		healthPath: "/health",
		readyPath: "/ready",
	},
	metrics: {
		enabled: true,
		collectInterval: 60000,
		maxHistorySize: 100,
	},
	telemetry: {
		enabled: false,
		serviceName: "bueno-app",
		endpoint: undefined,
		sampleRate: 1.0,
	},
	frontend: {
		devServer: false,
		hmr: true,
		port: 3001,
	},
};

/**
 * ConfigManager options
 */
export interface ConfigManagerOptions<T extends BuenoConfig = BuenoConfig> {
	/** Custom config file path */
	configPath?: string;
	/** Working directory */
	cwd?: string;
	/** Whether to load environment variables */
	loadEnv?: boolean;
	/** Whether to use default config */
	useDefaults?: boolean;
	/** Custom schema for validation */
	schema?: StandardSchema<T>;
	/** Whether to validate config on load */
	validate?: boolean;
	/** Additional config to merge */
	config?: DeepPartial<T>;
}

/**
 * Config change callback
 */
export type ConfigChangeCallback<T extends BuenoConfig = BuenoConfig> = (
	config: T,
) => void;

/**
 * ConfigManager class
 * Manages configuration loading, merging, validation, and access
 */
export class ConfigManager<T extends BuenoConfig = BuenoConfig> {
	private config: T;
	private options: ConfigManagerOptions<T>;
	private loaded = false;
	private filePath?: string;
	private watchers: ConfigChangeCallback<T>[] = [];
	private unwatch?: () => void;

	constructor(options: ConfigManagerOptions<T> = {}) {
		this.options = options;
		this.config = (options.useDefaults !== false
			? { ...DEFAULT_CONFIG }
			: {}) as T;

		// Apply initial config if provided
		if (options.config) {
			this.config = deepMerge(this.config, options.config) as T;
		}
	}

	/**
	 * Load configuration from all sources
	 * Order: defaults → file config → env vars → CLI args → provided config
	 */
	async load(): Promise<T> {
		// Load environment variables
		if (this.options.loadEnv !== false) {
			loadEnv();
		}

		// Load config file
		const { config: fileConfig, filePath } = await loadConfig<T>({
			configPath: this.options.configPath,
			cwd: this.options.cwd,
		});

		this.filePath = filePath;

		// Get environment config
		const envConfig = getEnvConfig();

		// Merge all sources
		const merged = mergeConfigs(
			{} as T,
			this.options.useDefaults !== false ? DEFAULT_CONFIG : {} as T,
			fileConfig as T,
			envConfig as T,
			this.options.config as T || {} as T,
		);

		this.config = merged as T;

		// Validate if requested
		if (this.options.validate !== false) {
			await this.validate(this.options.schema);
		}

		this.loaded = true;
		return this.config;
	}

	/**
	 * Get the entire configuration
	 */
	getAll(): T {
		return { ...this.config } as T;
	}

	/**
	 * Get a configuration value using dot notation
	 * @example
	 * config.get('server.port') // 3000
	 * config.get('database.url') // 'postgresql://...'
	 */
	get<K extends keyof T>(key: K): T[K];
	get<K extends string>(key: K): unknown;
	get(key: string): unknown {
		const parts = key.split(".");
		let current: unknown = this.config;

		for (const part of parts) {
			if (current === null || current === undefined) {
				return undefined;
			}
			if (typeof current !== "object") {
				return undefined;
			}
			current = (current as Record<string, unknown>)[part];
		}

		return current;
	}

	/**
	 * Set a configuration value at runtime
	 * @example
	 * config.set('server.port', 4000)
	 */
	set<K extends keyof T>(key: K, value: T[K]): void;
	set(key: string, value: unknown): void;
	set(key: string, value: unknown): void {
		const parts = key.split(".");
		let current: Record<string, unknown> = this.config as Record<string, unknown>;

		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i];
			if (!(part in current)) {
				current[part] = {};
			}
			current = current[part] as Record<string, unknown>;
		}

		current[parts[parts.length - 1]] = value;

		// Notify watchers
		this.notifyWatchers();
	}

	/**
	 * Check if a configuration key exists
	 */
	has(key: string): boolean {
		return this.get(key) !== undefined;
	}

	/**
	 * Validate the current configuration
	 */
	async validate(schema?: StandardSchema<T>): Promise<ConfigValidationResult> {
		const result = await validateConfig(this.config, schema);

		if (!result.valid) {
			const errors = result.errors
				.map((e) => `${e.path ? e.path + ": " : ""}${e.message}`)
				.join("\n");
			throw new Error(`Configuration validation failed:\n${errors}`);
		}

		// Log warnings
		for (const warning of result.warnings) {
			console.warn(
				`Config warning: ${warning.message}${warning.path ? ` (at ${warning.path})` : ""}`,
			);
		}

		return result;
	}

	/**
	 * Validate synchronously (only default rules)
	 */
	validateSync(): ConfigValidationResult {
		return validateConfigSync(this.config as unknown as DeepPartial<BuenoConfig>);
	}

	/**
	 * Watch for configuration changes
	 */
	watch(callback: ConfigChangeCallback<T>): () => void {
		this.watchers.push(callback);

		// Return unsubscribe function
		return () => {
			const index = this.watchers.indexOf(callback);
			if (index !== -1) {
				this.watchers.splice(index, 1);
			}
		};
	}

	/**
	 * Start watching the config file for changes
	 */
	async watchFile(): Promise<void> {
		if (!this.filePath) {
			this.filePath = await findConfigFile(this.options.cwd);
		}

		if (!this.filePath) {
			return;
		}

		// Clear the cache to allow reloading
		clearConfigCache();

		// Set up polling for file changes
		const { watchConfig } = await import("./loader");
		this.unwatch = watchConfig(
			this.filePath,
			async () => {
				await this.load();
			},
			{ debounce: 100 },
		);
	}

	/**
	 * Stop watching the config file
	 */
	unwatchFile(): void {
		if (this.unwatch) {
			this.unwatch();
			this.unwatch = undefined;
		}
	}

	/**
	 * Check if config has been loaded
	 */
	isLoaded(): boolean {
		return this.loaded;
	}

	/**
	 * Get the config file path
	 */
	getFilePath(): string | undefined {
		return this.filePath;
	}

	/**
	 * Reset configuration to defaults
	 */
	reset(): void {
		this.config = { ...DEFAULT_CONFIG } as T;
		this.loaded = false;
		this.notifyWatchers();
	}

	/**
	 * Merge additional configuration
	 */
	merge(config: DeepPartial<T>): void {
		this.config = deepMerge(this.config, config) as T;
		this.notifyWatchers();
	}

	/**
	 * Notify all watchers of a change
	 */
	private notifyWatchers(): void {
		for (const watcher of this.watchers) {
			try {
				watcher(this.config);
			} catch (error) {
				console.error("Error in config watcher:", error);
			}
		}
	}
}

/**
 * Define configuration with type safety
 * @example
 * export default defineConfig({
 *   server: { port: 3000 },
 *   database: { url: process.env.DATABASE_URL },
 * })
 */
export function defineConfig<T extends BuenoConfig = BuenoConfig>(
	config: UserConfig<T>,
): UserConfig<T> {
	return config;
}

/**
 * Define configuration with a function
 * @example
 * export default defineConfigFn((env) => ({
 *   server: { port: env.PORT ? parseInt(env.PORT) : 3000 },
 * }))
 */
export function defineConfigFn<T extends BuenoConfig = BuenoConfig>(
	fn: UserConfigFn<T>,
): UserConfigFn<T> {
	return fn;
}

/**
 * Create a configuration manager
 * @example
 * const config = await createConfigManager();
 * const port = config.get('server.port');
 */
export async function createConfigManager<
	T extends BuenoConfig = BuenoConfig,
>(options?: ConfigManagerOptions<T>): Promise<ConfigManager<T>> {
	const manager = new ConfigManager<T>(options);
	await manager.load();
	return manager;
}

/**
 * Create a configuration manager without loading
 * @example
 * const config = createConfigManagerSync();
 * // Later: await config.load();
 */
export function createConfigManagerSync<T extends BuenoConfig = BuenoConfig>(
	options?: ConfigManagerOptions<T>,
): ConfigManager<T> {
	return new ConfigManager<T>(options);
}

/**
 * Load configuration and return the config object directly
 * @example
 * const config = await loadConfigDirect();
 * console.log(config.server?.port);
 */
export async function loadConfigDirect<
	T extends BuenoConfig = BuenoConfig,
>(options?: ConfigManagerOptions<T>): Promise<T> {
	const manager = await createConfigManager<T>(options);
	return manager.getAll();
}

// Singleton instance for convenience
let defaultManager: ConfigManager | undefined;

/**
 * Get the default configuration manager
 */
export function getConfigManager(): ConfigManager {
	if (!defaultManager) {
		defaultManager = new ConfigManager();
	}
	return defaultManager;
}

/**
 * Set the default configuration manager
 */
export function setConfigManager(manager: ConfigManager): void {
	defaultManager = manager;
}