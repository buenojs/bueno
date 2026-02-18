/**
 * Log Transport System
 *
 * Provides transport implementations for external log aggregation services
 * like Datadog, generic HTTP webhooks, and console output.
 */

import type { LogEntry, LogLevel, LoggerConfig } from "../index";

// ============= Types =============

/**
 * Error callback for transport errors
 */
export type TransportErrorCallback = (error: Error, transport: LogTransport) => void;

/**
 * Base interface for log transports
 */
export interface LogTransport {
	/** Transport name for identification */
	readonly name: string;

	/** Send a single log entry */
	send(entry: LogEntry): Promise<void>;

	/** Send multiple log entries (batch) */
	sendBatch(entries: LogEntry[]): Promise<void>;

	/** Flush any pending logs */
	flush?(): Promise<void>;

	/** Close the transport and cleanup resources */
	close?(): Promise<void>;
}

/**
 * Options for retry behavior
 */
export interface RetryOptions {
	/** Maximum number of retry attempts */
	maxRetries: number;
	/** Initial delay in milliseconds */
	initialDelay: number;
	/** Maximum delay in milliseconds */
	maxDelay: number;
	/** Backoff multiplier */
	backoffMultiplier: number;
}

/**
 * Options for batching behavior
 */
export interface BatchOptions {
	/** Maximum batch size before auto-flush */
	batchSize: number;
	/** Flush interval in milliseconds */
	flushInterval: number;
}

// ============= HTTP Webhook Transport =============

/**
 * Options for HTTPWebhookTransport
 */
export interface HTTPWebhookTransportOptions {
	/** Webhook URL */
	url: string;
	/** Additional headers */
	headers?: Record<string, string>;
	/** Batch options */
	batchSize?: number;
	/** Flush interval in milliseconds */
	flushInterval?: number;
	/** Retry options */
	retries?: Partial<RetryOptions>;
	/** Error callback */
	onError?: TransportErrorCallback;
	/** Request timeout in milliseconds */
	timeout?: number;
}

/**
 * Generic HTTP webhook transport for sending logs to any HTTP endpoint
 */
export class HTTPWebhookTransport implements LogTransport {
	readonly name = "HTTPWebhookTransport";
	private url: string;
	private headers: Record<string, string>;
	private batchSize: number;
	private flushInterval: number;
	private retryOptions: RetryOptions;
	private onError?: TransportErrorCallback;
	private timeout: number;
	private queue: LogEntry[] = [];
	private flushTimer: ReturnType<typeof setInterval> | null = null;
	private isFlushing = false;
	private isClosed = false;

	constructor(options: HTTPWebhookTransportOptions) {
		this.url = options.url;
		this.headers = options.headers ?? {};
		this.batchSize = options.batchSize ?? 100;
		this.flushInterval = options.flushInterval ?? 5000;
		this.timeout = options.timeout ?? 30000;
		this.retryOptions = {
			maxRetries: 3,
			initialDelay: 100,
			maxDelay: 10000,
			backoffMultiplier: 2,
			...options.retries,
		};
		this.onError = options.onError;

		this.startFlushTimer();
	}

