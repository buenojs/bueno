/**
 * ObservabilityService
 *
 * Central service that assembles ErrorEvents and dispatches them to the
 * configured ErrorReporter. Error capture happens through the
 * ObservabilityInterceptor which calls captureFromContext() directly.
 *
 * Exposes addBreadcrumb() and captureError() for manual instrumentation
 * throughout the application.
 */

import type { Context } from "../context";
import { BreadcrumbCollector, httpBreadcrumb } from "./breadcrumbs";
import type {
	BreadcrumbEntry,
	ErrorEvent,
	ErrorReporter,
	ErrorUserContext,
	MessageEvent,
	ObservabilityOptions,
} from "./types";

// ============= Helpers =============

function generateId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function extractSafeHeaders(req: Request): Record<string, string> {
	const safe: Record<string, string> = {};
	const sensitiveHeaders = new Set([
		"authorization",
		"cookie",
		"x-api-key",
		"x-auth-token",
		"proxy-authorization",
	]);
	req.headers.forEach((value, key) => {
		if (!sensitiveHeaders.has(key.toLowerCase())) {
			safe[key] = value;
		}
	});
	return safe;
}

function getStatusCode(error: Error): number | undefined {
	const e = error as Error & { statusCode?: number; status?: number };
	return e.statusCode ?? e.status;
}

// ============= Service =============

/**
 * ObservabilityService manages error reporting and breadcrumb tracking.
 *
 * Use ObservabilityModule.setup(app, options) to wire it to the application,
 * or instantiate directly for contexts where the full module isn't needed.
 *
 * @example
 * ```typescript
 * // Via ObservabilityModule (recommended):
 * const obs = ObservabilityModule.setup(app, {
 *   reporter: new SentryReporter(),
 * });
 *
 * // Manual breadcrumb:
 * obs.addBreadcrumb({
 *   type: 'custom',
 *   level: 'info',
 *   message: 'User completed checkout',
 *   data: { orderId: '123' }
 * });
 * ```
 */
export class ObservabilityService {
	private readonly reporter: ErrorReporter;
	private readonly breadcrumbs: BreadcrumbCollector;
	private readonly options: {
		breadcrumbsSize: number;
		ignoreErrors: Array<new (...args: unknown[]) => Error>;
		ignoreStatusCodes: number[];
		tags: Record<string, string>;
		captureUnhandled: boolean;
	};

	constructor(options: ObservabilityOptions) {
		this.reporter = options.reporter;
		this.options = {
			breadcrumbsSize: options.breadcrumbsSize ?? 20,
			ignoreErrors: options.ignoreErrors ?? [],
			ignoreStatusCodes: options.ignoreStatusCodes ?? [],
			tags: options.tags ?? {},
			captureUnhandled: options.captureUnhandled ?? false,
		};
		this.breadcrumbs = new BreadcrumbCollector(this.options.breadcrumbsSize);

		if (this.options.captureUnhandled) {
			this.setupUnhandledCapture();
		}
	}

	// ============= Framework Integration =============

	/**
	 * Called by ObservabilityInterceptor when an HTTP route throws.
	 * Assembles a full ErrorEvent with request context and dispatches it.
	 * Non-blocking — never delays the HTTP response.
	 */
	captureFromContext(context: Context, error: Error): void {
		if (this.shouldIgnore(error)) return;

		// Add a breadcrumb for the failed request entry
		this.breadcrumbs.add(
			httpBreadcrumb(context.method, context.path, undefined),
		);

		const event = this.assembleEvent(error, "error", context);
		this.dispatchAsync(event);
	}

	/**
	 * Register flush on process shutdown.
	 * Called automatically by ObservabilityModule.setup().
	 */
	registerShutdown(): void {
		const flush = async () => {
			if (this.reporter.flush) {
				try {
					await this.reporter.flush();
				} catch (err) {
					console.error("[ObservabilityService] Reporter flush failed:", err);
				}
			}
		};

		process.once("beforeExit", () => {
			flush().catch(console.error);
		});
	}

	// ============= Public API =============

