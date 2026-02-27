/**
 * Job Worker
 *
 * Production-grade worker for processing background jobs.
 * Designed to run in a separate process/worker.
 * Supports graceful shutdown and exponential backoff polling.
 */

import type {
	Job,
	JobEventType,
	JobHandler,
	JobQueueConfig,
	JobQueueDriver,
	HandlerRegistryEntry,
	JobEvent,
} from "./types";
import { MemoryJobQueueDriver } from "./drivers/memory";
import { RedisJobQueueDriver } from "./drivers/redis";

// ============= Job Worker Class =============

export class JobWorker {
	private driver: JobQueueDriver;
	private handlers: Map<string, JobHandler<unknown>> = new Map();
	private handlerRegistry: HandlerRegistryEntry[] = [];
	private eventListeners: Map<
		JobEventType,
		Set<(event: JobEvent) => void>
	> = new Map();
	private isRunning = false;
	private pollInterval: number;
	private concurrency: number;
	private jobTimeout: number;
	private maxBackoffDelay: number = 30000; // 30 seconds max backoff
	private currentBackoff: number = 0;
	private inFlightJobs = new Set<string>();
	private shutdownTimeout: number = 10000; // 10 seconds to drain

	constructor(config: JobQueueConfig = {}) {
		// Instantiate appropriate driver
		const driver = config.driver ?? "memory";

		if (driver === "redis") {
			if (!config.url) {
				throw new Error("Redis URL is required for Redis driver");
			}
			this.driver = new RedisJobQueueDriver(config);
		} else {
			this.driver = new MemoryJobQueueDriver(config);
		}

		this.pollInterval = config.pollInterval ?? 1000;
		this.concurrency = config.concurrency ?? 10;
		this.jobTimeout = config.jobTimeout ?? 300000; // 5 minutes default
	}

	/**
	 * Initialize the worker (connect to backend)
	 */
	async init(): Promise<void> {
		await this.driver.connect();
	}

	/**
	 * Register a handler for a job type
	 * Supports wildcards: "email.*" matches "email.welcome", "email.reset", etc.
	 */
	handle(pattern: string, handler: JobHandler<unknown>): void {
		this.handlers.set(pattern, handler);

		// Calculate specificity for wildcard matching (longer = more specific)
		const specificity = pattern.split(".").length;
		const entry: HandlerRegistryEntry = { pattern, handler, specificity };

		// Insert in order of specificity (highest first)
		const index = this.handlerRegistry.findIndex(
			(e) => e.specificity < specificity,
		);
		if (index >= 0) {
			this.handlerRegistry.splice(index, 0, entry);
		} else {
			this.handlerRegistry.push(entry);
		}
	}

	/**
	 * Remove a handler
	 */
	unhandle(pattern: string): void {
		this.handlers.delete(pattern);
		const index = this.handlerRegistry.findIndex((e) => e.pattern === pattern);
		if (index >= 0) {
			this.handlerRegistry.splice(index, 1);
		}
	}

	/**
	 * Listen for worker events
	 */
	on(eventType: JobEventType, listener: (event: JobEvent) => void): void {
		if (!this.eventListeners.has(eventType)) {
			this.eventListeners.set(eventType, new Set());
		}
		this.eventListeners.get(eventType)!.add(listener);
	}

	/**
	 * Stop listening for events
	 */
	off(eventType: JobEventType, listener: (event: JobEvent) => void): void {
		this.eventListeners.get(eventType)?.delete(listener);
	}

	/**
	 * Emit a worker event
	 */
	private _emitEvent(eventType: JobEventType, job: Job): void {
		const listeners = this.eventListeners.get(eventType);
		if (!listeners) return;

		const event: JobEvent = {
			type: eventType,
			job,
			timestamp: new Date(),
		};

		for (const listener of listeners) {
			try {
				listener(event);
			} catch (error) {
				console.error(`Error in ${eventType} listener:`, error);
			}
		}
	}

	/**
	 * Find the best matching handler for a job
	 */
	private findHandler(jobName: string): JobHandler<unknown> | null {
		for (const entry of this.handlerRegistry) {
			if (this._patternMatches(entry.pattern, jobName)) {
				return entry.handler;
			}
		}
		return null;
	}

	/**
	 * Check if a pattern matches a job name (supports wildcards)
	 */
	private _patternMatches(pattern: string, jobName: string): boolean {
		if (pattern === jobName) return true;

		// Handle wildcards: "email.*" matches "email.welcome"
		if (pattern.endsWith(".*")) {
			const prefix = pattern.slice(0, -2); // Remove ".*"
			return jobName.startsWith(prefix + ".");
		}

		return false;
	}

	/**
	 * Start the worker (blocks until stopped)
	 */
	async start(): Promise<void> {
		this.isRunning = true;

		console.log("[JobWorker] Starting worker process");

		// Handle signals for graceful shutdown
		const handleSignal = async () => {
			await this.stop();
		};

		process.on("SIGTERM", handleSignal);
		process.on("SIGINT", handleSignal);

		try {
			await this._pollLoop();
		} finally {
			process.removeListener("SIGTERM", handleSignal);
			process.removeListener("SIGINT", handleSignal);
		}
	}