	/**
	 * Start the flush timer
	 */
	private startFlushTimer(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
		}
		this.flushTimer = setInterval(() => {
			this.flush().catch((err) => this.handleError(err));
		}, this.flushInterval);
	}

	/**
	 * Send a single log entry
	 */
	async send(entry: LogEntry): Promise<void> {
		if (this.isClosed) return;

		this.queue.push(entry);

		if (this.queue.length >= this.batchSize) {
			await this.flush();
		}
	}

	/**
	 * Send multiple log entries
	 */
	async sendBatch(entries: LogEntry[]): Promise<void> {
		if (this.isClosed) return;

		this.queue.push(...entries);

		if (this.queue.length >= this.batchSize) {
			await this.flush();
		}
	}

	/**
	 * Flush pending logs
	 */
	async flush(): Promise<void> {
		if (this.isFlushing || this.queue.length === 0 || this.isClosed) return;

		this.isFlushing = true;
		const entriesToSend = [...this.queue];
		this.queue = [];

		try {
			await this.sendWithRetry(entriesToSend);
		} catch (error) {
			// Re-add entries to queue on failure
			this.queue.unshift(...entriesToSend);
			throw error;
		} finally {
			this.isFlushing = false;
		}
	}

	/**
	 * Send entries with retry logic
	 */
	private async sendWithRetry(entries: LogEntry[]): Promise<void> {
		let lastError: Error | null = null;
		let delay = this.retryOptions.initialDelay;

		for (let attempt = 0; attempt <= this.retryOptions.maxRetries; attempt++) {
			try {
				await this.makeRequest(entries);
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < this.retryOptions.maxRetries) {
					await this.sleep(delay);
					delay = Math.min(
						delay * this.retryOptions.backoffMultiplier,
						this.retryOptions.maxDelay
					);
				}
			}
		}

		throw lastError;
	}

	/**
	 * Make HTTP request
	 */
	private async makeRequest(entries: LogEntry[]): Promise<void> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const response = await fetch(this.url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...this.headers,
				},
				body: JSON.stringify(entries),
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Sleep utility
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Handle errors
	 */
	private handleError(error: Error): void {
		if (this.onError) {
			this.onError(error, this);
		}
	}

	/**
	 * Close the transport
	 */
	async close(): Promise<void> {
		this.isClosed = true;

		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}

		// Flush remaining entries
		if (this.queue.length > 0) {
			try {
				await this.flush();
			} catch (error) {
				this.handleError(error instanceof Error ? error : new Error(String(error)));
			}
		}
	}
}

// ============= Datadog Transport =============

/**
 * Options for DatadogTransport
 */
export interface DatadogTransportOptions {
	/** Datadog API key */
	apiKey: string;
	/** Service name */
	service: string;
	/** Environment (e.g., production, staging) */
	env?: string;
	/** Hostname */
	hostname?: string;
	/** Default tags */
	tags?: string[];
	/** Batch options */
	batchSize?: number;
	/** Flush interval in milliseconds */
	flushInterval?: number;
	/** Retry options */
	retries?: Partial<RetryOptions>;
	/** Error callback */
	onError?: TransportErrorCallback;
	/** Custom Datadog API endpoint */
	endpoint?: string;
	/** Request timeout in milliseconds */
	timeout?: number;
}

/**
 * Datadog log entry format
 */
interface DatadogLogEntry {
	ddsource: string;
	ddsourcecategory: string;
	ddtags: string;
	hostname: string;
	service: string;
	status: string;
	message: string;
	timestamp: string;
	[key: string]: unknown;
}

/**
 * Datadog Logs API transport
 */
export class DatadogTransport implements LogTransport {
	readonly name = "DatadogTransport";
	private apiKey: string;
	private service: string;
	private env: string;
	private hostname: string;
	private tags: string[];
	private endpoint: string;
	private batchSize: number;
	private flushInterval: number;
	private retryOptions: RetryOptions;
	private onError?: TransportErrorCallback;
	private timeout: number;
	private queue: LogEntry[] = [];
	private flushTimer: ReturnType<typeof setInterval> | null = null;
	private isFlushing = false;
	private isClosed = false;

	constructor(options: DatadogTransportOptions) {
		this.apiKey = options.apiKey;
		this.service = options.service;
		this.env = options.env ?? process.env.NODE_ENV ?? "development";
		this.hostname = options.hostname ?? this.getDefaultHostname();
		this.tags = options.tags ?? [];
		this.endpoint = options.endpoint ?? "https://http-intake.logs.datadoghq.com/v1/input";
		this.batchSize = options.batchSize ?? 100;
		this.flushInterval = options.flushInterval ?? 5000;
		this.timeout = options.timeout ?? 30000;
		this.retryOptions = {
			maxRetries: 3,
			initialDelay: 100,
			maxDelay: 10000,
			backoffMultiplier: 2,
			...options.retries,
		};
		this.onError = options.onError;

		this.startFlushTimer();
	}

	/**
	 * Get default hostname
	 */
	private getDefaultHostname(): string {
		try {
			return process.env.HOSTNAME ?? process.env.COMPUTERNAME ?? "unknown";
		} catch {
			return "unknown";
		}
	}

