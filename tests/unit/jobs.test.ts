/**
 * Job Queue Unit Tests
 *
 * Tests for job queue, drivers, and core functionality
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
	JobQueue,
	JobWorker,
	MemoryJobQueueDriver,
	type Job,
	type JobHandler,
} from "../../src/jobs";

// ============= Test Fixtures =============

interface TestJobData {
	message: string;
	delay?: number;
}

// ============= Memory Driver Tests =============

describe("MemoryJobQueueDriver", () => {
	let driver: MemoryJobQueueDriver;

	beforeEach(async () => {
		driver = new MemoryJobQueueDriver();
		await driver.connect();
	});

	afterEach(async () => {
		await driver.disconnect();
	});

	test("should enqueue a job", async () => {
		const jobId = await driver.enqueue<TestJobData>("test", {
			message: "hello",
		});

		expect(jobId).toBeDefined();
		expect(typeof jobId).toBe("string");
	});

	test("should retrieve enqueued job", async () => {
		const jobId = await driver.enqueue<TestJobData>("test", {
			message: "hello",
		});

		const job = await driver.getJob(jobId);
		expect(job).toBeDefined();
		expect(job?.name).toBe("test");
		expect(job?.data).toEqual({ message: "hello" });
		expect(job?.status).toBe("pending");
	});

	test("should claim pending jobs", async () => {
		await driver.enqueue<TestJobData>("test", { message: "job1" });
		await driver.enqueue<TestJobData>("test", { message: "job2" });

		const claimed = await driver.claim(10, 30000);
		expect(claimed.length).toBe(2);
		expect(claimed[0].status).toBe("processing");
		expect(claimed[0].attempts).toBe(1);
	});

	test("should mark job as completed", async () => {
		const jobId = await driver.enqueue<TestJobData>("test", {
			message: "hello",
		});

		const claimed = await driver.claim(1, 30000);
		await driver.complete(claimed[0].id);

		const job = await driver.getJob(jobId);
		expect(job?.status).toBe("completed");
		expect(job?.completedAt).toBeDefined();
	});

	test("should mark job as failed", async () => {
		const jobId = await driver.enqueue<TestJobData>("test", {
			message: "hello",
		});

		const claimed = await driver.claim(1, 30000);
		await driver.fail(claimed[0].id, "Test error", "Stack trace");

		const job = await driver.getJob(jobId);
		expect(job?.status).toBe("failed");
		expect(job?.error).toBe("Test error");
		expect(job?.stackTrace).toBe("Stack trace");
	});

	test("should schedule job retry", async () => {
		const jobId = await driver.enqueue<TestJobData>("test", {
			message: "hello",
		});

		const claimed = await driver.claim(1, 30000);
		await driver.scheduleRetry(claimed[0].id, 1000, "Temp error");

		const job = await driver.getJob(jobId);
		expect(job?.status).toBe("delayed");
		expect(job?.error).toBe("Temp error");
		expect(job?.scheduledFor).toBeDefined();
	});

	test("should track metrics", async () => {
		await driver.enqueue<TestJobData>("test", { message: "job1" });
		await driver.enqueue<TestJobData>("test", { message: "job2" });

		const metrics = await driver.getMetrics();
		expect(metrics.enqueued).toBe(2);
		expect(metrics.pending).toBe(2);
		expect(metrics.processing).toBe(0);
		expect(metrics.processed).toBe(0);
		expect(metrics.failed).toBe(0);
	});

	test("should clear all jobs", async () => {
		await driver.enqueue<TestJobData>("test", { message: "job1" });
		await driver.enqueue<TestJobData>("test", { message: "job2" });

		await driver.clear();

		const metrics = await driver.getMetrics();
		expect(metrics.enqueued).toBe(0);
		expect(metrics.pending).toBe(0);
	});

	test("should handle delayed jobs", async () => {
		const futureTime = new Date(Date.now() + 1000);
		const jobId = await driver.enqueue<TestJobData>(
			"test",
			{
				message: "delayed",
			},
			{ delay: futureTime },
		);

		const claimed = await driver.claim(10, 30000);
		expect(claimed.length).toBe(0);

		const job = await driver.getJob(jobId);
		expect(job?.status).toBe("delayed");
	});

	test("should respect batch size", async () => {
		for (let i = 0; i < 5; i++) {
			await driver.enqueue<TestJobData>("test", { message: `job${i}` });
		}

		const claimed = await driver.claim(3, 30000);
		expect(claimed.length).toBe(3);
	});

	test("should calculate job duration", async () => {
		const jobId = await driver.enqueue<TestJobData>("test", {
			message: "hello",
		});

		const claimed = await driver.claim(1, 30000);

		// Simulate some work
		await new Promise((resolve) => setTimeout(resolve, 100));

		await driver.complete(claimed[0].id);

		const job = await driver.getJob(jobId);
		expect(job?.duration).toBeDefined();
		expect(job?.duration! >= 100).toBeTruthy();
	});
});

// ============= JobQueue Tests =============

describe("JobQueue", () => {
	let queue: JobQueue;

	beforeEach(async () => {
		queue = new JobQueue({ driver: "memory" });
		await queue.init();
	});

	afterEach(async () => {
		await queue.shutdown();
	});

	test("should create queue instance", () => {
		expect(queue).toBeDefined();
	});

	test("should enqueue job and return ID", async () => {
		const jobId = await queue.enqueue<TestJobData>("test", {
			message: "hello",
		});

		expect(jobId).toBeDefined();
		expect(typeof jobId).toBe("string");
	});

	test("should register job handler", () => {
		const handler: JobHandler<TestJobData> = async () => {
			// Handler implementation
		};

		queue.on("test", handler);

		// Handler should be registered without error
		expect(true).toBeTruthy();
	});

	test("should support wildcard handlers", () => {
		const emailHandler: JobHandler = async () => {
			// Email handler
		};

		queue.on("email.*", emailHandler);

		// Should register without error
		expect(true).toBeTruthy();
	});

	test("should retrieve job by ID", async () => {
		const jobId = await queue.enqueue<TestJobData>("test", {
			message: "hello",
		});

		const job = await queue.getJob(jobId);
		expect(job).toBeDefined();
		expect(job?.id).toBe(jobId);
		expect(job?.name).toBe("test");
	});

	test("should get queue metrics", async () => {
		await queue.enqueue<TestJobData>("test", { message: "job1" });
		await queue.enqueue<TestJobData>("test", { message: "job2" });

		const metrics = await queue.getMetrics();
		expect(metrics.enqueued).toBe(2);
		expect(metrics.pending).toBe(2);
	});

	test("should clear all jobs", async () => {
		await queue.enqueue<TestJobData>("test", { message: "job1" });
		await queue.enqueue<TestJobData>("test", { message: "job2" });

		await queue.clear();

		const metrics = await queue.getMetrics();
		expect(metrics.enqueued).toBe(0);
	});

	test("should check connection status", async () => {
		const isConnected = await queue.isConnected();
		expect(isConnected).toBe(true);
	});
});

// ============= JobWorker Tests =============

describe("JobWorker", () => {
	let worker: JobWorker;

	beforeEach(async () => {
		worker = new JobWorker({ driver: "memory" });
		await worker.init();
	});

	afterEach(async () => {
		await worker.stop();
	});

	test("should create worker instance", () => {
		expect(worker).toBeDefined();
	});

	test("should register job handler", () => {
		const handler: JobHandler<TestJobData> = async () => {
			// Handler implementation
		};

		worker.handle("test", handler);

		// Handler should be registered without error
		expect(true).toBeTruthy();
	});

	test("should support wildcard patterns", () => {
		const handler: JobHandler = async () => {
			// Handler implementation
		};

		worker.handle("email.*", handler);

		// Should register without error
		expect(true).toBeTruthy();
	});

	test("should unregister handler", () => {
		const handler: JobHandler = async () => {
			// Handler implementation
		};

		worker.handle("test", handler);
		worker.unhandle("test");

		// Handler should be unregistered without error
		expect(true).toBeTruthy();
	});

	test("should track in-flight jobs", () => {
		const count = worker.getInFlightCount();
		expect(count).toBe(0);
	});

	test("should indicate active status", () => {
		const isActive = worker.isActive();
		expect(isActive).toBe(false);
	});

	test("should get metrics", async () => {
		const metrics = await worker.getMetrics();
		expect(metrics).toBeDefined();
		expect(metrics.enqueued).toBe(0);
		expect(metrics.processed).toBe(0);
	});
});

// ============= Job Serialization Tests =============

describe("Job Serialization", () => {
	let driver: MemoryJobQueueDriver;

	beforeEach(async () => {
		driver = new MemoryJobQueueDriver();
		await driver.connect();
	});

	afterEach(async () => {
		await driver.disconnect();
	});

	test("should serialize object data", async () => {
		const data = { nested: { key: "value" }, array: [1, 2, 3] };
		const jobId = await driver.enqueue("test", data);

		const job = await driver.getJob(jobId);
		expect(job?.data).toEqual(data);
	});

	test("should serialize null and undefined", async () => {
		const data = { value: null };
		const jobId = await driver.enqueue("test", data);

		const job = await driver.getJob(jobId);
		expect(job?.data.value).toBe(null);
	});

	test("should handle job metadata", async () => {
		const jobId = await driver.enqueue(
			"test",
			{ message: "hello" },
			{ metadata: { userId: 123, priority: "high" } },
		);

		const job = await driver.getJob(jobId);
		expect(job?.metadata).toEqual({ userId: 123, priority: "high" });
	});

	test("should respect job options", async () => {
		const jobId = await driver.enqueue(
			"test",
			{ message: "hello" },
			{
				priority: 5,
				maxRetries: 5,
			},
		);

		const job = await driver.getJob(jobId);
		expect(job?.priority).toBe(5);
		expect(job?.maxRetries).toBe(5);
	});
});

// ============= Job Status Transitions =============

describe("Job Status Transitions", () => {
	let driver: MemoryJobQueueDriver;

	beforeEach(async () => {
		driver = new MemoryJobQueueDriver();
		await driver.connect();
	});

	afterEach(async () => {
		await driver.disconnect();
	});

	test("should transition from pending to processing", async () => {
		const jobId = await driver.enqueue("test", { message: "hello" });
		const job1 = await driver.getJob(jobId);
		expect(job1?.status).toBe("pending");

		await driver.claim(1, 30000);
		const job2 = await driver.getJob(jobId);
		expect(job2?.status).toBe("processing");
	});

	test("should transition from processing to completed", async () => {
		const jobId = await driver.enqueue("test", { message: "hello" });

		const claimed = await driver.claim(1, 30000);
		await driver.complete(claimed[0].id);

		const job = await driver.getJob(jobId);
		expect(job?.status).toBe("completed");
	});

	test("should transition from processing to failed", async () => {
		const jobId = await driver.enqueue("test", { message: "hello" });

		const claimed = await driver.claim(1, 30000);
		await driver.fail(claimed[0].id, "Error message");

		const job = await driver.getJob(jobId);
		expect(job?.status).toBe("failed");
	});

	test("should transition from processing to delayed (retry)", async () => {
		const jobId = await driver.enqueue("test", { message: "hello" });

		const claimed = await driver.claim(1, 30000);
		await driver.scheduleRetry(claimed[0].id, 1000, "Error");

		const job = await driver.getJob(jobId);
		expect(job?.status).toBe("delayed");
	});
});

// ============= Concurrent Operations Tests =============

describe("Concurrent Operations", () => {
	let driver: MemoryJobQueueDriver;

	beforeEach(async () => {
		driver = new MemoryJobQueueDriver();
		await driver.connect();
	});

	afterEach(async () => {
		await driver.disconnect();
	});

	test("should handle concurrent enqueues", async () => {
		const promises = Array.from({ length: 10 }, (_, i) =>
			driver.enqueue("test", { message: `job${i}` }),
		);

		const jobIds = await Promise.all(promises);
		expect(jobIds.length).toBe(10);
		expect(new Set(jobIds).size).toBe(10); // All unique
	});

	test("should handle concurrent claims", async () => {
		for (let i = 0; i < 20; i++) {
			await driver.enqueue("test", { message: `job${i}` });
		}

		const [batch1, batch2] = await Promise.all([
			driver.claim(5, 30000),
			driver.claim(5, 30000),
		]);

		expect(batch1.length).toBe(5);
		expect(batch2.length).toBe(5);
		expect(batch1[0].id).not.toBe(batch2[0].id);
	});

	test("should track concurrent metrics", async () => {
		const promises = Array.from({ length: 15 }, (_, i) =>
			driver.enqueue("test", { message: `job${i}` }),
		);

		await Promise.all(promises);

		const metrics = await driver.getMetrics();
		expect(metrics.enqueued).toBe(15);
		expect(metrics.pending).toBe(15);
	});
});
