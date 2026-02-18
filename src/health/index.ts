/**
 * Health Check System
 *
 * Provides health check endpoints for production monitoring:
 * - /health (liveness probe) - Returns 200 if server is running
 * - /ready (readiness probe) - Returns 200 only if all checks pass
 */

import type { Context } from "../context";
import type { Middleware } from "../middleware";

// ============= Types =============

/**
 * Health check status
 */
export type HealthStatus = "healthy" | "unhealthy" | "degraded";

/**
 * Individual check result
 */
export interface CheckResult {
	status: HealthStatus;
	latency?: number;
	message?: string;
}

/**
 * Overall health check result
 */
export interface HealthCheckResult {
	status: HealthStatus;
	timestamp: string;
	version?: string;
	uptime?: number;
	checks?: Record<string, CheckResult>;
}

/**
 * Health check function type
 */
export type HealthCheckFn = () => Promise<CheckResult> | CheckResult;

/**
 * Options for individual health checks
 */
export interface CheckOptions {
	/** Whether this check is critical for readiness (default: true) */
	critical?: boolean;
	/** Timeout in milliseconds (default: 5000) */
	timeout?: number;
	/** Description of the check */
	description?: string;
}

/**
 * Registered health check entry
 */
interface RegisteredCheck {
	name: string;
	fn: HealthCheckFn;
	options: Required<CheckOptions>;
}

/**
 * Options for health middleware
 */
export interface HealthMiddlewareOptions {
	/** Path for liveness probe (default: /health) */
	healthPath?: string;
	/** Path for readiness probe (default: /ready) */
	readyPath?: string;
	/** Whether to expose metrics in response (default: true) */
	exposeMetrics?: boolean;
	/** Initial health checks to register */
	checks?: Record<string, HealthCheckFn | { fn: HealthCheckFn; options?: CheckOptions }>;
	/** Custom version string (default: from package.json) */
	version?: string;
}

/**
 * Database interface for built-in checker
 */
export interface DatabaseLike {
	query?(sql: string): Promise<unknown>;
	execute?(sql: string): Promise<unknown>;
	healthCheck?(): Promise<boolean>;
}

/**
 * Cache interface for built-in checker
 */
export interface CacheLike {
	get?(key: string): Promise<unknown>;
	set?(key: string, value: unknown): Promise<unknown>;
	ping?(): Promise<unknown>;
	healthCheck?(): Promise<boolean>;
}

// ============= HealthCheckManager Class =============

/**
 * Manages health checks for the application
 */
export class HealthCheckManager {
	private checks: Map<string, RegisteredCheck> = new Map();
	private startTime = Date.now();
	private version: string;

	constructor(version?: string) {
		this.version = version ?? "0.1.0";
	}

	/**
	 * Register a health check
	 */
	registerCheck(
		name: string,
		checkFn: HealthCheckFn,
		options: CheckOptions = {},
	): this {
		this.checks.set(name, {
			name,
			fn: checkFn,
			options: {
				critical: options.critical ?? true,
				timeout: options.timeout ?? 5000,
				description: options.description ?? "",
			},
		});
		return this;
	}

	/**
	 * Remove a health check
	 */
	removeCheck(name: string): boolean {
		return this.checks.delete(name);
	}

	/**
	 * Get all registered check names
	 */
	getCheckNames(): string[] {
		return Array.from(this.checks.keys());
	}

	/**
	 * Check if a check is registered
	 */
	hasCheck(name: string): boolean {
		return this.checks.has(name);
	}