	/**
	 * Manually capture an error outside the HTTP pipeline.
	 * Useful inside background jobs, event listeners, scheduled tasks.
	 *
	 * @example
	 * obs.captureError(new Error('Payment failed'), 'error');
	 */
	captureError(error: Error, level: ErrorEvent["level"] = "error"): void {
		if (this.shouldIgnore(error)) return;
		const event = this.assembleEvent(error, level);
		this.dispatchAsync(event);
	}

	/**
	 * Manually capture a non-error message.
	 *
	 * @example
	 * obs.captureMessage('Deployment completed', 'info', { version: '2.0.0' });
	 */
	captureMessage(
		message: string,
		level: MessageEvent["level"] = "info",
		extra?: Record<string, unknown>,
	): void {
		if (!this.reporter.captureMessage) return;
		const event: MessageEvent = {
			id: generateId(),
			timestamp: new Date(),
			message,
			level,
			extra,
		};
		this.dispatchMessageAsync(event);
	}

	/**
	 * Add a breadcrumb to the ring buffer.
	 * Breadcrumbs recorded here are included in the next error event.
	 *
	 * @example
	 * obs.addBreadcrumb({
	 *   type: 'custom',
	 *   level: 'info',
	 *   message: 'Fetched user from database',
	 *   data: { userId: 42 }
	 * });
	 */
	addBreadcrumb(
		entry: Omit<BreadcrumbEntry, "timestamp"> & { timestamp?: Date },
	): void {
		this.breadcrumbs.add({
			...entry,
			timestamp: entry.timestamp ?? new Date(),
		});
	}

	/**
	 * Access the underlying BreadcrumbCollector.
	 * Used internally by ObservabilityInterceptor.
	 */
	getBreadcrumbCollector(): BreadcrumbCollector {
		return this.breadcrumbs;
	}

	// ============= Private =============

	private assembleEvent(
		error: Error,
		level: ErrorEvent["level"],
		context?: Context,
	): ErrorEvent {
		const user = context?.get<ErrorUserContext>("user");
		const traceId = context?.get<string>("traceId") ?? undefined;
		const spanId = context?.get<string>("spanId") ?? undefined;

		return {
			id: generateId(),
			timestamp: new Date(),
			error,
			level,
			request: context
				? {
						method: context.method,
						path: context.path,
						headers: extractSafeHeaders(context.req),
						ip: context.ip ?? "",
						userAgent: context.getHeader("user-agent"),
					}
				: undefined,
			traceId,
			spanId,
			user: user ?? undefined,
			breadcrumbs: this.breadcrumbs.getAll(),
			tags: { ...this.options.tags },
		};
	}

	private shouldIgnore(error: Error): boolean {
		for (const ErrorClass of this.options.ignoreErrors) {
			if (error instanceof ErrorClass) return true;
		}
		if (this.options.ignoreStatusCodes.length > 0) {
			const code = getStatusCode(error);
			if (code !== undefined && this.options.ignoreStatusCodes.includes(code)) {
				return true;
			}
		}
		return false;
	}

	private dispatchAsync(event: ErrorEvent): void {
		// Fire-and-forget — never blocks the HTTP response
		Promise.resolve(this.reporter.captureError(event)).catch((err) => {
			console.error("[ObservabilityService] Reporter.captureError failed:", err);
		});
	}

	private dispatchMessageAsync(event: MessageEvent): void {
		if (!this.reporter.captureMessage) return;
		Promise.resolve(this.reporter.captureMessage(event)).catch((err) => {
			console.error(
				"[ObservabilityService] Reporter.captureMessage failed:",
				err,
			);
		});
	}

	private setupUnhandledCapture(): void {
		process.on("unhandledRejection", (reason: unknown) => {
			const error =
				reason instanceof Error
					? reason
					: new Error(String(reason ?? "Unhandled rejection"));
			this.captureError(error, "error");
		});

		process.on("uncaughtException", (error: Error) => {
			this.captureError(error, "fatal");
		});
	}
}

// ============= Trace Context Extraction =============

/**
 * Extract traceId and spanId from the W3C traceparent header.
 * Format: 00-<traceId>-<spanId>-<flags>
 */
export function extractTraceContext(
	context: Context,
): { traceId?: string; spanId?: string } {
	const traceparent = context.getHeader("traceparent");
	if (!traceparent) return {};
	const parts = traceparent.split("-");
	if (parts.length < 4) return {};
	return { traceId: parts[1], spanId: parts[2] };
}
