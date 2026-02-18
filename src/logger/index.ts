/**
 * Structured Logging System
 *
 * Provides structured logging with JSON output, log levels,
 * context-aware logging, and performance metrics.
 */

// ============= Types =============

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
	level: LogLevel;
	message: string;
	timestamp: string;
	context?: Record<string, unknown>;
	error?: {
		name: string;
		message: string;
		stack?: string;
	};
	duration?: number;
	[key: string]: unknown;
}

export interface LoggerConfig {
	level?: LogLevel;
	pretty?: boolean;
	timestamp?: boolean;
	context?: Record<string, unknown>;
	output?: "console" | "stdout" | ((entry: LogEntry) => void);
}

export interface LoggerContext {
	requestId?: string;
	userId?: string;
	method?: string;
	path?: string;
	[key: string]: unknown;
}

// ============= Log Level Priority =============

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	fatal: 4,
};

// ============= Logger Class =============

export class Logger {
	private level: LogLevel;
	private pretty: boolean;
	private timestamp: boolean;
	private context: Record<string, unknown>;
	private output: (entry: LogEntry) => void;

	constructor(config: LoggerConfig = {}) {
		this.level = config.level ?? "info";
		this.pretty = config.pretty ?? process.env.NODE_ENV !== "production";
		this.timestamp = config.timestamp ?? true;
		this.context = config.context ?? {};

		if (typeof config.output === "function") {
			this.output = config.output;
		} else if (config.output === "stdout") {
			this.output = (entry) => console.log(this.serialize(entry));
		} else {
			this.output = (entry) => {
				if (this.pretty) {
					this.prettyPrint(entry);
				} else {
					console.log(this.serialize(entry));
				}
			};
		}
	}

	/**
	 * Check if a log level should be logged
	 */
	private shouldLog(level: LogLevel): boolean {
		return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
	}

	/**
	 * Serialize log entry to JSON
	 */
	private serialize(entry: LogEntry): string {
		return JSON.stringify(entry);
	}

	/**
	 * Pretty print log entry
	 */
	private prettyPrint(entry: LogEntry): void {
		const timestamp = entry.timestamp;
		const levelColors: Record<LogLevel, string> = {
			debug: "\x1b[36m", // cyan
			info: "\x1b[32m", // green
			warn: "\x1b[33m", // yellow
			error: "\x1b[31m", // red
			fatal: "\x1b[35m", // magenta
		};
		const reset = "\x1b[0m";
		const color = levelColors[entry.level];

		let output = `${timestamp} ${color}[${entry.level.toUpperCase()}]${reset} ${entry.message}`;

		if (entry.context && Object.keys(entry.context).length > 0) {
			output += ` ${reset}\x1b[90m${JSON.stringify(entry.context)}\x1b[0m`;
		}

		if (entry.duration !== undefined) {
			output += ` \x1b[90m(${entry.duration}ms)\x1b[0m`;
		}

		if (entry.error) {
			output += `\n  \x1b[31m${entry.error.name}: ${entry.error.message}\x1b[0m`;
			if (entry.error.stack) {
				output += `\n  \x1b[90m${entry.error.stack}\x1b[0m`;
			}
		}

		switch (entry.level) {
			case "error":
			case "fatal":
				console.error(output);
				break;
			case "warn":
				console.warn(output);
				break;
			default:
				console.log(output);
		}
	}

	/**
	 * Create a log entry
	 */
	private createEntry(
		level: LogLevel,
		message: string,
		context?: Record<string, unknown>,
		error?: Error,
	): LogEntry {
		const entry: LogEntry = {
			level,
			message,
			timestamp: this.timestamp ? new Date().toISOString() : "",
			...this.context,
		};

		if (context) {
			entry.context = context;
		}

		if (error) {
			entry.error = {
				name: error.name,
				message: error.message,
				stack: error.stack,
			};
		}

		return entry;
	}

	/**
	 * Log a debug message
	 */
	debug(message: string, context?: Record<string, unknown>): void {
		if (!this.shouldLog("debug")) return;
		this.output(this.createEntry("debug", message, context));
	}

	/**
	 * Log an info message
	 */
	info(message: string, context?: Record<string, unknown>): void {
		if (!this.shouldLog("info")) return;
		this.output(this.createEntry("info", message, context));
	}

	/**
	 * Log a warning message
	 */
	warn(message: string, context?: Record<string, unknown>): void {
		if (!this.shouldLog("warn")) return;
		this.output(this.createEntry("warn", message, context));
	}

	/**
	 * Log an error message
	 */
	error(
		message: string,
		error?: Error | unknown,
		context?: Record<string, unknown>,
	): void {
		if (!this.shouldLog("error")) return;
		const err = error instanceof Error ? error : undefined;
		this.output(this.createEntry("error", message, context, err));
	}

