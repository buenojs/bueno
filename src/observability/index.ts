/**
 * Observability Module
 *
 * Provides structured error tracking and observability integration for Bueno.
 * Implement ErrorReporter to send events to Sentry, Bugsnag, Datadog, or any
 * custom backend — zero SDK dependencies shipped by the framework.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createApp } from '@buenojs/bueno';
 * import { ObservabilityModule } from '@buenojs/bueno/observability';
 *
 * const app = createApp(AppModule);
 *
 * // Wire everything with a single call
 * const obs = ObservabilityModule.setup(app, {
 *   reporter: new MyReporter(),
 *   breadcrumbsSize: 20,
 *   ignoreStatusCodes: [404, 401],
 *   tags: { environment: 'production' },
 * });
 *
 * await app.listen(3000);
 * ```
 *
 * ## Writing a reporter (Sentry example)
 *
 * ```typescript
 * import * as Sentry from '@sentry/node';
 * import type { ErrorReporter, ErrorEvent } from '@buenojs/bueno/observability';
 *
 * class SentryReporter implements ErrorReporter {
 *   constructor(dsn: string) { Sentry.init({ dsn }); }
 *
 *   captureError(event: ErrorEvent) {
 *     Sentry.withScope(scope => {
 *       if (event.user)    scope.setUser(event.user);
 *       if (event.traceId) scope.setTag('traceId', event.traceId);
 *       event.breadcrumbs.forEach(b => scope.addBreadcrumb(b));
 *       Sentry.captureException(event.error);
 *     });
 *   }
 *
 *   async flush() { await Sentry.flush(2000); }
 * }
 *
 * ObservabilityModule.setup(app, {
 *   reporter: new SentryReporter(process.env.SENTRY_DSN),
 * });
 * ```
 */

import type { Application } from "../modules";
import { ObservabilityService } from "./service";
import { ObservabilityInterceptor } from "./interceptor";
import type { ObservabilityOptions } from "./types";

/**
 * Static module class for configuring observability.
 * Use `ObservabilityModule.setup(app, options)` for the simplest setup.
 */
export class ObservabilityModule {
	/**
	 * One-call setup: creates the ObservabilityService, registers the global
	 * interceptor for trace ID injection and breadcrumb tracking, and wires
	 * process-level shutdown flush.
	 *
	 * Call this before `app.listen()`.
	 *
	 * @param app - The Bueno Application instance (from `createApp()`)
	 * @param options - Observability configuration including the reporter
	 * @returns The ObservabilityService — use for manual captureError / addBreadcrumb
	 *
	 * @example
	 * ```typescript
	 * const obs = ObservabilityModule.setup(app, {
	 *   reporter: new SentryReporter(process.env.SENTRY_DSN),
	 *   ignoreStatusCodes: [404, 401],
	 *   tags: { environment: 'production', version: '1.2.3' },
	 * });
	 *
	 * // Later, in a background job:
	 * obs.captureError(new Error('Job failed'));
	 *
	 * // Add a manual breadcrumb:
	 * obs.addBreadcrumb({ type: 'custom', level: 'info', message: 'Checkout started' });
	 * ```
	 */
	static setup(
		app: Application,
		options: ObservabilityOptions,
	): ObservabilityService {
		const service = new ObservabilityService(options);
		const interceptor = new ObservabilityInterceptor(service);

		// Register global interceptor for trace ID injection + breadcrumbs + error capture
		app.useGlobalInterceptors(interceptor);

		// Register flush on process exit
		service.registerShutdown();

		return service;
	}
}

// ============= Public Exports =============

// Types
export type {
	BreadcrumbEntry,
	ErrorEvent,
	ErrorRequestContext,
	ErrorUserContext,
	MessageEvent,
	ErrorReporter,
	ObservabilityOptions,
	ObservabilityConfig,
} from "./types";

// Service & helpers
export { ObservabilityService } from "./service";
export { extractTraceContext } from "./service";

// Interceptor
export { ObservabilityInterceptor } from "./interceptor";

// Breadcrumb utilities
export {
	BreadcrumbCollector,
	httpBreadcrumb,
	logBreadcrumb,
} from "./breadcrumbs";

// Trace helpers
export { generateTraceId, generateSpanId, buildTraceparent } from "./trace";
