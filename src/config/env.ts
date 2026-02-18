/**
 * Environment variable handling for Bueno Framework
 */

import type { BuenoConfig, DeepPartial, EnvMapping } from "./types";
import { ENV_MAPPINGS } from "./types";
import { setNestedValue } from "./merge";

/**
 * Environment variable source information
 */
export interface EnvSourceInfo {
	/** Environment variable name */
	name: string;
	/** Value of the environment variable */
	value: string;
	/** File the variable was loaded from */
	source?: string;
}

/**
 * Loaded environment data
 */
export interface LoadedEnv {
	/** Raw environment variables loaded */
	raw: Record<string, string>;
	/** Transformed configuration from environment */
	config: DeepPartial<BuenoConfig>;
	/** Source information for each variable */
	sources: Map<string, EnvSourceInfo>;
}

/**
 * Environment file priority (later files override earlier ones)
 */
const ENV_FILE_PRIORITY = [
	".env",
	".env.local",
	".env.development",
	".env.production",
	".env.test",
];

/**
 * Get the current NODE_ENV
 */
export function getNodeEnv(): string {
	return Bun.env.NODE_ENV || "development";
}

/**
 * Get environment-specific .env file name
 */
export function getEnvFileName(): string {
	const nodeEnv = getNodeEnv();
	switch (nodeEnv) {
		case "production":
			return ".env.production";
		case "test":
			return ".env.test";
		default:
			return ".env.development";
	}
}

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
 * Parse .env file content
 */
function parseEnvContent(content: string): Record<string, string> {
	const result: Record<string, string> = {};
	const lines = content.split("\n");

	for (const line of lines) {
		// Skip empty lines and comments
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		// Parse KEY=value or KEY="value" or KEY='value'
		const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) {
			continue;
		}

		const [, key, rawValue] = match;
		let value = rawValue;

		// Handle quoted values
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		result[key] = value;
	}

	return result;
}

/**
 * Load environment variables from a single .env file
 */
async function loadEnvFile(
	filePath: string,
): Promise<{ vars: Record<string, string>; existed: boolean }> {
	const exists = await fileExists(filePath);
	if (!exists) {
		return { vars: {}, existed: false };
	}

	try {
		const file = Bun.file(filePath);
		const content = await file.text();
		const vars = parseEnvContent(content);
		return { vars, existed: true };
	} catch (error) {
		console.warn(`Warning: Failed to load ${filePath}:`, error);
		return { vars: {}, existed: false };
	}
}

/**
 * Load environment variables from multiple .env files
 * Files are loaded in priority order, with later files overriding earlier ones
 */
export async function loadEnvFiles(options?: {
	/** Custom list of env files to load */
	files?: string[];
	/** Whether to also load NODE_ENV-specific file */
	loadNodeEnv?: boolean;
	/** Base directory for env files */
	cwd?: string;
}): Promise<Record<string, string>> {
	const cwd = options?.cwd ?? process.cwd();
	const files = options?.files ?? [...ENV_FILE_PRIORITY];

	// Add NODE_ENV-specific file if requested
	if (options?.loadNodeEnv !== false) {
		const envFile = getEnvFileName();
		if (!files.includes(envFile)) {
			files.push(envFile);
		}
	}

	const result: Record<string, string> = {};

	for (const file of files) {
		const filePath = file.startsWith("/") ? file : `${cwd}/${file}`;
		const { vars } = await loadEnvFile(filePath);
		Object.assign(result, vars);
	}

	return result;
}

/**
 * Get environment variable value from Bun.env
 */
export function getEnvVar(name: string): string | undefined {
	return Bun.env[name];
}

/**
 * Set environment variable in Bun.env
 */
export function setEnvVar(name: string, value: string): void {
	Bun.env[name] = value;
}

/**
 * Delete environment variable from Bun.env
 */
export function deleteEnvVar(name: string): void {
	delete Bun.env[name];
}

/**
 * Transform environment variables to configuration object
 */
export function envToConfig(
	envVars: Record<string, string>,
	mappings: EnvMapping[] = ENV_MAPPINGS,
): DeepPartial<BuenoConfig> {
	let config: DeepPartial<BuenoConfig> = {};

	for (const mapping of mappings) {
		const value = envVars[mapping.envVar];
		if (value === undefined || value === "") {
			continue;
		}

		const transformedValue = mapping.transform
			? mapping.transform(value)
			: value;

		config = setNestedValue(
			config as Record<string, unknown>,
			mapping.configKey,
			transformedValue,
		) as DeepPartial<BuenoConfig>;
	}

	return config;
}

/**
 * Load environment variables and transform to configuration
 */