	/**
	 * Start the flush timer
	 */
	private startFlushTimer(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
		}
		this.flushTimer = setInterval(() => {
			this.flush().catch((err) => this.handleError(err));
		}, this.flushInterval);
	}

	/**
	 * Convert log level to Datadog status
	 */
	private toDatadogStatus(level: LogLevel): string {
		const statusMap: Record<LogLevel, string> = {
			debug: "debug",
			info: "info",
			warn: "warn",
			error: "error",
			fatal: "emerg",
		};
		return statusMap[level];
	}

	/**
	 * Convert LogEntry to Datadog format
	 */
	private toDatadogFormat(entry: LogEntry): DatadogLogEntry {
		const allTags = [...this.tags];
		
		// Add environment tag
		if (this.env) {
			allTags.push(`env:${this.env}`);
		}

		// Add context as tags
		if (entry.context) {
			for (const [key, value] of Object.entries(entry.context)) {
				if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
					allTags.push(`${key}:${value}`);
				}
			}
		}

		const datadogEntry: DatadogLogEntry = {
			ddsource: "bueno",
			ddsourcecategory: "framework",
			ddtags: allTags.join(","),
			hostname: this.hostname,
			service: this.service,
			status: this.toDatadogStatus(entry.level),
			message: entry.message,
			timestamp: entry.timestamp,
		};

		// Add error details
		if (entry.error) {
			datadogEntry.error = {
				kind: entry.error.name,
				message: entry.error.message,
				stack: entry.error.stack,
			};
		}

		// Add duration if present
		if (entry.duration !== undefined) {
			datadogEntry.duration = entry.duration;
		}

		// Add any additional fields from the entry
		for (const [key, value] of Object.entries(entry)) {
			if (!["level", "message", "timestamp", "context", "error", "duration"].includes(key)) {
				datadogEntry[key] = value;
			}
		}

		return datadogEntry;
	}

	/**
	 * Send a single log entry
	 */
	async send(entry: LogEntry): Promise<void> {
		if (this.isClosed) return;

		this.queue.push(entry);

		if (this.queue.length >= this.batchSize) {
			await this.flush();
		}
	}

	/**
	 * Send multiple log entries
	 */
	async sendBatch(entries: LogEntry[]): Promise<void> {
		if (this.isClosed) return;

		this.queue.push(...entries);

		if (this.queue.length >= this.batchSize) {
			await this.flush();
		}
	}

	/**
	 * Flush pending logs
	 */
	async flush(): Promise<void> {
		if (this.isFlushing || this.queue.length === 0 || this.isClosed) return;

		this.isFlushing = true;
		const entriesToSend = [...this.queue];
		this.queue = [];

		try {
			await this.sendWithRetry(entriesToSend);
		} catch (error) {
			// Re-add entries to queue on failure
			this.queue.unshift(...entriesToSend);
			throw error;
		} finally {
			this.isFlushing = false;
		}
	}

	/**
	 * Send entries with retry logic
	 */
	private async sendWithRetry(entries: LogEntry[]): Promise<void> {
		let lastError: Error | null = null;
		let delay = this.retryOptions.initialDelay;

		for (let attempt = 0; attempt <= this.retryOptions.maxRetries; attempt++) {
			try {
				await this.makeRequest(entries);
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < this.retryOptions.maxRetries) {
					await this.sleep(delay);
					delay = Math.min(
						delay * this.retryOptions.backoffMultiplier,
						this.retryOptions.maxDelay
					);
				}
			}
		}

		throw lastError;
	}

	/**
	 * Make HTTP request to Datadog
	 */
	private async makeRequest(entries: LogEntry[]): Promise<void> {
		const datadogEntries = entries.map((e) => this.toDatadogFormat(e));

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const response = await fetch(this.endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"DD-API-KEY": this.apiKey,
				},
				body: datadogEntries.map((e) => JSON.stringify(e)).join("\n"),
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`Datadog API error: HTTP ${response.status}: ${response.statusText}`);
			}
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Sleep utility
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Handle errors
	 */
	private handleError(error: Error): void {
		if (this.onError) {
			this.onError(error, this);
		}
	}

	/**
	 * Close the transport
	 */
	async close(): Promise<void> {
		this.isClosed = true;

		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}

		// Flush remaining entries
		if (this.queue.length > 0) {
			try {
				await this.flush();
			} catch (error) {
				this.handleError(error instanceof Error ? error : new Error(String(error)));
			}
		}
	}
}