	/**
	 * Run a single check with timeout
	 */
	private async runSingleCheck(check: RegisteredCheck): Promise<CheckResult> {
		const start = Date.now();

		try {
			// Run check with timeout
			const result = await Promise.race([
				check.fn(),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error(`Check timed out after ${check.options.timeout}ms`)),
						check.options.timeout,
					),
				),
			]);

			return {
				...result,
				latency: Date.now() - start,
			};
		} catch (error) {
			return {
				status: "unhealthy",
				latency: Date.now() - start,
				message: error instanceof Error ? error.message : "Check failed",
			};
		}
	}

	/**
	 * Execute all registered checks
	 */
	async runChecks(): Promise<Record<string, CheckResult>> {
		const results: Record<string, CheckResult> = {};

		// Run all checks in parallel
		const entries = Array.from(this.checks.values());
		const outcomes = await Promise.all(
			entries.map(async (check) => ({
				name: check.name,
				result: await this.runSingleCheck(check),
				critical: check.options.critical,
			})),
		);

		for (const { name, result } of outcomes) {
			results[name] = result;
		}

		return results;
	}

	/**
	 * Get liveness status (lightweight - no dependency checks)
	 */
	getHealth(): HealthCheckResult {
		return {
			status: "healthy",
			timestamp: new Date().toISOString(),
			version: this.version,
			uptime: Math.floor((Date.now() - this.startTime) / 1000),
		};
	}

	/**
	 * Get readiness status (runs all checks)
	 */
	async getReadiness(): Promise<HealthCheckResult> {
		const checks = await this.runChecks();

		// Determine overall status
		let status: HealthStatus = "healthy";
		let hasUnhealthyCritical = false;
		let hasUnhealthyNonCritical = false;
		let hasDegraded = false;

		const entries = Array.from(this.checks.values());

		for (const entry of entries) {
			const checkResult = checks[entry.name];
			if (checkResult) {
				// Critical checks affect overall status
				if (entry.options.critical && checkResult.status === "unhealthy") {
					hasUnhealthyCritical = true;
				}
				// Non-critical unhealthy checks degrade status
				if (!entry.options.critical && checkResult.status === "unhealthy") {
					hasUnhealthyNonCritical = true;
				}
				// Any degraded check degrades overall status
				if (checkResult.status === "degraded") {
					hasDegraded = true;
				}
			}
		}

		// Determine final status based on flags
		if (hasUnhealthyCritical) {
			status = "unhealthy";
		} else if (hasUnhealthyNonCritical || hasDegraded) {
			status = "degraded";
		}

		return {
			status,
			timestamp: new Date().toISOString(),
			version: this.version,
			uptime: Math.floor((Date.now() - this.startTime) / 1000),
			checks,
		};
	}

	/**
	 * Get uptime in seconds
	 */
	getUptime(): number {
		return Math.floor((Date.now() - this.startTime) / 1000);
	}

	/**
	 * Reset start time (useful for testing)
	 */
	resetStartTime(): void {
		this.startTime = Date.now();
	}
}

// ============= Middleware Factory =============

/**
 * Create health check middleware
 */
export function createHealthMiddleware(
	options: HealthMiddlewareOptions = {},
): { middleware: Middleware; manager: HealthCheckManager } {
	const {
		healthPath = "/health",
		readyPath = "/ready",
		exposeMetrics = true,
		checks = {},
		version,
	} = options;

	const manager = new HealthCheckManager(version);

	// Register initial checks
	for (const [name, check] of Object.entries(checks)) {
		if (typeof check === "function") {
			manager.registerCheck(name, check);
		} else {
			manager.registerCheck(name, check.fn, check.options);
		}
	}

	const middleware: Middleware = async (
		context: Context,
		next: () => Promise<Response>,
	): Promise<Response> => {
		const path = context.path;

		// Handle liveness probe
		if (path === healthPath && context.method === "GET") {
			const health = manager.getHealth();
			return context.json(health);
		}

		// Handle readiness probe
		if (path === readyPath && context.method === "GET") {
			const readiness = await manager.getReadiness();

			// Set appropriate status code
			if (readiness.status === "unhealthy") {
				context.status(503);
			} else if (readiness.status === "degraded") {
				context.status(200); // Still serve traffic but with warning
			}

			// Optionally strip metrics
			const response = exposeMetrics
				? readiness
				: { status: readiness.status, timestamp: readiness.timestamp };

			return context.json(response);
		}

		// Continue to next middleware/handler
		return next();
	};

	return { middleware, manager };
}

// ============= Built-in Checkers =============

/**
 * Create a database connectivity check
 */
export function createDatabaseCheck(
	db: DatabaseLike,
	options: { query?: string; timeout?: number } = {},
): HealthCheckFn {
	const { query = "SELECT 1" } = options;

	return async (): Promise<CheckResult> => {
		const start = Date.now();

		try {
			// Use custom healthCheck method if available
			if (typeof db.healthCheck === "function") {
				const isHealthy = await db.healthCheck();
				return {
					status: isHealthy ? "healthy" : "unhealthy",
					latency: Date.now() - start,
					message: isHealthy ? "Database connection OK" : "Database health check failed",
				};
			}

			// Try to execute a simple query
			if (typeof db.query === "function") {
				await db.query(query);
				return {
					status: "healthy",
					latency: Date.now() - start,
					message: "Database connection OK",
				};
			}

			if (typeof db.execute === "function") {
				await db.execute(query);
				return {
					status: "healthy",
					latency: Date.now() - start,
					message: "Database connection OK",
				};
			}

			return {
				status: "degraded",
				latency: Date.now() - start,
				message: "No compatible database method found",
			};
		} catch (error) {
			return {
				status: "unhealthy",
				latency: Date.now() - start,
				message: error instanceof Error ? error.message : "Database check failed",
			};
		}
	};
}