	/**
	 * Main polling loop
	 */
	private async _pollLoop(): Promise<void> {
		while (this.isRunning) {
			try {
				const availableSlots = this.concurrency - this.inFlightJobs.size;

				if (availableSlots > 0) {
					const jobs = await this.driver.claim(
						availableSlots,
						this.jobTimeout,
					);

					if (jobs.length > 0) {
						// Reset backoff on successful claim
						this.currentBackoff = 0;

						// Process jobs concurrently
						for (const job of jobs) {
							this._processJob(job).catch((error) => {
								console.error(
									`[JobWorker] Unhandled error processing job ${job.id}:`,
									error,
								);
							});
						}
					} else {
						// No jobs, increase backoff
						this.currentBackoff = Math.min(
							(this.currentBackoff || this.pollInterval) * 1.5,
							this.maxBackoffDelay,
						);
					}
				}

				// Sleep before next poll
				const delay = this.currentBackoff || this.pollInterval;
				await new Promise((resolve) => setTimeout(resolve, delay));
			} catch (error) {
				console.error("[JobWorker] Error in polling loop:", error);

				// Backoff on error
				this.currentBackoff = Math.min(
					(this.currentBackoff || this.pollInterval) * 1.5,
					this.maxBackoffDelay,
				);

				await new Promise((resolve) =>
					setTimeout(resolve, this.currentBackoff),
				);
			}
		}
	}

	/**
	 * Process a single job
	 */
	private async _processJob(job: Job): Promise<void> {
		this.inFlightJobs.add(job.id);

		try {
			const handler = this.findHandler(job.name);

			if (!handler) {
				console.warn(
					`[JobWorker] No handler found for job type: ${job.name}`,
				);
				await this.driver.complete(job.id);
				return;
			}

			this._emitEvent("started", job);

			// Execute handler with timeout
			const timeoutPromise = new Promise((_, reject) =>
				setTimeout(
					() =>
						reject(
							new Error(
								`Job timeout after ${this.jobTimeout}ms`,
							),
						),
					this.jobTimeout,
				),
			);

			const handlerPromise = handler(job);

			await Promise.race([handlerPromise, timeoutPromise]);

			this._emitEvent("completed", job);
			await this.driver.complete(job.id);
		} catch (error) {
			const errorMsg =
				error instanceof Error ? error.message : String(error);
			const stackTrace =
				error instanceof Error ? error.stack : undefined;

			// Determine if we should retry
			if (
				job.attempts <
				job.maxRetries
			) {
				// Exponential backoff: 1s, 2s, 4s, 8s, etc. (capped at 1 hour)
				const delaySeconds = Math.min(
					Math.pow(2, job.attempts),
					3600,
				);
				const delayMs = delaySeconds * 1000;

				this._emitEvent("retried", job);
				await this.driver.scheduleRetry(job.id, delayMs, errorMsg);

				console.warn(
					`[JobWorker] Job ${job.id} failed (attempt ${job.attempts}/${job.maxRetries}): ${errorMsg}. Retrying in ${delaySeconds}s`,
				);
			} else {
				this._emitEvent("failed", job);
				await this.driver.fail(job.id, errorMsg, stackTrace);

				console.error(
					`[JobWorker] Job ${job.id} failed permanently: ${errorMsg}`,
				);
			}
		} finally {
			this.inFlightJobs.delete(job.id);
		}
	}

	/**
	 * Stop the worker gracefully
	 * Waits for in-flight jobs to complete before shutdown
	 */
	async stop(): Promise<void> {
		if (!this.isRunning) return;

		console.log("[JobWorker] Shutting down gracefully...");
		this.isRunning = false;

		// Wait for in-flight jobs to complete
		const startTime = Date.now();
		while (
			this.inFlightJobs.size > 0 &&
			Date.now() - startTime < this.shutdownTimeout
		) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		if (this.inFlightJobs.size > 0) {
			console.warn(
				`[JobWorker] Force shutdown with ${this.inFlightJobs.size} jobs still in flight`,
			);
		} else {
			console.log("[JobWorker] All jobs completed, shutting down");
		}

		await this.driver.disconnect();
	}

	/**
	 * Get the number of jobs currently being processed
	 */
	getInFlightCount(): number {
		return this.inFlightJobs.size;
	}

	/**
	 * Get queue metrics
	 */
	async getMetrics() {
		return this.driver.getMetrics();
	}

	/**
	 * Check if worker is running
	 */
	isActive(): boolean {
		return this.isRunning;
	}
}

// ============= Worker CLI Entry Point =============

/**
 * Create and start a worker from config
 * Useful for CLI commands like: bueno queue:worker
 */
export async function startWorker(config?: JobQueueConfig): Promise<void> {
	const worker = new JobWorker(config);

	// Log metrics periodically
	const metricsInterval = setInterval(async () => {
		if (worker.isActive()) {
			const metrics = await worker.getMetrics();
			console.log("[JobWorker] Metrics:", {
				pending: metrics.pending,
				processing: metrics.processing,
				processed: metrics.processed,
				failed: metrics.failed,
				avgLatency: `${Math.round(metrics.avgLatency)}ms`,
			});
		}
	}, 30000);

	await worker.init();

	process.on("exit", () => {
		clearInterval(metricsInterval);
	});

	await worker.start();
}