// ============= Console Transport =============

/**
 * Options for ConsoleTransport
 */
export interface ConsoleTransportOptions {
	/** Use pretty printing */
	pretty?: boolean;
	/** Output stream for logs */
	stream?: "stdout" | "stderr";
	/** Error callback */
	onError?: TransportErrorCallback;
}

/**
 * Enhanced console transport for local development
 */
export class ConsoleTransport implements LogTransport {
	readonly name = "ConsoleTransport";
	private pretty: boolean;
	private stream: "stdout" | "stderr";
	private onError?: TransportErrorCallback;

	constructor(options: ConsoleTransportOptions = {}) {
		this.pretty = options.pretty ?? process.env.NODE_ENV !== "production";
		this.stream = options.stream ?? "stdout";
		this.onError = options.onError;
	}

	/**
	 * Get level color for pretty printing
	 */
	private getLevelColor(level: LogLevel): string {
		const colors: Record<LogLevel, string> = {
			debug: "\x1b[36m", // cyan
			info: "\x1b[32m", // green
			warn: "\x1b[33m", // yellow
			error: "\x1b[31m", // red
			fatal: "\x1b[35m", // magenta
		};
		return colors[level];
	}

	/**
	 * Format log entry for console output
	 */
	private formatEntry(entry: LogEntry): string {
		if (this.pretty) {
			const color = this.getLevelColor(entry.level);
			const reset = "\x1b[0m";
			let output = `${entry.timestamp} ${color}[${entry.level.toUpperCase()}]${reset} ${entry.message}`;

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

			return output;
		}

		return JSON.stringify(entry);
	}

	/**
	 * Output to console
	 */
	private output(formatted: string, level: LogLevel): void {
		if (this.stream === "stderr" || level === "error" || level === "fatal") {
			console.error(formatted);
		} else if (level === "warn") {
			console.warn(formatted);
		} else {
			console.log(formatted);
		}
	}

	/**
	 * Send a single log entry
	 */
	async send(entry: LogEntry): Promise<void> {
		try {
			const formatted = this.formatEntry(entry);
			this.output(formatted, entry.level);
		} catch (error) {
			if (this.onError) {
				this.onError(error instanceof Error ? error : new Error(String(error)), this);
			}
		}
	}

	/**
	 * Send multiple log entries
	 */
	async sendBatch(entries: LogEntry[]): Promise<void> {
		for (const entry of entries) {
			await this.send(entry);
		}
	}

	/**
	 * Flush (no-op for console)
	 */
	async flush(): Promise<void> {
		// Console transport doesn't buffer
	}

	/**
	 * Close (no-op for console)
	 */
	async close(): Promise<void> {
		// Console transport doesn't need cleanup
	}
}

// ============= Transport Manager =============

/**
 * Manages multiple log transports
 */
export class TransportManager {
	private transports: Set<LogTransport> = new Set();
	private onError?: TransportErrorCallback;

	constructor(options?: { onError?: TransportErrorCallback }) {
		this.onError = options?.onError;
	}

	/**
	 * Add a transport
	 */
	addTransport(transport: LogTransport): void {
		this.transports.add(transport);
	}

	/**
	 * Remove a transport
	 */
	removeTransport(transport: LogTransport): boolean {
		return this.transports.delete(transport);
	}

	/**
	 * Get all transports
	 */
	getTransports(): LogTransport[] {
		return [...this.transports];
	}

	/**
	 * Check if a transport is registered
	 */
	hasTransport(transport: LogTransport): boolean {
		return this.transports.has(transport);
	}

	/**
	 * Clear all transports
	 */
	clearTransports(): void {
		this.transports.clear();
	}

	/**
	 * Broadcast a log entry to all transports
	 */
	async broadcast(entry: LogEntry): Promise<void> {
		const promises = [...this.transports].map(async (transport) => {
			try {
				await transport.send(entry);
			} catch (error) {
				if (this.onError) {
					this.onError(error instanceof Error ? error : new Error(String(error)), transport);
				}
			}
		});

		await Promise.allSettled(promises);
	}