export async function loadEnv(options?: {
	/** Custom list of env files to load */
	files?: string[];
	/** Whether to load NODE_ENV-specific file */
	loadNodeEnv?: boolean;
	/** Base directory for env files */
	cwd?: string;
	/** Whether to merge with existing Bun.env */
	mergeWithProcess?: boolean;
	/** Custom environment variable mappings */
	mappings?: EnvMapping[];
}): Promise<LoadedEnv> {
	// Load from .env files
	const fileVars = await loadEnvFiles(options);

	// Merge with Bun.env if requested
	const raw: Record<string, string> =
		options?.mergeWithProcess !== false
			? { ...fileVars, ...Object.fromEntries(Object.entries(Bun.env).filter(([, v]) => v !== undefined) as [string, string][]) }
			: fileVars;

	// Transform to config
	const config = envToConfig(raw, options?.mappings);

	// Track sources
	const sources = new Map<string, EnvSourceInfo>();
	for (const [name, value] of Object.entries(raw)) {
		sources.set(name, {
			name,
			value,
			source: fileVars[name] !== undefined ? ".env file" : "process",
		});
	}

	// Set loaded vars to Bun.env
	for (const [key, value] of Object.entries(fileVars)) {
		if (Bun.env[key] === undefined) {
			Bun.env[key] = value;
		}
	}

	return { raw, config, sources };
}

/**
 * Get all environment variables related to Bueno configuration
 */
export function getBuenoEnvVars(): Record<string, string> {
	const result: Record<string, string> = {};

	for (const mapping of ENV_MAPPINGS) {
		const value = Bun.env[mapping.envVar];
		if (value !== undefined) {
			result[mapping.envVar] = value;
		}
	}

	return result;
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
	return getNodeEnv() === "development";
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
	return getNodeEnv() === "production";
}

/**
 * Check if running in test mode
 */
export function isTest(): boolean {
	return getNodeEnv() === "test";
}

/**
 * Create a custom environment variable mapping
 */
export function createEnvMapping(
	envVar: string,
	configKey: string,
	transform?: (value: string) => unknown,
): EnvMapping {
	return { envVar, configKey, transform };
}

/**
 * Parse a boolean environment variable
 */
export function parseEnvBoolean(value: string): boolean {
	return value === "true" || value === "1" || value === "yes";
}

/**
 * Parse a number environment variable
 */
export function parseEnvNumber(value: string): number {
	const num = parseInt(value, 10);
	if (isNaN(num)) {
		throw new Error(`Invalid number: ${value}`);
	}
	return num;
}

/**
 * Parse a JSON environment variable
 */
export function parseEnvJSON<T = unknown>(value: string): T {
	return JSON.parse(value) as T;
}

/**
 * Parse an array environment variable (comma-separated)
 */
export function parseEnvArray(value: string): string[] {
	return value.split(",").map((v) => v.trim());
}

/**
 * Environment config mapping for standard Bueno config
 */
export const envConfigMapping: EnvConfigMapping[] = [
	{ envVar: "BUENO_PORT", configKey: "server.port", transform: parseEnvNumber },
	{ envVar: "BUENO_HOST", configKey: "server.host" },
	{ envVar: "BUENO_DEV", configKey: "server.development", transform: parseEnvBoolean },
	{ envVar: "DATABASE_URL", configKey: "database.url" },
	{ envVar: "DATABASE_POOL_SIZE", configKey: "database.poolSize", transform: parseEnvNumber },
	{ envVar: "REDIS_URL", configKey: "cache.url" },
	{ envVar: "CACHE_DRIVER", configKey: "cache.driver" },
	{ envVar: "CACHE_TTL", configKey: "cache.ttl", transform: parseEnvNumber },
	{ envVar: "LOG_LEVEL", configKey: "logger.level" },
	{ envVar: "LOG_PRETTY", configKey: "logger.pretty", transform: parseEnvBoolean },
	{ envVar: "HEALTH_ENABLED", configKey: "health.enabled", transform: parseEnvBoolean },
	{ envVar: "METRICS_ENABLED", configKey: "metrics.enabled", transform: parseEnvBoolean },
	{ envVar: "TELEMETRY_ENABLED", configKey: "telemetry.enabled", transform: parseEnvBoolean },
	{ envVar: "TELEMETRY_SERVICE_NAME", configKey: "telemetry.serviceName" },
	{ envVar: "TELEMETRY_ENDPOINT", configKey: "telemetry.endpoint" },
	{ envVar: "FRONTEND_DEV_SERVER", configKey: "frontend.devServer", transform: parseEnvBoolean },
	{ envVar: "FRONTEND_HMR", configKey: "frontend.hmr", transform: parseEnvBoolean },
	{ envVar: "FRONTEND_PORT", configKey: "frontend.port", transform: parseEnvNumber },
];

/**
 * Environment config mapping interface
 */
export interface EnvConfigMapping {
	envVar: string;
	configKey: string;
	transform?: (value: string) => unknown;
}

/**
 * Get a config value from environment variables using the mapping
 */
export function getEnvConfig(
	mappings: EnvConfigMapping[] = envConfigMapping,
): DeepPartial<BuenoConfig> {
	const envVars: Record<string, string> = {};
	for (const [key, value] of Object.entries(Bun.env)) {
		if (value !== undefined) {
			envVars[key] = value;
		}
	}
	return envToConfig(envVars, mappings);
}

/**
 * Get an environment variable value
 */
export function getEnvValue(key: string, defaultValue?: string): string | undefined {
	return Bun.env[key] ?? defaultValue;
}

/**
 * Set an environment variable value
 */
export function setEnvValue(key: string, value: string): void {
	Bun.env[key] = value;
}