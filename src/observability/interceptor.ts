/**
 * ObservabilityInterceptor
 *
 * Global interceptor that enriches every request with:
 * 1. Trace/span IDs — extracted from W3C `traceparent` header or generated fresh
 * 2. Breadcrumbs — records request entry and exit (with status + duration)
 * 3. Error capture — calls ObservabilityService when a route handler throws
 *
 * Register via ObservabilityModule.setup() (done automatically).
 */

import type { Context } from "../context";
import type { CallHandler, NestInterceptor } from "../modules";
import { generateSpanId, generateTraceId } from "./trace";
import { httpBreadcrumb } from "./breadcrumbs";
import type { ObservabilityService } from "./service";
import { extractTraceContext } from "./service";

/**
 * Resolves trace context from the incoming request.
 * Uses the W3C `traceparent` header if present, otherwise generates new IDs.
 */
function resolveTraceIds(context: Context): {
	traceId: string;
	spanId: string;
} {
	const existing = extractTraceContext(context);
	if (existing.traceId && existing.spanId) {
		return { traceId: existing.traceId, spanId: existing.spanId };
	}
	return { traceId: generateTraceId(), spanId: generateSpanId() };
}

export class ObservabilityInterceptor implements NestInterceptor {
	constructor(private readonly service: ObservabilityService) {}

	async intercept(context: Context, next: CallHandler): Promise<unknown> {
		const startMs = Date.now();

		// 1. Inject trace IDs into context for downstream use
		const { traceId, spanId } = resolveTraceIds(context);
		context.set("traceId", traceId);
		context.set("spanId", spanId);

		// 2. Record request entry breadcrumb
		this.service.addBreadcrumb({
			type: "navigation",
			level: "info",
			message: `${context.method} ${context.path}`,
			data: { traceId, spanId },
		});

		try {
			const result = await next.handle();

			// 3a. Record successful request exit
			const durationMs = Date.now() - startMs;
			const response = result as Response | null;
			const statusCode =
				response instanceof Response ? response.status : undefined;

			this.service
				.getBreadcrumbCollector()
				.add(
					httpBreadcrumb(context.method, context.path, statusCode, durationMs),
				);

			return result;
		} catch (error) {
			// 3b. Capture the error with full request context (non-blocking)
			this.service.captureFromContext(context, error as Error);

			// 4. Record failed request breadcrumb
			const durationMs = Date.now() - startMs;
			this.service
				.getBreadcrumbCollector()
				.add(
					httpBreadcrumb(context.method, context.path, undefined, durationMs),
				);

			// 5. Rethrow so the framework's exception filters still fire
			throw error;
		}
	}
}