/**
 * Create a cache connectivity check
 */
export function createCacheCheck(
	cache: CacheLike,
	options: { testKey?: string; timeout?: number } = {},
): HealthCheckFn {
	const { testKey = "__health_check__" } = options;

	return async (): Promise<CheckResult> => {
		const start = Date.now();

		try {
			// Use custom healthCheck method if available
			if (typeof cache.healthCheck === "function") {
				const isHealthy = await cache.healthCheck();
				return {
					status: isHealthy ? "healthy" : "unhealthy",
					latency: Date.now() - start,
					message: isHealthy ? "Cache connection OK" : "Cache health check failed",
				};
			}

			// Use ping method if available (Redis-like)
			if (typeof cache.ping === "function") {
				await cache.ping();
				return {
					status: "healthy",
					latency: Date.now() - start,
					message: "Cache ping OK",
				};
			}

			// Try set and get operations
			if (typeof cache.set === "function" && typeof cache.get === "function") {
				const testValue = Date.now().toString();
				await cache.set(testKey, testValue);
				const retrieved = await cache.get(testKey);

				if (retrieved === testValue || retrieved?.toString() === testValue) {
					return {
						status: "healthy",
						latency: Date.now() - start,
						message: "Cache read/write OK",
					};
				}

				return {
					status: "degraded",
					latency: Date.now() - start,
					message: "Cache read/write mismatch",
				};
			}

			return {
				status: "degraded",
				latency: Date.now() - start,
				message: "No compatible cache method found",
			};
		} catch (error) {
			return {
				status: "unhealthy",
				latency: Date.now() - start,
				message: error instanceof Error ? error.message : "Cache check failed",
			};
		}
	};
}

/**
 * Create a custom health check with timeout
 */
export function createCustomCheck(
	checkFn: () => Promise<boolean> | boolean,
	options: { message?: string; timeout?: number } = {},
): HealthCheckFn {
	const { message = "Custom check" } = options;

	return async (): Promise<CheckResult> => {
		const start = Date.now();

		try {
			const result = await checkFn();
			return {
				status: result ? "healthy" : "unhealthy",
				latency: Date.now() - start,
				message: result ? `${message} OK` : `${message} failed`,
			};
		} catch (error) {
			return {
				status: "unhealthy",
				latency: Date.now() - start,
				message: error instanceof Error ? error.message : `${message} failed`,
			};
		}
	};
}

/**
 * Create a TCP port check
 */
export function createTCPCheck(
	host: string,
	port: number,
	options: { timeout?: number } = {},
): HealthCheckFn {
	const { timeout = 5000 } = options;

	return async (): Promise<CheckResult> => {
		const start = Date.now();

		try {
			// Use Bun's connect API
			const socket = await Bun.connect({
				hostname: host,
				port,
				socket: {
					data() {},
					error() {},
				},
			});
			socket.end();

			return {
				status: "healthy",
				latency: Date.now() - start,
				message: `TCP ${host}:${port} reachable`,
			};
		} catch (error) {
			return {
				status: "unhealthy",
				latency: Date.now() - start,
				message: `TCP ${host}:${port} unreachable: ${error instanceof Error ? error.message : "unknown error"}`,
			};
		}
	};
}

/**
 * Create an HTTP endpoint check
 */
export function createHTTPCheck(
	url: string,
	options: {
		expectedStatus?: number;
		timeout?: number;
		headers?: Record<string, string>;
	} = {},
): HealthCheckFn {
	const { expectedStatus = 200, timeout = 5000, headers = {} } = options;

	return async (): Promise<CheckResult> => {
		const start = Date.now();

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), timeout);

			const response = await fetch(url, {
				method: "GET",
				headers,
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (response.status === expectedStatus) {
				return {
					status: "healthy",
					latency: Date.now() - start,
					message: `HTTP ${url} returned ${response.status}`,
				};
			}

			return {
				status: "unhealthy",
				latency: Date.now() - start,
				message: `HTTP ${url} returned ${response.status}, expected ${expectedStatus}`,
			};
		} catch (error) {
			return {
				status: "unhealthy",
				latency: Date.now() - start,
				message: `HTTP ${url} failed: ${error instanceof Error ? error.message : "unknown error"}`,
			};
		}
	};
}

// ============= Factory Functions =============

/**
 * Create a new health check manager
 */
export function createHealthManager(version?: string): HealthCheckManager {
	return new HealthCheckManager(version);
}