/**
 * Configuration file loader for Bueno Framework
 * Uses Bun's native TypeScript loader to import config files
 */

import type { BuenoConfig, DeepPartial, UserConfig, UserConfigFn } from "./types";
import { deepMerge } from "./merge";

/**
 * Configuration file search order
 */
const CONFIG_FILES = [
	"bueno.config.ts",
	"bueno.config.js",
	".buenorc.ts",
	".buenorc.js",
	"bueno.config.mjs",
];

/**
 * Loaded configuration information
 */
export interface LoadedConfig {
	/** The loaded configuration */
	config: DeepPartial<BuenoConfig>;
	/** Path to the config file that was loaded */
	filePath?: string;
	/** Whether the config was loaded from cache */
	fromCache: boolean;
}

/**
 * Config loader cache
 */
const configCache = new Map<string, DeepPartial<BuenoConfig>>();

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
	try {
		const file = Bun.file(path);
		return await file.exists();
	} catch {
		return false;
	}
}

/**
 * Find the first existing config file
 */
export async function findConfigFile(
	cwd?: string,
): Promise<string | undefined> {
	const baseDir = cwd ?? process.cwd();

	for (const file of CONFIG_FILES) {
		const filePath = `${baseDir}/${file}`;
		if (await fileExists(filePath)) {
			return filePath;
		}
	}

	return undefined;
}

/**
 * Clear the config cache
 */
export function clearConfigCache(): void {
	configCache.clear();
}

/**
 * Get cached config
 */
export function getCachedConfig(path: string): DeepPartial<BuenoConfig> | undefined {
	return configCache.get(path);
}

/**
 * Load a configuration file
 * Supports both default exports and named exports
 */
export async function loadConfigFile<T extends BuenoConfig = BuenoConfig>(
	filePath: string,
	options?: {
		/** Whether to use cache */
		useCache?: boolean;
		/** Additional context to pass to config function */
		context?: Record<string, unknown>;
	},
): Promise<LoadedConfig> {
	const useCache = options?.useCache !== false;

	// Check cache first
	if (useCache) {
		const cached = configCache.get(filePath);
		if (cached) {
			return {
				config: cached,
				filePath,
				fromCache: true,
			};
		}
	}

	// Check if file exists
	if (!(await fileExists(filePath))) {
		throw new Error(`Config file not found: ${filePath}`);
	}

	try {
		// Use Bun's native TypeScript loader
		const module = await import(filePath);

		let config: DeepPartial<T>;

		// Handle different export styles
		if (typeof module.default === "function") {
			// Function export: export default defineConfig(() => ({ ... }))
			config = await module.default(options?.context);
		} else if (typeof module.default === "object" && module.default !== null) {
			// Object export: export default { ... }
			config = module.default;
		} else if (module.config) {
			// Named export: export const config = { ... }
			config = module.config;
		} else {
			// Try to use the module itself as config
			config = module;
		}

		// Cache the result
		if (useCache) {
			configCache.set(filePath, config as DeepPartial<BuenoConfig>);
		}

		return {
			config: config as DeepPartial<BuenoConfig>,
			filePath,
			fromCache: false,
		};
	} catch (error) {
		throw new Error(
			`Failed to load config from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Load configuration from file
 * Searches for config files in order and loads the first one found
 */
export async function loadConfig<T extends BuenoConfig = BuenoConfig>(
	options?: {
		/** Custom config file path */
		configPath?: string;
		/** Working directory to search for config */
		cwd?: string;
		/** Whether to use cache */
		useCache?: boolean;
		/** Additional context to pass to config function */
		context?: Record<string, unknown>;
	},
): Promise<LoadedConfig> {
	// If a specific path is provided, use it
	if (options?.configPath) {
		return loadConfigFile<T>(options.configPath, {
			useCache: options.useCache,
			context: options.context,
		});
	}

	// Find config file
	const filePath = await findConfigFile(options?.cwd);

	if (!filePath) {
		return {
			config: {},
			filePath: undefined,
			fromCache: false,
		};
	}

	return loadConfigFile<T>(filePath, {
		useCache: options?.useCache,
		context: options?.context,
	});
}

/**
 * Load and merge multiple config files
 * Later files override earlier ones
 */
export async function loadConfigFiles(
	filePaths: string[],
	options?: {
		/** Whether to use cache */
		useCache?: boolean;
	},
): Promise<LoadedConfig> {
	const configs: DeepPartial<BuenoConfig>[] = [];
	let lastFilePath: string | undefined;

	for (const filePath of filePaths) {
		if (await fileExists(filePath)) {
			const { config } = await loadConfigFile(filePath, options);
			configs.push(config);
			lastFilePath = filePath;
		}
	}

	const mergedConfig = configs.reduce(
		(acc, config) => deepMerge(acc, config),
		{} as DeepPartial<BuenoConfig>,
	);

	return {
		config: mergedConfig,
		filePath: lastFilePath,
		fromCache: false,
	};
}

/**
 * Watch a config file for changes
 * Returns an unsubscribe function
 */
export function watchConfig(
	filePath: string,
	callback: (config: DeepPartial<BuenoConfig>) => void,
	options?: {
		/** Debounce time in milliseconds */
		debounce?: number;
	},
): () => void {
	let timeout: Timer | undefined;
	const debounce = options?.debounce ?? 100;

	// Use Bun's file watcher
	const watcher = Bun.file(filePath);

	// Note: Bun doesn't have a built-in file watcher API yet
	// This is a placeholder for future implementation
	// For now, we'll use a polling approach

	const interval = setInterval(async () => {
		try {
			// Clear cache to force reload
			configCache.delete(filePath);
			const { config } = await loadConfigFile(filePath, { useCache: false });

			if (timeout) {
				clearTimeout(timeout);
			}

			timeout = setTimeout(() => {
				callback(config);
			}, debounce);
		} catch {
			// Ignore errors during watch
		}
	}, 1000);

	return () => {
		clearInterval(interval);
		if (timeout) {
			clearTimeout(timeout);
		}
	};
}

/**
 * Validate that a config object has the expected structure
 */
export function validateConfigStructure(
	config: unknown,
): config is DeepPartial<BuenoConfig> {
	if (config === null || typeof config !== "object") {
		return false;
	}

	// Basic validation - check that all top-level keys are valid
	const validKeys = new Set([
		"server",
		"database",
		"cache",
		"logger",
		"health",
		"metrics",
		"telemetry",
		"frontend",
	]);

	const cfg = config as Record<string, unknown>;
	for (const key of Object.keys(cfg)) {
		if (!validKeys.has(key)) {
			console.warn(`Unknown config key: ${key}`);
		}
	}

	return true;
}

/**
 * Extract config file path from CLI args
 */
export function getConfigPathFromArgs(args: string[] = process.argv): string | undefined {
	const configIndex = args.indexOf("--config");
	if (configIndex !== -1 && args[configIndex + 1]) {
		return args[configIndex + 1];
	}

	// Also support -c shorthand
	const shortIndex = args.indexOf("-c");
	if (shortIndex !== -1 && args[shortIndex + 1]) {
		return args[shortIndex + 1];
	}

	return undefined;
}

/**
 * Extract config file path from environment
 */
export function getConfigPathFromEnv(): string | undefined {
	return Bun.env.BUENO_CONFIG;
}