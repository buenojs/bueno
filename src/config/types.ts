/**
 * Configuration type definitions for Bueno Framework
 */

import type { StandardSchema } from "../types";

// ============= Server Configuration =============

export interface ServerConfig {
	/** Server port (default: 3000) */
	port?: number;
	/** Server host (default: 'localhost') */
	host?: string;
	/** Enable development mode */
	development?: boolean;
}

// ============= Database Configuration =============

export interface DatabaseConfig {
	/** Database connection URL */
	url?: string;
	/** Connection pool size */
	poolSize?: number;
	/** Enable database metrics */
	enableMetrics?: boolean;
	/** Slow query threshold in milliseconds */
	slowQueryThreshold?: number;
}

// ============= Cache Configuration =============

export interface CacheConfig {
	/** Cache driver type */
	driver?: "redis" | "memory";
	/** Redis connection URL */
	url?: string;
	/** Default TTL in seconds */
	ttl?: number;
	/** Key prefix for namespacing */
	keyPrefix?: string;
	/** Enable cache metrics */
	enableMetrics?: boolean;
}

// ============= Logger Configuration =============

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LoggerConfig {
	/** Log level (default: 'info') */
	level?: LogLevel;
	/** Pretty print logs (default: true in development) */
	pretty?: boolean;
	/** Output destination */
	output?: "console" | "stdout";
}

// ============= Health Check Configuration =============

export interface HealthConfig {
	/** Enable health check endpoints */
	enabled?: boolean;
	/** Health check endpoint path (default: '/health') */
	healthPath?: string;
	/** Readiness check endpoint path (default: '/ready') */
	readyPath?: string;
}

// ============= Metrics Configuration =============

export interface MetricsConfig {
	/** Enable metrics collection */
	enabled?: boolean;
	/** Collection interval in milliseconds */
	collectInterval?: number;
	/** Maximum history size */
	maxHistorySize?: number;
}

// ============= Telemetry Configuration =============

export interface TelemetryConfig {
	/** Enable OpenTelemetry tracing */
	enabled?: boolean;
	/** Service name for tracing */
	serviceName?: string;
	/** OTLP endpoint URL */
	endpoint?: string;
	/** Sampling rate (0.0 to 1.0) */
	sampleRate?: number;
}

// ============= Frontend Configuration =============

export interface FrontendConfig {
	/** Enable development server */
	devServer?: boolean;
	/** Enable Hot Module Replacement */
	hmr?: boolean;
	/** Frontend dev server port */
	port?: number;
}

// ============= Main Configuration Interface =============

/**
 * Main configuration interface for Bueno Framework
 */
export interface BuenoConfig {
	/** Server configuration */
	server?: ServerConfig;
	/** Database configuration */
	database?: DatabaseConfig;
	/** Cache configuration */
	cache?: CacheConfig;
	/** Logger configuration */
	logger?: LoggerConfig;
	/** Health check configuration */
	health?: HealthConfig;
	/** Metrics configuration */
	metrics?: MetricsConfig;
	/** Telemetry configuration */
	telemetry?: TelemetryConfig;
	/** Frontend configuration */
	frontend?: FrontendConfig;
}

// ============= Configuration Manager Options =============

export interface ConfigManagerOptions {
	/** Path to config file (default: auto-detect) */
	configPath?: string;
	/** Whether to load environment variables (default: true) */
	loadEnv?: boolean;
	/** Whether to validate config (default: true) */
	validate?: boolean;
	/** Custom validation schema */
	schema?: StandardSchema<BuenoConfig>;
	/** Environment to load (.env.{NODE_ENV}) */
	env?: string;
}

// ============= Configuration Source =============

export type ConfigSource = "default" | "file" | "env" | "cli" | "runtime";

export interface ConfigSourceInfo {
	/** Source of the configuration value */
	source: ConfigSource;
	/** File path if from file */
	filePath?: string;
	/** Environment variable name if from env */
	envVar?: string;
}

// ============= Configuration Change Event =============

export interface ConfigChangeEvent {
	/** Key that changed (dot notation) */
	key: string;
	/** Previous value */
	oldValue: unknown;
	/** New value */
	newValue: unknown;
	/** Source of the change */
	source: ConfigSource;
	/** Timestamp of the change */
	timestamp: Date;
}

// ============= Configuration Watch Callback =============

export type ConfigWatchCallback = (event: ConfigChangeEvent) => void;

// ============= Type Utilities =============

/**
 * Infer configuration type from a schema
 */
export type InferConfig<T extends StandardSchema<BuenoConfig>> = NonNullable<
	T["~standard"]["types"]
