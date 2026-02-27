/**
 * In-Memory Job Queue Driver
 *
 * Used for development and testing. No external dependencies.
 * Jobs are stored in memory and lost on process restart.
 */

import type {
	Job,
	JobQueueConfig,
	JobQueueDriver,
	QueueMetrics,
	QueueOptions,
} from "../types";

// ============= In-Memory Store =============

interface StoredJob {
	job: Job;
	expiresAt: number; // Timestamp when job expires (for cleanup)
}

// ============= Memory Job Queue Driver =============

export class MemoryJobQueueDriver implements JobQueueDriver {
	private jobStore = new Map<string, StoredJob>();
	private pendingQueue: string[] = []; // Job IDs in FIFO order
	private processingSet = new Set<string>(); // Currently claimed jobs
	private failedQueue: string[] = [];
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;
	private jobCounter = 0; // For generating sequential IDs
	private metrics: QueueMetrics = {
		enqueued: 0,
		processed: 0,
		failed: 0,
		pending: 0,
		processing: 0,
		avgLatency: 0,
		totalLatency: 0,
		retried: 0,
		successRate: 0,
		avgAttempts: 0,
	};

	constructor(private config: JobQueueConfig = {}) {
		this._startCleanup();
	}

	/**
	 * Generate a unique job ID
	 */
	private generateJobId(): string {
		this.jobCounter++;
		return `job:memory:${Date.now()}:${this.jobCounter}`;
	}

	/**
	 * Start periodic cleanup of expired jobs
	 */
	private _startCleanup(): void {
		this.cleanupInterval = setInterval(() => {
			const now = Date.now();
			for (const [jobId, stored] of this.jobStore.entries()) {
				if (now > stored.expiresAt) {
					this.jobStore.delete(jobId);
				}
			}
		}, 30000); // Run every 30 seconds
	}

	async connect(): Promise<void> {
		// No-op for in-memory driver
	}

	async disconnect(): Promise<void> {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
		this.jobStore.clear();
		this.pendingQueue = [];
		this.processingSet.clear();
		this.failedQueue = [];
	}

	async isConnected(): Promise<boolean> {
		return true; // Always connected for in-memory
	}

	async enqueue<T = unknown>(
		name: string,
		data: T,
		options?: QueueOptions,
	): Promise<string> {
		const jobId = this.generateJobId();
		const now = new Date();

		const job: Job<T> = {
			id: jobId,
			name,
			data,
			status: "pending",
			attempts: 0,
			maxRetries: options?.maxRetries ?? this.config.maxRetries ?? 3,
			createdAt: now.toISOString(),
			updatedAt: now.toISOString(),
			priority: options?.priority ?? 0,
			metadata: options?.metadata,
		};

		// Handle delayed jobs
		if (options?.delay) {
			const delayMs =
				options.delay instanceof Date
					? options.delay.getTime() - Date.now()
					: options.delay;

			if (delayMs > 0) {
				job.status = "delayed";
				job.scheduledFor = new Date(Date.now() + delayMs).toISOString();
			}
		}

		// Store job with expiry (7 days by default)
		const expiryMs = 7 * 24 * 60 * 60 * 1000;
		this.jobStore.set(jobId, {
			job,
			expiresAt: Date.now() + expiryMs,
		});

		// Add to pending queue if not delayed
		if (job.status === "pending") {
			this.pendingQueue.push(jobId);
		}

		this.metrics.enqueued++;
		this.metrics.pending = this.pendingQueue.length;

		return jobId;
	}

	async claim(
		count: number,
		timeout: number,
	): Promise<Job[]> {
		const now = Date.now();
		const claimed: Job[] = [];

		// Move delayed jobs to pending if their time has come
		const toRemove: number[] = [];
		this.jobStore.forEach((stored, jobId) => {
			if (
				stored.job.status === "delayed" &&
				stored.job.scheduledFor &&
				new Date(stored.job.scheduledFor).getTime() <= now
			) {
				stored.job.status = "pending";
				if (!this.pendingQueue.includes(jobId)) {
					this.pendingQueue.push(jobId);
				}
			}
		});

		// Claim up to 'count' pending jobs
		while (claimed.length < count && this.pendingQueue.length > 0) {
			const jobId = this.pendingQueue.shift();
			if (!jobId) break;

			const stored = this.jobStore.get(jobId);
			if (!stored) continue;

			const job = stored.job;
			job.status = "processing";
			job.attempts++;
			job.startedAt = new Date().toISOString();
			job.claimExpiresAt = new Date(now + timeout).toISOString();
			job.updatedAt = new Date().toISOString();

			this.processingSet.add(jobId);
			claimed.push(job);
		}

		this.metrics.processing = this.processingSet.size;
		this.metrics.pending = this.pendingQueue.length;

		return claimed;
	}

