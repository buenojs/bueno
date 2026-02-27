/**
 * Job Queue Factory and API
 *
 * Main public interface for enqueueing and managing background jobs.
 * Supports both Redis and in-memory drivers.
 */

import type {
	Job,
	JobEventType,
	JobHandler,
	JobQueueConfig,
	JobQueueDriver,
	QueueMetrics,
	QueueOptions,
	HandlerRegistryEntry,
	JobEvent,
} from "./types";
import { MemoryJobQueueDriver } from "./drivers/memory";
import { RedisJobQueueDriver } from "./drivers/redis";

// ============= Job Queue Class =============

export class JobQueue {
	private driver: JobQueueDriver;
	private handlers: Map<string, JobHandler<unknown>> = new Map();
	private handlerRegistry: HandlerRegistryEntry[] = [];
	private eventListeners: Map<
		JobEventType,
		Set<(event: JobEvent) => void>
	> = new Map();
	private isRunning = false;

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
	}

	/**
	 * Initialize the queue (connect to backend)
	 */
	async init(): Promise<void> {
		await this.driver.connect();
	}

	/**
	 * Shutdown the queue gracefully
	 */
	async shutdown(): Promise<void> {
		this.isRunning = false;
		await this.driver.disconnect();
	}

	/**
	 * Enqueue a job
	 * @param name - Job name/type (e.g., "email.welcome")
	 * @param data - Job payload
	 * @param options - Queue options (delay, priority, timeout)
	 * @returns Job ID
	 */
	async enqueue<T = unknown>(
		name: string,
		data: T,
		options?: QueueOptions,
	): Promise<string> {
		const jobId = await this.driver.enqueue(name, data, options);
		this._emitEvent("enqueued", { id: jobId, name } as unknown as Job);
		return jobId;
	}

	/**
	 * Register a handler for a job type
	 * Supports wildcards: "email.*" matches "email.welcome", "email.reset", etc.
	 */
	on(pattern: string, handler: JobHandler<unknown>): void {
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
	off(pattern: string): void {
		this.handlers.delete(pattern);
		const index = this.handlerRegistry.findIndex((e) => e.pattern === pattern);
		if (index >= 0) {
			this.handlerRegistry.splice(index, 1);
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
	 * Listen for queue events
	 */
	onEvent(
		event: JobEventType,
		listener: (event: JobEvent) => void,
	): void {
		if (!this.eventListeners.has(event)) {
			this.eventListeners.set(event, new Set());
		}
		this.eventListeners.get(event)!.add(listener);
	}

	/**
	 * Stop listening for queue events
	 */
	offEvent(
		event: JobEventType,
		listener: (event: JobEvent) => void,
	): void {
		this.eventListeners.get(event)?.delete(listener);
	}

	/**
	 * Emit a queue event
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
	 * Start the polling loop (for tests/manual control)
	 * Note: In production, use a separate worker process
	 */
	async start(options: { pollInterval?: number; concurrency?: number } = {}): Promise<void> {
		this.isRunning = true;
		const pollInterval = options.pollInterval ?? 1000;
		const concurrency = options.concurrency ?? 10;

		// This is a basic polling loop for simple use cases
		// For production, use a dedicated worker process with JobWorker class
		while (this.isRunning) {
			try {
				const jobs = await this.driver.claim(concurrency, 30000);

				for (const job of jobs) {
					if (!this.isRunning) break;

					try {
						const handler = this.findHandler(job.name);
						if (!handler) {
							console.warn(
								`No handler found for job type: ${job.name}`,
							);
							await this.driver.complete(job.id);
							continue;
						}

						this._emitEvent("started", job);

						await handler(job);

						this._emitEvent("completed", job);
						await this.driver.complete(job.id);
					} catch (error) {
						const errorMsg =
							error instanceof Error
								? error.message
								: String(error);
						const stackTrace =
							error instanceof Error ? error.stack : undefined;

						if (job.attempts < job.maxRetries) {
							const backoffMs =
								Math.pow(2, job.attempts) * 1000; // Exponential backoff
							this._emitEvent("retried", job);
							await this.driver.scheduleRetry(
								job.id,
								backoffMs,
								errorMsg,
							);
						} else {
							this._emitEvent("failed", job);
							await this.driver.fail(
								job.id,
								errorMsg,
								stackTrace,
							);
						}
					}
				}

				// Sleep before next poll
				await new Promise((resolve) =>
					setTimeout(resolve, pollInterval),
				);
			} catch (error) {
				console.error("Error in job queue polling loop:", error);
				await new Promise((resolve) =>
					setTimeout(resolve, pollInterval),
				);
			}
		}
	}

	/**
	 * Stop the polling loop
	 */
	async stop(): Promise<void> {
		this.isRunning = false;
		// Wait a bit for current jobs to finish
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	/**
	 * Get a job by ID
	 */
	async getJob(jobId: string): Promise<Job | null> {
		return this.driver.getJob(jobId);
	}

	/**
	 * Get queue metrics
	 */
	async getMetrics(): Promise<QueueMetrics> {
		return this.driver.getMetrics();
	}

	/**
	 * Clear all jobs (use with caution!)
	 */
	async clear(): Promise<void> {
		return this.driver.clear();
	}

	/**
	 * Check if queue is connected
	 */
	async isConnected(): Promise<boolean> {
		return this.driver.isConnected();
	}
}

// ============= Factory Function =============

/**
 * Create a new job queue instance
 */
export function createJobQueue(config?: JobQueueConfig): JobQueue {
	return new JobQueue(config);
}
