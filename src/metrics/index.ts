/**
 * Runtime Metrics Module
 *
 * Provides runtime metrics collection for memory, CPU usage, and other statistics.
 * Part of Layer 7 (Testing & Observability) implementation.
 */

// ============= Types =============

/**
 * Runtime metrics snapshot
 */
export interface RuntimeMetrics {
	// Memory
	/** Heap memory used in bytes */
	memoryHeapUsed: number;
	/** Total heap memory in bytes */
	memoryHeapTotal: number;
	/** External memory (C++ objects bound to JS) in bytes */
	memoryExternal: number;
	/** Resident Set Size in bytes */
	memoryRss: number;

	// CPU
	/** User CPU time in microseconds */
	cpuUser: number;
	/** System CPU time in microseconds */
	cpuSystem: number;

	// Runtime
	/** Process uptime in seconds */
	uptime: number;
	/** Event loop lag in milliseconds */
	eventLoopLag: number;

	// Timestamp
	/** ISO 8601 timestamp */
	timestamp: string;
}

/**
 * Human-readable metrics summary
 */
export interface MetricsSummary {
	memoryHeapUsed: string;
	memoryHeapTotal: string;
	memoryExternal: string;
	memoryRss: string;
	cpuUser: string;
	cpuSystem: string;
	uptime: string;
	eventLoopLag: string;
	timestamp: string;
}

/**
 * Options for MetricsCollector
 */
export interface MetricsCollectorOptions {
	/** Maximum number of historical snapshots to keep (default: 100) */
	maxHistorySize?: number;
	/** Include event loop lag measurement (default: true) */
	measureEventLoopLag?: boolean;
}

/**
 * Averaged metrics over time
 */
export interface AveragedMetrics {
	avgMemoryHeapUsed: number;
	avgMemoryHeapTotal: number;
	avgMemoryExternal: number;
	avgMemoryRss: number;
	avgCpuUser: number;
	avgCpuSystem: number;
	avgEventLoopLag: number;
	minMemoryHeapUsed: number;
	maxMemoryHeapUsed: number;
	sampleCount: number;
	timeRange: {
		start: string;
		end: string;
	};
}

// ============= Helper Functions =============

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";

	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	const value = bytes / Math.pow(1024, i);

	// Use appropriate decimal places
	if (i === 0) return `${value} ${units[i]}`;
	if (value >= 100) return `${value.toFixed(1)} ${units[i]}`;
	return `${value.toFixed(2)} ${units[i]}`;
}

/**
 * Format microseconds to human-readable string
 */
export function formatMicroseconds(microseconds: number): string {
	if (microseconds < 1000) {
		return `${microseconds.toFixed(0)} µs`;
	}
	const ms = microseconds / 1000;
	if (ms < 1000) {
		return `${ms.toFixed(2)} ms`;
	}
	const seconds = ms / 1000;
	return `${seconds.toFixed(2)} s`;
}

/**
 * Format seconds to human-readable uptime string
 */
export function formatUptime(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);

	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0) parts.push(`${minutes}m`);
	if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

	return parts.join(" ");
}

/**
 * Get human-readable metrics summary
 */
export function getMetricsSummary(metrics: RuntimeMetrics): MetricsSummary {
	return {
		memoryHeapUsed: formatBytes(metrics.memoryHeapUsed),
		memoryHeapTotal: formatBytes(metrics.memoryHeapTotal),
		memoryExternal: formatBytes(metrics.memoryExternal),
		memoryRss: formatBytes(metrics.memoryRss),
		cpuUser: formatMicroseconds(metrics.cpuUser),
		cpuSystem: formatMicroseconds(metrics.cpuSystem),
		uptime: formatUptime(metrics.uptime),
		eventLoopLag: `${metrics.eventLoopLag.toFixed(2)} ms`,
		timestamp: metrics.timestamp,
	};
}

// ============= Event Loop Lag Measurement =============

/**
 * Measure event loop lag using deferred execution timing
 * @returns Promise resolving to lag in milliseconds
 */
export async function measureEventLoopLag(): Promise<number> {
	const start = Bun.nanoseconds();
	await new Promise((resolve) => setTimeout(resolve, 0));
	const end = Bun.nanoseconds();
	return (end - start) / 1e6; // Convert nanoseconds to milliseconds
}

/**
 * Measure event loop lag multiple times and return average
 */
export async function measureEventLoopLagAverage(
	samples: number = 5,
): Promise<number> {
	const measurements: number[] = [];

	for (let i = 0; i < samples; i++) {
		measurements.push(await measureEventLoopLag());
	}

	return measurements.reduce((a, b) => a + b, 0) / measurements.length;
}

// ============= MetricsCollector Class =============

/**
 * Collects and manages runtime metrics
 */
export class MetricsCollector {
	private history: RuntimeMetrics[] = [];
	private maxHistorySize: number;
	private measureEventLoopLagEnabled: boolean;
	private periodicTimer: Timer | null = null;
	private lastCpuUsage: NodeJS.CpuUsage | undefined = undefined;

