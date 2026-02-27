/**
 * Background Jobs Module
 *
 * Complete job queue system with Redis/Memory drivers,
 * handler registration, and event system.
 */

// Export types
export type {
	Job,
	JobStatus,
	JobQueueConfig,
	QueueOptions,
	JobHandler,
	QueueMetrics,
	JobEvent,
	JobEventType,
	JobClaimHandle,
	JobQueueDriver,
	HandlerRegistryEntry,
	JobConfigValidationResult,
} from "./types";

// Export main classes
export { JobQueue, createJobQueue } from "./queue";
export { JobWorker, startWorker } from "./worker";

// Export drivers
export { MemoryJobQueueDriver } from "./drivers/memory";
export { RedisJobQueueDriver } from "./drivers/redis";