>["output"];

/**
 * Deep partial type for configuration
 */
export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * User configuration type (alias for DeepPartial<BuenoConfig>)
 */
export type UserConfig<T extends BuenoConfig = BuenoConfig> = DeepPartial<T>;

/**
 * User configuration function type
 */
export type UserConfigFn<T extends BuenoConfig = BuenoConfig> = (env: string) => UserConfig<T> | Promise<UserConfig<T>>;

/**
 * Configuration value type for a given key path
 */
export type ConfigValueForKey<TKey extends string> = TKey extends `${infer T}.${infer Rest}`
	? T extends keyof BuenoConfig
		? Rest extends string
			? ConfigValueForKey<Rest>
			: BuenoConfig[T]
		: unknown
	: TKey extends keyof BuenoConfig
		? BuenoConfig[TKey]
		: unknown;

// ============= Default Configuration =============

export const DEFAULT_CONFIG: Required<BuenoConfig> = {
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
		pretty: true,
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

// ============= Environment Variable Mappings =============

export interface EnvMapping {
	/** Environment variable name */
	envVar: string;
	/** Config key path (dot notation) */
	configKey: string;
	/** Optional transformer function */
	transform?: (value: string) => unknown;
}

export const ENV_MAPPINGS: EnvMapping[] = [
	// Server
	{ envVar: "BUENO_PORT", configKey: "server.port", transform: (v) => parseInt(v, 10) },
	{ envVar: "BUENO_HOST", configKey: "server.host" },
	{ envVar: "BUENO_DEV", configKey: "server.development", transform: (v) => v === "true" },
	{ envVar: "PORT", configKey: "server.port", transform: (v) => parseInt(v, 10) },
	{ envVar: "HOST", configKey: "server.host" },

	// Database
	{ envVar: "DATABASE_URL", configKey: "database.url" },
	{ envVar: "BUENO_DATABASE_URL", configKey: "database.url" },
	{ envVar: "BUENO_DB_POOL_SIZE", configKey: "database.poolSize", transform: (v) => parseInt(v, 10) },
	{ envVar: "BUENO_DB_METRICS", configKey: "database.enableMetrics", transform: (v) => v === "true" },
	{ envVar: "BUENO_DB_SLOW_QUERY", configKey: "database.slowQueryThreshold", transform: (v) => parseInt(v, 10) },

	// Cache
	{ envVar: "REDIS_URL", configKey: "cache.url" },
	{ envVar: "BUENO_REDIS_URL", configKey: "cache.url" },
	{ envVar: "BUENO_CACHE_DRIVER", configKey: "cache.driver" },
	{ envVar: "BUENO_CACHE_TTL", configKey: "cache.ttl", transform: (v) => parseInt(v, 10) },
	{ envVar: "BUENO_CACHE_PREFIX", configKey: "cache.keyPrefix" },

	// Logger
	{ envVar: "LOG_LEVEL", configKey: "logger.level" },
	{ envVar: "BUENO_LOG_LEVEL", configKey: "logger.level" },
	{ envVar: "BUENO_LOG_PRETTY", configKey: "logger.pretty", transform: (v) => v === "true" },

	// Health
	{ envVar: "BUENO_HEALTH_ENABLED", configKey: "health.enabled", transform: (v) => v === "true" },
	{ envVar: "BUENO_HEALTH_PATH", configKey: "health.healthPath" },
	{ envVar: "BUENO_READY_PATH", configKey: "health.readyPath" },

	// Metrics
	{ envVar: "BUENO_METRICS_ENABLED", configKey: "metrics.enabled", transform: (v) => v === "true" },
	{ envVar: "BUENO_METRICS_INTERVAL", configKey: "metrics.collectInterval", transform: (v) => parseInt(v, 10) },

	// Telemetry
	{ envVar: "BUENO_TELEMETRY_ENABLED", configKey: "telemetry.enabled", transform: (v) => v === "true" },
	{ envVar: "BUENO_SERVICE_NAME", configKey: "telemetry.serviceName" },
	{ envVar: "BUENO_OTEL_ENDPOINT", configKey: "telemetry.endpoint" },
	{ envVar: "OTEL_EXPORTER_OTLP_ENDPOINT", configKey: "telemetry.endpoint" },

	// Frontend
	{ envVar: "BUENO_FRONTEND_PORT", configKey: "frontend.port", transform: (v) => parseInt(v, 10) },
	{ envVar: "BUENO_HMR", configKey: "frontend.hmr", transform: (v) => v === "true" },
];