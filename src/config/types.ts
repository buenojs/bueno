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

// ============= Template Configuration =============

export interface TemplateConfig {
	/** Enable template system */
	enabled?: boolean;
	/** Base path to templates directory (default: 'resources/templates') */
	basePath?: string;
	/** Cache configuration */
	cache?: {
		/** Enable template caching (default: true) */
		enabled?: boolean;
		/** Cache TTL in seconds (default: 3600) */
		ttl?: number;
		/** Maximum templates in cache (default: 100) */
		maxSize?: number;
	};
	/** Enable file watching for hot reload in development */
	watch?: boolean;
	/** Default output format: 'html' or 'text' */
	defaultFormat?: "html" | "text";
	/** Channel to variant mapping for auto-detection */
	channelVariantMap?: Record<string, string>;
}

// ============= Notification Configuration =============

export interface NotificationConfig {
	/** Enable notification service */
	enabled?: boolean;
	/** Enable metrics collection */
	enableMetrics?: boolean;
	/** Default channel for sending */
	defaultChannel?: string;
	/** Enable job queue integration for async sending */
	queue?: boolean;
	/** Email channel configuration */
	email?: {
		enabled?: boolean;
		driver?: "smtp" | "sendgrid" | "brevo" | "resend";
		from?: string;
		fromName?: string;
		dryRun?: boolean;
		smtp?: {
			host?: string;
			port?: number;
			secure?: boolean;
			username?: string;
			password?: string;
		};
		apiKey?: string;
	};
	/** SMS channel configuration */
	sms?: {
		enabled?: boolean;
		driver?: "twilio" | "aws-sns" | "custom";
		dryRun?: boolean;
		accountSid?: string;
		authToken?: string;
		fromNumber?: string;
		apiKey?: string;
	};
	/** WhatsApp channel configuration */
	whatsapp?: {
		enabled?: boolean;
		driver?: "twilio" | "custom";
		dryRun?: boolean;
		accountSid?: string;
		authToken?: string;
		businessPhoneNumber?: string;
		apiKey?: string;
	};
	/** Push notification channel configuration */
	push?: {
		enabled?: boolean;
		driver?: "firebase" | "apns" | "custom";
		dryRun?: boolean;
		serverKey?: string;
		certificatePath?: string;
		apiKey?: string;
	};
}

// ============= i18n Configuration =============