	constructor(options: MetricsCollectorOptions = {}) {
		this.maxHistorySize = options.maxHistorySize ?? 100;
		this.measureEventLoopLagEnabled = options.measureEventLoopLag ?? true;
	}

	/**
	 * Collect current runtime metrics
	 */
	async collect(): Promise<RuntimeMetrics> {
		// Get memory metrics
		const memUsage = process.memoryUsage();

		// Get CPU metrics
		const cpuUsage = process.cpuUsage(this.lastCpuUsage);
		this.lastCpuUsage = process.cpuUsage();

		// Get uptime
		const uptime = process.uptime();

		// Measure event loop lag if enabled
		let eventLoopLag = 0;
		if (this.measureEventLoopLagEnabled) {
			eventLoopLag = await measureEventLoopLag();
		}

		const metrics: RuntimeMetrics = {
			memoryHeapUsed: memUsage.heapUsed,
			memoryHeapTotal: memUsage.heapTotal,
			memoryExternal: memUsage.external,
			memoryRss: memUsage.rss,
			cpuUser: cpuUsage.user,
			cpuSystem: cpuUsage.system,
			uptime,
			eventLoopLag,
			timestamp: new Date().toISOString(),
		};

		// Add to history
		this.history.push(metrics);

		// Trim history if needed
		if (this.history.length > this.maxHistorySize) {
			this.history.shift();
		}

		return metrics;
	}

	/**
	 * Start collecting metrics at regular intervals
	 * @param intervalMs Interval in milliseconds (default: 5000)
	 */
	startPeriodicCollection(intervalMs: number = 5000): void {
		if (this.periodicTimer !== null) {
			throw new Error("Periodic collection is already running");
		}

		// Collect immediately
		this.collect().catch(() => {
			// Ignore errors in initial collection
		});

		// Set up periodic collection
		this.periodicTimer = setInterval(() => {
			this.collect().catch(() => {
				// Ignore errors in periodic collection
			});
		}, intervalMs);
	}

	/**
	 * Stop periodic collection
	 */
	stopPeriodicCollection(): void {
		if (this.periodicTimer !== null) {
			clearInterval(this.periodicTimer);
			this.periodicTimer = null;
		}
	}

	/**
	 * Check if periodic collection is running
	 */
	isCollecting(): boolean {
		return this.periodicTimer !== null;
	}

	/**
	 * Get historical metrics snapshots
	 */
	getHistory(): RuntimeMetrics[] {
		return [...this.history];
	}

	/**
	 * Get the most recent metrics
	 */
	getLatest(): RuntimeMetrics | null {
		return this.history.length > 0
			? { ...this.history[this.history.length - 1] }
			: null;
	}

	/**
	 * Get averaged metrics over time
	 */
	getAverage(): AveragedMetrics | null {
		if (this.history.length === 0) {
			return null;
		}

		const count = this.history.length;
		let sumHeapUsed = 0;
		let sumHeapTotal = 0;
		let sumExternal = 0;
		let sumRss = 0;
		let sumCpuUser = 0;
		let sumCpuSystem = 0;
		let sumEventLoopLag = 0;
		let minHeapUsed = Infinity;
		let maxHeapUsed = 0;

		for (const m of this.history) {
			sumHeapUsed += m.memoryHeapUsed;
			sumHeapTotal += m.memoryHeapTotal;
			sumExternal += m.memoryExternal;
			sumRss += m.memoryRss;
			sumCpuUser += m.cpuUser;
			sumCpuSystem += m.cpuSystem;
			sumEventLoopLag += m.eventLoopLag;
			minHeapUsed = Math.min(minHeapUsed, m.memoryHeapUsed);
			maxHeapUsed = Math.max(maxHeapUsed, m.memoryHeapUsed);
		}

		return {
			avgMemoryHeapUsed: Math.round(sumHeapUsed / count),
			avgMemoryHeapTotal: Math.round(sumHeapTotal / count),
			avgMemoryExternal: Math.round(sumExternal / count),
			avgMemoryRss: Math.round(sumRss / count),
			avgCpuUser: Math.round(sumCpuUser / count),
			avgCpuSystem: Math.round(sumCpuSystem / count),
			avgEventLoopLag: Math.round((sumEventLoopLag / count) * 100) / 100,
			minMemoryHeapUsed: minHeapUsed === Infinity ? 0 : minHeapUsed,
			maxMemoryHeapUsed: maxHeapUsed,
			sampleCount: count,
			timeRange: {
				start: this.history[0].timestamp,
				end: this.history[count - 1].timestamp,
			},
		};
	}

	/**
	 * Clear history
	 */
	reset(): void {
		this.history = [];
		this.lastCpuUsage = undefined;
	}

	/**
	 * Get the number of samples in history
	 */
	getHistorySize(): number {
		return this.history.length;
	}
}

// ============= Prometheus Format Export =============

/**
 * Export metrics in Prometheus text format
 * @param metrics Runtime metrics to export
 * @returns Prometheus formatted string
 */
