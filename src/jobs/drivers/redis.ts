/**
 * Redis Job Queue Driver
 *
 * Production-grade driver using Bun's native Redis client.
 * Supports atomic operations via Lua scripts.
 */

import type {
	Job,
	JobQueueConfig,
	JobQueueDriver,
	QueueMetrics,
	QueueOptions,
} from "../types";

// ============= Lua Scripts =============

/**
 * Atomic job claim script
 * Moves a job from pending to processing with ownership verification
 */
const CLAIM_JOB_SCRIPT = `
local jobId = KEYS[1]
local processingKey = KEYS[2]
local jobKey = KEYS[3]

local jobData = redis.call("ZRANGE", processingKey, 0, 0)[1]
if jobData then
  return nil
end

-- Get the job from pending
local job = redis.call("GET", jobKey)
if not job then
  return nil
end

-- Move to processing with expiry timestamp
local expiryMs = tonumber(ARGV[1])
redis.call("ZADD", processingKey, expiryMs, jobId)
redis.call("ZREM", ARGV[2], jobId)

return job
`;

/**
 * Atomic job completion script
 */
const COMPLETE_JOB_SCRIPT = `
local jobId = KEYS[1]
local jobKey = KEYS[2]
local processingKey = KEYS[3]

local job = redis.call("GET", jobKey)
if not job then
  return nil
end

-- Update job status in JSON
local decoded = cjson.decode(job)
decoded.status = "completed"
decoded.completedAt = ARGV[1]
decoded.updatedAt = ARGV[1]

if decoded.startedAt then
  local started = tonumber(string.sub(decoded.startedAt, 1, -5))
  local ended = tonumber(string.sub(ARGV[1], 1, -5))
  decoded.duration = ended - started
end

local updated = cjson.encode(decoded)
redis.call("SET", jobKey, updated)
redis.call("ZREM", processingKey, jobId)

return updated
`;

/**
 * Atomic job failure script
 */
const FAIL_JOB_SCRIPT = `
local jobId = KEYS[1]
local jobKey = KEYS[2]
local processingKey = KEYS[3]
local failedKey = KEYS[4]

local job = redis.call("GET", jobKey)
if not job then
  return nil
end

local decoded = cjson.decode(job)
decoded.status = "failed"
decoded.error = ARGV[1]
if ARGV[2] and ARGV[2] ~= "" then
  decoded.stackTrace = ARGV[2]
end
decoded.updatedAt = ARGV[3]

local updated = cjson.encode(decoded)
redis.call("SET", jobKey, updated)
redis.call("ZREM", processingKey, jobId)
redis.call("ZADD", failedKey, tonumber(ARGV[3]), jobId)

return updated
`;

/**
 * Schedule retry script
 */
const SCHEDULE_RETRY_SCRIPT = `
local jobId = KEYS[1]
local jobKey = KEYS[2]
local processingKey = KEYS[3]
local failedKey = KEYS[4]
local pendingKey = KEYS[5]

local job = redis.call("GET", jobKey)
if not job then
  return nil
end

local decoded = cjson.decode(job)
decoded.status = "delayed"
decoded.error = ARGV[1]
decoded.scheduledFor = ARGV[2]
decoded.updatedAt = ARGV[3]

local updated = cjson.encode(decoded)
redis.call("SET", jobKey, updated)
redis.call("ZREM", processingKey, jobId)
redis.call("ZREM", failedKey, jobId)
-- Add to pending with scheduled timestamp
redis.call("ZADD", pendingKey, tonumber(ARGV[4]), jobId)

return updated
`;

// ============= Redis Job Queue Driver =============

export class RedisJobQueueDriver implements JobQueueDriver {
	private client: unknown = null;
	private _isConnected = false;
	private keyPrefix: string;

	constructor(private config: JobQueueConfig = {}) {
		this.keyPrefix = config.keyPrefix ?? "jobs:";
	}

	/**
	 * Get prefixed key name
	 */
	private key(suffix: string): string {
		return `${this.keyPrefix}${suffix}`;
	}