export interface I18nConfig {
	/** Enable i18n system */
	enabled?: boolean;
	/** Default locale — used as fallback when requested locale has missing keys (default: "en") */
	defaultLocale?: string;
	/** List of supported locale identifiers (default: ["en"]) */
	supportedLocales?: string[];
	/** Base directory for locale JSON files (default: "resources/i18n") */
	basePath?: string;
	/**
	 * Fall back to defaultLocale when a key is missing in the requested locale.
	 * (default: true)
	 */
	fallbackToDefault?: boolean;
	/** Cookie name used to persist locale choice (default: "bueno_locale") */
	cookieName?: string;
	/** Cookie max-age in seconds (default: 31536000 — 1 year) */
	cookieMaxAge?: number;
	/** Enable file watching for hot reload in development */
	watch?: boolean;
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
	/** Template configuration */
	template?: TemplateConfig;
	/** Notification configuration */
	notification?: NotificationConfig;
	/** i18n configuration */
	i18n?: I18nConfig;
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
	template: {
		enabled: true,
		basePath: "resources/templates",
		cache: {
			enabled: true,
			ttl: 3600,
			maxSize: 100,
		},
		watch: false,
		defaultFormat: "html",
		channelVariantMap: {
			email: "email",
			sms: "sms",
			push: "push",
			whatsapp: "whatsapp",
			web: "web",
		},
	},
	notification: {
		enabled: false,
		enableMetrics: true,
		queue: false,
		defaultChannel: "email",
		email: {
			enabled: true,
			driver: "smtp",
			from: "noreply@example.com",
			fromName: "Bueno App",
			dryRun: false,
		},
		sms: {
			enabled: false,
			driver: "twilio",
			dryRun: false,
		},
		whatsapp: {
			enabled: false,
			driver: "twilio",
			dryRun: false,
		},
		push: {
			enabled: false,
			driver: "firebase",
			dryRun: false,
		},
	},
	i18n: {
		enabled: false,
		defaultLocale: "en",
		supportedLocales: ["en"],
		basePath: "resources/i18n",
		fallbackToDefault: true,
		cookieName: "bueno_locale",
		cookieMaxAge: 31536000,
		watch: false,
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

	// Template
	{ envVar: "BUENO_TEMPLATE_ENABLED", configKey: "template.enabled", transform: (v) => v === "true" },
	{ envVar: "BUENO_TEMPLATE_BASE_PATH", configKey: "template.basePath" },
	{ envVar: "BUENO_TEMPLATE_CACHE_ENABLED", configKey: "template.cache.enabled", transform: (v) => v === "true" },
	{ envVar: "BUENO_TEMPLATE_CACHE_TTL", configKey: "template.cache.ttl", transform: (v) => parseInt(v, 10) },
	{ envVar: "BUENO_TEMPLATE_CACHE_MAX_SIZE", configKey: "template.cache.maxSize", transform: (v) => parseInt(v, 10) },
	{ envVar: "BUENO_TEMPLATE_WATCH", configKey: "template.watch", transform: (v) => v === "true" },
	{ envVar: "BUENO_TEMPLATE_DEFAULT_FORMAT", configKey: "template.defaultFormat" },

	// Notification
	{ envVar: "BUENO_NOTIFICATION_ENABLED", configKey: "notification.enabled", transform: (v) => v === "true" },
	{ envVar: "BUENO_NOTIFICATION_METRICS", configKey: "notification.enableMetrics", transform: (v) => v === "true" },
	{ envVar: "BUENO_NOTIFICATION_QUEUE", configKey: "notification.queue", transform: (v) => v === "true" },
	{ envVar: "BUENO_NOTIFICATION_DEFAULT", configKey: "notification.defaultChannel" },

	// Email Channel
	{ envVar: "BUENO_EMAIL_ENABLED", configKey: "notification.email.enabled", transform: (v) => v === "true" },
	{ envVar: "BUENO_EMAIL_DRIVER", configKey: "notification.email.driver" },
	{ envVar: "BUENO_EMAIL_FROM", configKey: "notification.email.from" },
	{ envVar: "BUENO_EMAIL_FROM_NAME", configKey: "notification.email.fromName" },
	{ envVar: "BUENO_EMAIL_API_KEY", configKey: "notification.email.apiKey" },
	{ envVar: "BUENO_EMAIL_DRY_RUN", configKey: "notification.email.dryRun", transform: (v) => v === "true" },
	{ envVar: "BUENO_SMTP_HOST", configKey: "notification.email.smtp.host" },
	{ envVar: "BUENO_SMTP_PORT", configKey: "notification.email.smtp.port", transform: (v) => parseInt(v, 10) },
	{ envVar: "BUENO_SMTP_USER", configKey: "notification.email.smtp.username" },
	{ envVar: "BUENO_SMTP_PASSWORD", configKey: "notification.email.smtp.password" },
	{ envVar: "BUENO_SMTP_SECURE", configKey: "notification.email.smtp.secure", transform: (v) => v === "true" },

	// SMS Channel
	{ envVar: "BUENO_SMS_ENABLED", configKey: "notification.sms.enabled", transform: (v) => v === "true" },
	{ envVar: "BUENO_SMS_DRIVER", configKey: "notification.sms.driver" },
	{ envVar: "BUENO_SMS_DRY_RUN", configKey: "notification.sms.dryRun", transform: (v) => v === "true" },
	{ envVar: "BUENO_SMS_ACCOUNT_SID", configKey: "notification.sms.accountSid" },
	{ envVar: "BUENO_SMS_AUTH_TOKEN", configKey: "notification.sms.authToken" },
	{ envVar: "BUENO_SMS_FROM_NUMBER", configKey: "notification.sms.fromNumber" },

	// WhatsApp Channel
	{ envVar: "BUENO_WHATSAPP_ENABLED", configKey: "notification.whatsapp.enabled", transform: (v) => v === "true" },
	{ envVar: "BUENO_WHATSAPP_DRIVER", configKey: "notification.whatsapp.driver" },
	{ envVar: "BUENO_WHATSAPP_DRY_RUN", configKey: "notification.whatsapp.dryRun", transform: (v) => v === "true" },
	{ envVar: "BUENO_WHATSAPP_ACCOUNT_SID", configKey: "notification.whatsapp.accountSid" },
	{ envVar: "BUENO_WHATSAPP_AUTH_TOKEN", configKey: "notification.whatsapp.authToken" },
	{ envVar: "BUENO_WHATSAPP_BUSINESS_PHONE", configKey: "notification.whatsapp.businessPhoneNumber" },

	// Push Channel
	{ envVar: "BUENO_PUSH_ENABLED", configKey: "notification.push.enabled", transform: (v) => v === "true" },
	{ envVar: "BUENO_PUSH_DRIVER", configKey: "notification.push.driver" },
	{ envVar: "BUENO_PUSH_DRY_RUN", configKey: "notification.push.dryRun", transform: (v) => v === "true" },
	{ envVar: "BUENO_PUSH_SERVER_KEY", configKey: "notification.push.serverKey" },
	{ envVar: "BUENO_PUSH_CERTIFICATE_PATH", configKey: "notification.push.certificatePath" },

	// i18n
	{ envVar: "BUENO_I18N_ENABLED", configKey: "i18n.enabled", transform: (v) => v === "true" },
	{ envVar: "BUENO_I18N_DEFAULT_LOCALE", configKey: "i18n.defaultLocale" },
	{ envVar: "BUENO_I18N_SUPPORTED_LOCALES", configKey: "i18n.supportedLocales", transform: (v) => v.split(",").map((s) => s.trim()) },
	{ envVar: "BUENO_I18N_BASE_PATH", configKey: "i18n.basePath" },
	{ envVar: "BUENO_I18N_FALLBACK", configKey: "i18n.fallbackToDefault", transform: (v) => v === "true" },
	{ envVar: "BUENO_I18N_COOKIE_NAME", configKey: "i18n.cookieName" },
	{ envVar: "BUENO_I18N_COOKIE_MAX_AGE", configKey: "i18n.cookieMaxAge", transform: (v) => parseInt(v, 10) },
	{ envVar: "BUENO_I18N_WATCH", configKey: "i18n.watch", transform: (v) => v === "true" },

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