	/**
	 * Broadcast multiple entries to all transports
	 */
	async broadcastBatch(entries: LogEntry[]): Promise<void> {
		const promises = [...this.transports].map(async (transport) => {
			try {
				await transport.sendBatch(entries);
			} catch (error) {
				if (this.onError) {
					this.onError(error instanceof Error ? error : new Error(String(error)), transport);
				}
			}
		});

		await Promise.allSettled(promises);
	}

	/**
	 * Flush all transports
	 */
	async flushAll(): Promise<void> {
		const promises = [...this.transports].map(async (transport) => {
			if (transport.flush) {
				try {
					await transport.flush();
				} catch (error) {
					if (this.onError) {
						this.onError(error instanceof Error ? error : new Error(String(error)), transport);
					}
				}
			}
		});

		await Promise.allSettled(promises);
	}

	/**
	 * Close all transports
	 */
	async closeAll(): Promise<void> {
		const promises = [...this.transports].map(async (transport) => {
			if (transport.close) {
				try {
					await transport.close();
				} catch (error) {
					if (this.onError) {
						this.onError(error instanceof Error ? error : new Error(String(error)), transport);
					}
				}
			}
		});

		await Promise.allSettled(promises);
		this.transports.clear();
	}
}

// ============= Logger Integration =============

import { Logger } from "../index";

/**
 * Configuration for logger with transports
 */
export interface LoggerWithTransportsConfig extends LoggerConfig {
	/** Transports to add to the logger */
	transports?: LogTransport[];
	/** Error callback for transport errors */
	onTransportError?: TransportErrorCallback;
}

/**
 * Logger with transport support
 */
export class LoggerWithTransports extends Logger {
	private transportManager: TransportManager;

	constructor(config: LoggerWithTransportsConfig = {}) {
		const { transports, onTransportError, ...loggerConfig } = config;
		
		// Create transport manager
		const transportManager = new TransportManager({ onError: onTransportError });
		
		// Add transports
		if (transports) {
			for (const transport of transports) {
				transportManager.addTransport(transport);
			}
		}

		// Create output function that broadcasts to transports
		const originalOutput = loggerConfig.output;
		const outputFn = (entry: LogEntry) => {
			// Call original output if specified
			if (originalOutput) {
				if (typeof originalOutput === "function") {
					originalOutput(entry);
				}
			} else {
				// Default console output
				console.log(JSON.stringify(entry));
			}

			// Broadcast to transports (async, fire-and-forget)
			transportManager.broadcast(entry).catch(() => {
				// Errors are handled by the transport manager
			});
		};

		super({
			...loggerConfig,
			output: outputFn,
		});

		this.transportManager = transportManager;
	}

	/**
	 * Add a transport
	 */
	addTransport(transport: LogTransport): void {
		this.transportManager.addTransport(transport);
	}

	/**
	 * Remove a transport
	 */
	removeTransport(transport: LogTransport): boolean {
		return this.transportManager.removeTransport(transport);
	}

	/**
	 * Get all transports
	 */
	getTransports(): LogTransport[] {
		return this.transportManager.getTransports();
	}

	/**
	 * Flush all transports
	 */
	async flushTransports(): Promise<void> {
		await this.transportManager.flushAll();
	}

	/**
	 * Close all transports
	 */
	async closeTransports(): Promise<void> {
		await this.transportManager.closeAll();
	}
}

/**
 * Create a logger with transports
 */
export function createLoggerWithTransports(
	config: LoggerWithTransportsConfig = {}
): LoggerWithTransports {
	return new LoggerWithTransports(config);
}

/**
 * Create a transport output function for use with existing Logger
 */
export function createTransportOutput(
	transports: LogTransport[],
	options?: { onError?: TransportErrorCallback }
): (entry: LogEntry) => void {
	const manager = new TransportManager({ onError: options?.onError });
	
	for (const transport of transports) {
		manager.addTransport(transport);
	}

	return (entry: LogEntry) => {
		manager.broadcast(entry).catch(() => {
			// Errors are handled by the transport manager
		});
	};
}

// ============= Exports =============

export default {
	HTTPWebhookTransport,
	DatadogTransport,
	ConsoleTransport,
	TransportManager,
	LoggerWithTransports,
	createLoggerWithTransports,
	createTransportOutput,
};