	/**
	 * Log a fatal message
	 */
	fatal(
		message: string,
		error?: Error | unknown,
		context?: Record<string, unknown>,
	): void {
		if (!this.shouldLog("fatal")) return;
		const err = error instanceof Error ? error : undefined;
		this.output(this.createEntry("fatal", message, context, err));
	}

	/**
	 * Create a child logger with additional context
	 */
	child(context: Record<string, unknown>): Logger {
		return new Logger({
			level: this.level,
			pretty: this.pretty,
			timestamp: this.timestamp,
			context: { ...this.context, ...context },
			output: this.output,
		});
	}

	/**
	 * Set log level
	 */
	setLevel(level: LogLevel): void {
		this.level = level;
	}

	/**
	 * Add context to the logger
	 */
	addContext(context: Record<string, unknown>): void {
		Object.assign(this.context, context);
	}

	/**
	 * Time a function
	 */
	async time<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
		const start = Date.now();

		try {
			const result = await fn();
			this.debug(`${label} completed`, { duration: Date.now() - start });
			return result;
		} catch (error) {
			this.error(`${label} failed`, error, { duration: Date.now() - start });
			throw error;
		}
	}

	/**
	 * Create a timer
	 */
	startTimer(label: string): () => number {
		const start = Date.now();
		return () => {
			const duration = Date.now() - start;
			this.debug(`${label}`, { duration });
			return duration;
		};
	}
}

// ============= Request Logger =============

export interface RequestLogContext {
	requestId?: string;
	method: string;
	path: string;
	query?: string;
	ip?: string;
	userAgent?: string;
	userId?: string;
}

export interface ResponseLogContext extends RequestLogContext {
	statusCode: number;
	duration: number;
	contentLength?: number;
}

/**
 * Create a request logger middleware
 */
export function createRequestLogger(logger: Logger) {
	return async (ctx: unknown, next: () => Promise<unknown>) => {
		const context = ctx as {
			method: string;
			path: string;
			url: URL;
			getHeader: (name: string) => string | undefined;
			ip?: string;
			set: (key: string, value: unknown) => void;
			get: (key: string) => unknown;
		};
		const start = Date.now();
		const requestId = context.getHeader("x-request-id") || crypto.randomUUID();

		context.set("requestId", requestId);

		// Log request
		const requestContext: Record<string, unknown> = {
			requestId,
			method: context.method,
			path: context.path,
			query: context.url?.search,
			ip: context.ip,
			userAgent: context.getHeader("user-agent"),
		};

		logger.info("Request started", requestContext);

		try {
			const response = await next();

			// Log response
			const duration = Date.now() - start;
			const responseContext: Record<string, unknown> = {
				...requestContext,
				statusCode: (response as Response)?.status ?? 200,
				duration,
			};

			logger.info("Request completed", responseContext);

			return response;
		} catch (error) {
			const duration = Date.now() - start;
			logger.error("Request failed", error, {
				...requestContext,
				duration,
			});
			throw error;
		}
	};
}

// ============= Performance Logger =============

export class PerformanceLogger {
	private logger: Logger;
	private metrics: Map<string, number[]> = new Map();

	constructor(logger: Logger) {
		this.logger = logger;
	}

	/**
	 * Record a metric
	 */
	record(name: string, value: number): void {
		if (!this.metrics.has(name)) {
			this.metrics.set(name, []);
		}
		this.metrics.get(name)?.push(value);
	}

	/**
	 * Get metric statistics
	 */
	stats(
		name: string,
	): {
		count: number;
		min: number;
		max: number;
		avg: number;
		p99: number;
	} | null {
		const values = this.metrics.get(name);
		if (!values || values.length === 0) return null;

		const sorted = [...values].sort((a, b) => a - b);
		const count = sorted.length;
		const min = sorted[0];
		const max = sorted[count - 1];
		const avg = sorted.reduce((a, b) => a + b, 0) / count;
		const p99Index = Math.floor(count * 0.99);
		const p99 = sorted[p99Index];

		return { count, min, max, avg, p99 };
	}

	/**
	 * Log all metrics
	 */
	logMetrics(): void {
		for (const [name] of this.metrics) {
			const stats = this.stats(name);
			if (stats) {
				this.logger.info(`Metric: ${name}`, stats);
			}
		}
	}

	/**
	 * Clear all metrics
	 */
	clear(): void {
		this.metrics.clear();
	}
}

// ============= Default Logger Instance =============

let defaultLogger: Logger | null = null;

/**
 * Get the default logger instance
 */
export function getLogger(): Logger {
	if (!defaultLogger) {
		defaultLogger = new Logger();
	}
	return defaultLogger;
}

/**
 * Set the default logger instance
 */
export function setLogger(logger: Logger): void {
	defaultLogger = logger;
}

/**
 * Create a new logger
 */
export function createLogger(config?: LoggerConfig): Logger {
	return new Logger(config);
}
