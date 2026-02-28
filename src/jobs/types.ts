/**
 * Background Jobs / Task Queue
 *
 * Type definitions for the job queue system.
 * Supports Redis (production) and in-memory (development) drivers.
 */

// ============= Job Status =============

export type JobStatus =
	| "pending"
	| "processing"
	| "completed"
	| "failed"
	| "delayed";

// ============= Job Data Structure =============

/**
 * Represents a background job
 */
export interface Job<T = unknown> {
	/** Unique job identifier */
	id: string;

	/** Job name/type (e.g., "email.welcome", "image.resize") */
	name: string;

	/** Job payload data */
	data: T;

	/** Current status of the job */
	status: JobStatus;

	/** Number of times this job has been attempted */
	attempts: number;

	/** Maximum number of retry attempts */
	maxRetries: number;

	/** Error message if job failed */
	error?: string;

	/** Stack trace if job failed */
	stackTrace?: string;

	/** When the job was created (ISO 8601) */
	createdAt: string;

	/** When the job was last updated (ISO 8601) */
	updatedAt: string;

	/** When the job should start (ISO 8601, for delayed jobs) */
	scheduledFor?: string;

	/** When job processing started (ISO 8601) */
	startedAt?: string;

	/** When job processing completed (ISO 8601) */
	completedAt?: string;

	/** How long the job took to complete in milliseconds */
	duration?: number;

	/** Job priority (higher = process sooner) */
	priority?: number;

	/** Custom metadata attached to the job */
	metadata?: Record<string, unknown>;

	/** Worker that claimed this job */
	workerId?: string;

	/** When the job claim expires (for dead letter handling) */
	claimExpiresAt?: string;
}

// ============= Queue Configuration =============

export interface JobQueueConfig {
	/** Driver type: 'redis' for production, 'memory' for development */
	driver?: "redis" | "memory";

	/** Redis connection URL (required if driver is 'redis') */
	url?: string;

	/** Key prefix for all jobs (default: 'jobs:') */
	keyPrefix?: string;

	/** Maximum number of jobs to process concurrently (default: 10) */
	concurrency?: number;

	/** Maximum number of retry attempts (default: 3) */
	maxRetries?: number;

	/** Base delay in seconds for exponential backoff (default: 1) */
	retryDelay?: number;

	/** Number of jobs to claim in a single poll (default: 10) */
	batchSize?: number;

	/** Polling interval in milliseconds (default: 1000) */
	pollInterval?: number;

	/** Job timeout in milliseconds (default: 300000 / 5 minutes) */
	jobTimeout?: number;

	/** Enable metrics collection (default: true) */
	enableMetrics?: boolean;
}

// ============= Enqueue Options =============

export interface QueueOptions {
	/** Schedule job for later execution (ISO 8601 or Date) */
	delay?: number | Date;

	/** Job priority (default: 0) */
	priority?: number;

	/** Custom metadata */
	metadata?: Record<string, unknown>;

	/** Override default job timeout in milliseconds */
	timeout?: number;

	/** Maximum retries for this specific job */
	maxRetries?: number;
}

// ============= Handler Type =============

/**
 * Async handler function for processing jobs
 */
export type JobHandler<T = unknown> = (job: Job<T>) => Promise<void>;

// ============= Queue Metrics =============

/**
 * Metrics for job queue observability
 */
export interface QueueMetrics {
	/** Total jobs enqueued */
	enqueued: number;

	/** Jobs successfully completed */
	processed: number;

	/** Jobs that failed (exceeded max retries) */
	failed: number;

	/** Jobs currently in pending state */
	pending: number;

	/** Jobs currently being processed */
	processing: number;

	/** Average job processing time in milliseconds */
	avgLatency: number;

	/** Total processing time in milliseconds */
	totalLatency: number;

	/** Number of job retries that occurred */
	retried: number;

	/** Success rate (0.0 to 1.0) */
	successRate: number;

	/** Average number of attempts per job */
	avgAttempts: number;
}

// ============= Events =============

export type JobEventType =
	| "enqueued"
	| "started"
	| "completed"
	| "failed"
	| "retried";

export interface JobEvent<T = unknown> {
	type: JobEventType;
	job: Job<T>;
	timestamp: Date;
	metadata?: Record<string, unknown>;
}

// ============= Lock Handle for Job Claims =============

export interface JobClaimHandle {
	/** Whether the claim was successfully acquired */
	acquired: boolean;

	/** Release the claim (job goes back to pending) */
	release: () => Promise<boolean>;

	/** Extend the claim TTL for long-running jobs */
	extend: (ttl?: number) => Promise<boolean>;

	/** Check if claim is still valid */
	isValid: () => Promise<boolean>;

	/** Get remaining TTL in milliseconds */
	getRemainingTTL: () => Promise<number>;

	/** The claim key */
	key: string;

	/** The claim value (unique identifier) */
	value: string;
}

// ============= Driver Interface =============

/**
 * Interface that both Redis and Memory drivers must implement
 */
export interface JobQueueDriver {
	/**
	 * Initialize the driver (e.g., connect to Redis)
	 */
	connect(): Promise<void>;

	/**
	 * Disconnect from the driver
	 */
	disconnect(): Promise<void>;

	/**
	 * Check if connected
	 */
	isConnected(): Promise<boolean>;

	/**
	 * Enqueue a new job
	 */
	enqueue<T = unknown>(
		name: string,
		data: T,
		options?: QueueOptions,
	): Promise<string>;

	/**
	 * Claim a batch of pending jobs for processing
	 */
	claim(count: number, timeout: number): Promise<Job[]>;

	/**
	 * Mark a job as completed
	 */
	complete(jobId: string): Promise<void>;

	/**
	 * Mark a job as failed
	 */
	fail(jobId: string, error: string, stackTrace?: string): Promise<void>;

	/**
	 * Schedule a job for retry
	 */
	scheduleRetry(jobId: string, delayMs: number, error: string): Promise<void>;

	/**
	 * Get a job by ID
	 */
	getJob(jobId: string): Promise<Job | null>;

	/**
	 * Get queue metrics
	 */
	getMetrics(): Promise<QueueMetrics>;

	/**
	 * Clear all jobs from the queue (use with caution!)
	 */
	clear(): Promise<void>;
}

// ============= Handler Registry Entry =============

export interface HandlerRegistryEntry {
	pattern: string;
	handler: JobHandler<unknown>;
	specificity: number; // For wildcard matching priority
}

// ============= Configuration Validation =============

export interface JobConfigValidationResult {
	valid: boolean;
	errors: string[];
}