export function toPrometheusFormat(metrics: RuntimeMetrics): string {
	const timestamp = Date.now();
	const lines: string[] = [];

	// Memory metrics
	lines.push("# HELP process_memory_heap_used_bytes Heap memory used in bytes");
	lines.push("# TYPE process_memory_heap_used_bytes gauge");
	lines.push(
		`process_memory_heap_used_bytes ${metrics.memoryHeapUsed} ${timestamp}`,
	);

	lines.push("# HELP process_memory_heap_total_bytes Total heap memory in bytes");
	lines.push("# TYPE process_memory_heap_total_bytes gauge");
	lines.push(
		`process_memory_heap_total_bytes ${metrics.memoryHeapTotal} ${timestamp}`,
	);

	lines.push("# HELP process_memory_external_bytes External memory in bytes");
	lines.push("# TYPE process_memory_external_bytes gauge");
	lines.push(
		`process_memory_external_bytes ${metrics.memoryExternal} ${timestamp}`,
	);

	lines.push("# HELP process_memory_rss_bytes Resident Set Size in bytes");
	lines.push("# TYPE process_memory_rss_bytes gauge");
	lines.push(`process_memory_rss_bytes ${metrics.memoryRss} ${timestamp}`);

	// CPU metrics
	lines.push("# HELP process_cpu_user_seconds_total Total user CPU time");
	lines.push("# TYPE process_cpu_user_seconds_total counter");
	lines.push(
		`process_cpu_user_seconds_total ${(metrics.cpuUser / 1e6).toFixed(6)} ${timestamp}`,
	);

	lines.push("# HELP process_cpu_system_seconds_total Total system CPU time");
	lines.push("# TYPE process_cpu_system_seconds_total counter");
	lines.push(
		`process_cpu_system_seconds_total ${(metrics.cpuSystem / 1e6).toFixed(6)} ${timestamp}`,
	);

	// Runtime metrics
	lines.push("# HELP process_uptime_seconds Process uptime in seconds");
	lines.push("# TYPE process_uptime_seconds gauge");
	lines.push(`process_uptime_seconds ${metrics.uptime.toFixed(2)} ${timestamp}`);

	lines.push("# HELP nodejs_eventloop_lag_ms Event loop lag in milliseconds");
	lines.push("# TYPE nodejs_eventloop_lag_ms gauge");
	lines.push(
		`nodejs_eventloop_lag_ms ${metrics.eventLoopLag.toFixed(2)} ${timestamp}`,
	);

	return lines.join("\n");
}

/**
 * Export averaged metrics in Prometheus format
 */
export function averagedMetricsToPrometheus(
	averaged: AveragedMetrics,
): string {
	const timestamp = Date.now();
	const lines: string[] = [];

	lines.push("# HELP process_memory_heap_used_avg_bytes Average heap memory used");
	lines.push("# TYPE process_memory_heap_used_avg_bytes gauge");
	lines.push(
		`process_memory_heap_used_avg_bytes ${averaged.avgMemoryHeapUsed} ${timestamp}`,
	);

	lines.push("# HELP process_memory_heap_used_min_bytes Minimum heap memory used");
	lines.push("# TYPE process_memory_heap_used_min_bytes gauge");
	lines.push(
		`process_memory_heap_used_min_bytes ${averaged.minMemoryHeapUsed} ${timestamp}`,
	);

	lines.push("# HELP process_memory_heap_used_max_bytes Maximum heap memory used");
	lines.push("# TYPE process_memory_heap_used_max_bytes gauge");
	lines.push(
		`process_memory_heap_used_max_bytes ${averaged.maxMemoryHeapUsed} ${timestamp}`,
	);

	lines.push("# HELP process_eventloop_lag_avg_ms Average event loop lag");
	lines.push("# TYPE process_eventloop_lag_avg_ms gauge");
	lines.push(
		`process_eventloop_lag_avg_ms ${averaged.avgEventLoopLag.toFixed(2)} ${timestamp}`,
	);

	lines.push("# HELP process_metrics_sample_count Number of samples collected");
	lines.push("# TYPE process_metrics_sample_count gauge");
	lines.push(`process_metrics_sample_count ${averaged.sampleCount} ${timestamp}`);

	return lines.join("\n");
}

// ============= Factory Functions =============

/**
 * Create a new metrics collector
 */
export function createMetricsCollector(
	options?: MetricsCollectorOptions,
): MetricsCollector {
	return new MetricsCollector(options);
}

/**
 * Collect metrics once without a collector
 */
export async function collectMetrics(): Promise<RuntimeMetrics> {
	const memUsage = process.memoryUsage();
	const cpuUsage = process.cpuUsage();
	const uptime = process.uptime();
	const eventLoopLag = await measureEventLoopLag();

	return {
		memoryHeapUsed: memUsage.heapUsed,
		memoryHeapTotal: memUsage.heapTotal,
		memoryExternal: memUsage.external,
		memoryRss: memUsage.rss,
		cpuUser: cpuUsage.user,
		cpuSystem: cpuUsage.system,
		uptime,
		eventLoopLag,
		timestamp: new Date().toISOString(),
	};
}