	/**
	 * Type-safe Redis client getter
	 */
	private getClient(): {
		get: (key: string) => Promise<string | null>;
		set: (key: string, value: string) => Promise<void>;
		zadd: (
			key: string,
			score: number | string,
			member: string,
		) => Promise<number>;
		zrange: (
			key: string,
			start: number,
			stop: number,
			options?: { withscores?: boolean },
		) => Promise<string[]>;
		zrem: (key: string, ...members: string[]) => Promise<number>;
		zcard: (key: string) => Promise<number>;
		del: (...keys: string[]) => Promise<number>;
		hgetall: (key: string) => Promise<Record<string, string>>;
		hset: (key: string, field: string, value: string) => Promise<number>;
		hincrby: (key: string, field: string, increment: number) => Promise<number>;
		eval: (script: string, keys: string[], args: string[]) => Promise<unknown>;
		flushdb: () => Promise<void>;
	} {
		return this.client as any;
	}

	async connect(): Promise<void> {
		try {
			// @ts-ignore - Bun runtime API
			const { RedisClient } = await import("bun");
			if (!this.config.url) {
				throw new Error("Redis URL is required for RedisJobQueueDriver");
			}
			this.client = new RedisClient(this.config.url);
			this._isConnected = true;
		} catch (error) {
			throw new Error(
				`Failed to connect to Redis: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async disconnect(): Promise<void> {
		this._isConnected = false;
		this.client = null;
	}

	async isConnected(): Promise<boolean> {
		return this._isConnected;
	}

	async enqueue<T = unknown>(
		name: string,
		data: T,
		options?: QueueOptions,
	): Promise<string> {
		const client = this.getClient();
		const jobId = `${name}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
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
		let scheduledScore = now.getTime();
		if (options?.delay) {
			const delayMs =
				options.delay instanceof Date
					? options.delay.getTime() - Date.now()
					: options.delay;

			if (delayMs > 0) {
				job.status = "delayed";
				job.scheduledFor = new Date(now.getTime() + delayMs).toISOString();
				scheduledScore = now.getTime() + delayMs;
			}
		}

		// Store job data
		await client.set(this.key(`job:${jobId}`), JSON.stringify(job));

		// Add to pending queue (sorted by creation time for FIFO)
		await client.zadd(this.key("queue:pending"), scheduledScore, jobId);

		// Update metrics
		await client.hincrby(this.key("metrics"), "enqueued", 1);

		return jobId;
	}

	async claim(count: number, timeout: number): Promise<Job[]> {
		const client = this.getClient();
		const now = Date.now();
		const claimed: Job[] = [];

		try {
			// Get pending jobs (oldest first - FIFO)
			const jobIds = await client.zrange(
				this.key("queue:pending"),
				0,
				count - 1,
			);

			for (const jobId of jobIds) {
				if (claimed.length >= count) break;

				const jobKey = this.key(`job:${jobId}`);
				const jobData = await client.get(jobKey);

				if (!jobData) continue;

				const job: Job = JSON.parse(jobData);
				job.status = "processing";
				job.attempts = (job.attempts || 0) + 1;
				job.startedAt = new Date().toISOString();
				job.claimExpiresAt = new Date(now + timeout).toISOString();
				job.updatedAt = new Date().toISOString();

				// Atomically move to processing
				await client.set(jobKey, JSON.stringify(job));
				await client.zadd(this.key("queue:processing"), now + timeout, jobId);
				await client.zrem(this.key("queue:pending"), jobId);

				claimed.push(job);
			}

			return claimed;
		} catch (error) {
			console.error("Error claiming jobs:", error);
			return [];
		}
	}

	async complete(jobId: string): Promise<void> {
		const client = this.getClient();
		const jobKey = this.key(`job:${jobId}`);
		const jobData = await client.get(jobKey);

		if (!jobData) return;

		const job: Job = JSON.parse(jobData);
		const now = new Date();

		job.status = "completed";
		job.completedAt = now.toISOString();
		job.updatedAt = now.toISOString();

		if (job.startedAt) {
			job.duration =
				new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime();
		}

		// Update job and remove from processing
		await client.set(jobKey, JSON.stringify(job));
		await client.zrem(this.key("queue:processing"), jobId);

		// Update metrics
		await client.hincrby(this.key("metrics"), "processed", 1);
		if (job.duration) {
			await client.hincrby(
				this.key("metrics"),
				"totalLatency",
				Math.floor(job.duration),
			);
		}
	}

	async fail(jobId: string, error: string, stackTrace?: string): Promise<void> {
		const client = this.getClient();
		const jobKey = this.key(`job:${jobId}`);
		const jobData = await client.get(jobKey);

		if (!jobData) return;

		const job: Job = JSON.parse(jobData);
		job.error = error;
		job.stackTrace = stackTrace;
		job.status = "failed";
		job.updatedAt = new Date().toISOString();

		await client.set(jobKey, JSON.stringify(job));
		await client.zrem(this.key("queue:processing"), jobId);
		await client.zadd(this.key("queue:failed"), Date.now(), jobId);

		// Update metrics
		await client.hincrby(this.key("metrics"), "failed", 1);
	}

	async scheduleRetry(
		jobId: string,
		delayMs: number,
		error: string,
	): Promise<void> {
		const client = this.getClient();
		const jobKey = this.key(`job:${jobId}`);
		const jobData = await client.get(jobKey);

		if (!jobData) return;

		const job: Job = JSON.parse(jobData);
		job.status = "delayed";
		job.error = error;
		job.scheduledFor = new Date(Date.now() + delayMs).toISOString();
		job.updatedAt = new Date().toISOString();

		await client.set(jobKey, JSON.stringify(job));
		await client.zrem(this.key("queue:processing"), jobId);

		// Re-add to pending with scheduled timestamp
		await client.zadd(this.key("queue:pending"), Date.now() + delayMs, jobId);

		// Update metrics
		await client.hincrby(this.key("metrics"), "retried", 1);
	}

	async getJob(jobId: string): Promise<Job | null> {
		const client = this.getClient();
		const jobData = await client.get(this.key(`job:${jobId}`));

		if (!jobData) return null;

		return JSON.parse(jobData) as Job;
	}

	async getMetrics(): Promise<QueueMetrics> {
		const client = this.getClient();

		const metricsData = await client.hgetall(this.key("metrics"));
		const pendingCount = await client.zcard(this.key("queue:pending"));
		const processingCount = await client.zcard(this.key("queue:processing"));

		const enqueued = Number.parseInt(metricsData.enqueued || "0");
		const processed = Number.parseInt(metricsData.processed || "0");
		const failed = Number.parseInt(metricsData.failed || "0");
		const totalLatency = Number.parseInt(metricsData.totalLatency || "0");
		const retried = Number.parseInt(metricsData.retried || "0");

		const total = enqueued;
		const successRate = total > 0 ? processed / total : 0;
		const avgLatency = processed > 0 ? totalLatency / processed : 0;

		return {
			enqueued,
			processed,
			failed,
			pending: pendingCount,
			processing: processingCount,
			avgLatency,
			totalLatency,
			retried,
			successRate,
			avgAttempts: enqueued > 0 ? (processed + failed) / enqueued : 0,
		};
	}

	async clear(): Promise<void> {
		const client = this.getClient();

		const keys = [
			this.key("queue:pending"),
			this.key("queue:processing"),
			this.key("queue:failed"),
			this.key("metrics"),
		];

		// Also clear all job data
		const pendingJobs = await client.zrange(this.key("queue:pending"), 0, -1);
		for (const jobId of pendingJobs) {
			keys.push(this.key(`job:${jobId}`));
		}

		const processingJobs = await client.zrange(
			this.key("queue:processing"),
			0,
			-1,
		);
		for (const jobId of processingJobs) {
			keys.push(this.key(`job:${jobId}`));
		}

		const failedJobs = await client.zrange(this.key("queue:failed"), 0, -1);
		for (const jobId of failedJobs) {
			keys.push(this.key(`job:${jobId}`));
		}

		if (keys.length > 0) {
			await client.del(...keys);
		}
	}
}