	async complete(jobId: string): Promise<void> {
		const stored = this.jobStore.get(jobId);
		if (!stored) return;

		const job = stored.job;
		const now = new Date();

		job.status = "completed";
		job.completedAt = now.toISOString();
		job.updatedAt = now.toISOString();

		// Calculate duration
		if (job.startedAt) {
			job.duration =
				new Date(job.completedAt).getTime() -
				new Date(job.startedAt).getTime();
			this.metrics.totalLatency += job.duration;
		}

		this.processingSet.delete(jobId);
		this.metrics.processed++;
		this.metrics.processing = this.processingSet.size;

		// Update average latency
		if (this.metrics.processed > 0) {
			this.metrics.avgLatency =
				this.metrics.totalLatency / this.metrics.processed;
		}

		// Update success rate
		const total =
			this.metrics.processed + this.metrics.failed + this.metrics.pending;
		if (total > 0) {
			this.metrics.successRate = this.metrics.processed / total;
		}

		// Calculate average attempts
		const allJobs = Array.from(this.jobStore.values())
			.map((s) => s.job)
			.filter((j) => j.status === "completed" || j.status === "failed");
		if (allJobs.length > 0) {
			const totalAttempts = allJobs.reduce(
				(sum, j) => sum + (j.attempts || 1),
				0,
			);
			this.metrics.avgAttempts = totalAttempts / allJobs.length;
		}
	}

	async fail(jobId: string, error: string, stackTrace?: string): Promise<void> {
		const stored = this.jobStore.get(jobId);
		if (!stored) return;

		const job = stored.job;
		const now = new Date();

		job.error = error;
		job.stackTrace = stackTrace;
		job.status = "failed";
		job.updatedAt = now.toISOString();

		this.processingSet.delete(jobId);
		this.failedQueue.push(jobId);

		this.metrics.failed++;
		this.metrics.processing = this.processingSet.size;

		// Update success rate
		const total =
			this.metrics.processed + this.metrics.failed + this.metrics.pending;
		if (total > 0) {
			this.metrics.successRate = this.metrics.processed / total;
		}
	}

	async scheduleRetry(
		jobId: string,
		delayMs: number,
		error: string,
	): Promise<void> {
		const stored = this.jobStore.get(jobId);
		if (!stored) return;

		const job = stored.job;
		const now = new Date();

		job.error = error;
		job.status = "delayed";
		job.scheduledFor = new Date(now.getTime() + delayMs).toISOString();
		job.updatedAt = now.toISOString();

		// Remove from processing and failed queues
		this.processingSet.delete(jobId);
		const failedIndex = this.failedQueue.indexOf(jobId);
		if (failedIndex >= 0) {
			this.failedQueue.splice(failedIndex, 1);
		}

		// Don't add back to pending yet - it will be added when delay expires
		this.metrics.retried++;
		this.metrics.processing = this.processingSet.size;
	}

	async getJob(jobId: string): Promise<Job | null> {
		const stored = this.jobStore.get(jobId);
		return stored ? stored.job : null;
	}

	async getMetrics(): Promise<QueueMetrics> {
		return { ...this.metrics };
	}

	async clear(): Promise<void> {
		this.jobStore.clear();
		this.pendingQueue = [];
		this.processingSet.clear();
		this.failedQueue = [];
		this.metrics = {
			enqueued: 0,
			processed: 0,
			failed: 0,
			pending: 0,
			processing: 0,
			avgLatency: 0,
			totalLatency: 0,
			retried: 0,
			successRate: 0,
			avgAttempts: 0,
		};
	}
}
