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

// ============= Jobs Configuration =============

export interface JobsConfig {
	/** Enable background jobs */
	enabled?: boolean;
	/** Job queue driver type */
	driver?: "redis" | "memory";
	/** Redis connection URL */
	url?: string;
	/** Key prefix for jobs (default: 'jobs:') */
	keyPrefix?: string;
	/** Max concurrent jobs (default: 10) */
	concurrency?: number;
	/** Max retry attempts (default: 3) */
	maxRetries?: number;
	/** Retry delay in seconds (default: 1) */
	retryDelay?: number;
	/** Job batch size (default: 10) */
	batchSize?: number;
	/** Poll interval in milliseconds (default: 1000) */
	pollInterval?: number;
	/** Job timeout in milliseconds (default: 300000 / 5 minutes) */
	jobTimeout?: number;
	/** Enable metrics collection */
	enableMetrics?: boolean;
}

// ============= Mailer Configuration =============

export interface MailerConfig {
	/** Enable mailer service */
	enabled?: boolean;
	/** Mailer driver type */
	driver?: "smtp" | "sendgrid" | "brevo" | "resend" | "mock";
	/** Default from email address */
	from?: string;
	/** Default from name */
	fromName?: string;
	/** SMTP configuration (if driver is 'smtp') */
	smtp?: {
		host: string;
		port: number;
		secure?: boolean;
		username?: string;
		password?: string;
	};
	/** API credentials (for sendgrid, brevo, resend) */
	apiKey?: string;
	/** Enable dry run mode (log instead of sending) */
	dryRun?: boolean;
	/** Enable metrics collection */
	enableMetrics?: boolean;
	/** Enable job queue integration for async sending */
	queue?: boolean;
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
	/** Jobs configuration */
	jobs?: JobsConfig;
	/** Mailer configuration */
	mailer?: MailerConfig;
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
	jobs: {
		enabled: false,
		driver: "memory",
		url: undefined,
		keyPrefix: "jobs:",
		concurrency: 10,
		maxRetries: 3,
		retryDelay: 1,
		batchSize: 10,
		pollInterval: 1000,
		jobTimeout: 300000,
		enableMetrics: true,
	},
	mailer: {
		enabled: false,
		driver: "mock",
		from: "noreply@example.com",
		fromName: "Bueno App",
		dryRun: false,
		enableMetrics: true,
		queue: false,
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

	// Jobs
	{ envVar: "BUENO_JOBS_ENABLED", configKey: "jobs.enabled", transform: (v) => v === "true" },
	{ envVar: "BUENO_JOBS_DRIVER", configKey: "jobs.driver" },
	{ envVar: "BUENO_JOBS_URL", configKey: "jobs.url" },
	{ envVar: "BUENO_JOBS_CONCURRENCY", configKey: "jobs.concurrency", transform: (v) => parseInt(v, 10) },
	{ envVar: "BUENO_JOBS_MAX_RETRIES", configKey: "jobs.maxRetries", transform: (v) => parseInt(v, 10) },
	{ envVar: "BUENO_JOBS_RETRY_DELAY", configKey: "jobs.retryDelay", transform: (v) => parseInt(v, 10) },
	{ envVar: "BUENO_JOBS_BATCH_SIZE", configKey: "jobs.batchSize", transform: (v) => parseInt(v, 10) },
	{ envVar: "BUENO_JOBS_POLL_INTERVAL", configKey: "jobs.pollInterval", transform: (v) => parseInt(v, 10) },
	{ envVar: "BUENO_JOBS_TIMEOUT", configKey: "jobs.jobTimeout", transform: (v) => parseInt(v, 10) },

	// Mailer
	{ envVar: "BUENO_MAILER_ENABLED", configKey: "mailer.enabled", transform: (v) => v === "true" },
	{ envVar: "BUENO_MAILER_DRIVER", configKey: "mailer.driver" },
	{ envVar: "BUENO_MAILER_FROM", configKey: "mailer.from" },
	{ envVar: "BUENO_MAILER_FROM_NAME", configKey: "mailer.fromName" },
	{ envVar: "BUENO_MAILER_API_KEY", configKey: "mailer.apiKey" },
	{ envVar: "BUENO_MAILER_DRY_RUN", configKey: "mailer.dryRun", transform: (v) => v === "true" },
	{ envVar: "BUENO_MAILER_QUEUE", configKey: "mailer.queue", transform: (v) => v === "true" },
	{ envVar: "BUENO_SMTP_HOST", configKey: "mailer.smtp.host" },
	{ envVar: "BUENO_SMTP_PORT", configKey: "mailer.smtp.port", transform: (v) => parseInt(v, 10) },
	{ envVar: "BUENO_SMTP_USER", configKey: "mailer.smtp.username" },
	{ envVar: "BUENO_SMTP_PASSWORD", configKey: "mailer.smtp.password" },
	{ envVar: "BUENO_SMTP_SECURE", configKey: "mailer.smtp.secure", transform: (v) => v === "true" },

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