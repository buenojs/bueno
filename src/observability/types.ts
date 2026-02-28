/**
 * Observability Types
 *
 * Core interfaces for the error tracking and observability integration layer.
 * Implement ErrorReporter to integrate with Sentry, Bugsnag, Datadog, etc.
 */

// ============= Breadcrumbs =============

/**
 * A single breadcrumb entry recording an event that occurred before an error
 */
export interface BreadcrumbEntry {
	/** When this breadcrumb was recorded */
	timestamp: Date;
	/** Category of event */
	type: "http" | "log" | "navigation" | "custom";
	/** Severity level */
	level: "debug" | "info" | "warning" | "error";
	/** Human-readable description of the event */
	message: string;
	/** Optional structured data for context */
	data?: Record<string, unknown>;
}

// ============= Error Event =============

/**
 * Request metadata captured at error time
 */
export interface ErrorRequestContext {
	/** HTTP method */
	method: string;
	/** Request path */
	path: string;
	/** Relevant request headers (sanitized) */
	headers: Record<string, string>;
	/** Client IP address */
	ip: string;
	/** User-Agent header if present */
	userAgent?: string;
}

/**
 * User identity snapshot (sourced from context.get('user'))
 */
export interface ErrorUserContext {
	id?: string | number;
	email?: string;
	[key: string]: unknown;
}

/**
 * A captured error event with full context, ready for the reporter
 */
export interface ErrorEvent {
	/** Unique ID for this error event (for deduplication) */
	id: string;
	/** When the error occurred */
	timestamp: Date;
	/** The original Error object */
	error: Error;
	/** Severity level */
	level: "fatal" | "error" | "warning";
	/** HTTP request context (undefined for non-HTTP errors) */
	request?: ErrorRequestContext;
	/** W3C trace ID (from traceparent header or generated) */
	traceId?: string;
	/** W3C span ID */
	spanId?: string;
	/** Authenticated user at time of error */
	user?: ErrorUserContext;
	/** Recent events leading up to this error */
	breadcrumbs: BreadcrumbEntry[];
	/** Custom tags for categorization */
	tags?: Record<string, string>;
	/** Any additional context */
	extra?: Record<string, unknown>;
}

/**
 * A captured message event (non-error) for the reporter
 */
export interface MessageEvent {
	/** Unique ID */
	id: string;
	/** When the message was captured */
	timestamp: Date;
	/** The message text */
	message: string;
	/** Severity */
	level: "debug" | "info" | "warning" | "error";
	/** Optional extra context */
	extra?: Record<string, unknown>;
}

// ============= ErrorReporter Interface =============

/**
 * Implement this interface to report errors to your platform (Sentry, Bugsnag, etc.).
 *
 * @example
 * ```typescript
 * class SentryReporter implements ErrorReporter {
 *   captureError(event: ErrorEvent) {
 *     Sentry.withScope(scope => {
 *       if (event.user) scope.setUser(event.user);
 *       if (event.traceId) scope.setTag('traceId', event.traceId);
 *       Sentry.captureException(event.error);
 *     });
 *   }
 *   async flush() { await Sentry.flush(2000); }
 * }
 * ```
 */
export interface ErrorReporter {
	/**
	 * Report an error event. Called asynchronously (non-blocking).
	 * Throw errors only if truly unrecoverable — they are caught and logged.
	 */
	captureError(event: ErrorEvent): void | Promise<void>;

	/**
	 * Report a non-error message. Optional.
	 */
	captureMessage?(event: MessageEvent): void | Promise<void>;

	/**
	 * Flush pending events. Called on application shutdown.
	 * Use this to ensure all buffered events are sent before process exit.
	 */
	flush?(): Promise<void>;
}

// ============= Module Options =============

/**
 * Options for ObservabilityModule.forRoot()
 */
export interface ObservabilityOptions {
	/**
	 * The reporter that receives all captured error events.
	 * Required — without a reporter, no events are sent anywhere.
	 */
	reporter: ErrorReporter;

	/**
	 * Maximum number of breadcrumbs to retain in the ring buffer.
	 * Older breadcrumbs are evicted when the buffer is full.
	 * @default 20
	 */
	breadcrumbsSize?: number;

	/**
	 * Error classes to suppress — events with these types are not reported.
	 * Useful for suppressing expected errors like 404s or 401s.
	 *
	 * @example ignoreErrors: [NotFoundError, UnauthorizedError]
	 */
	ignoreErrors?: Array<new (...args: unknown[]) => Error>;

	/**
	 * HTTP status codes to suppress.
	 * Errors whose statusCode property matches are not reported.
	 * @example ignoreStatusCodes: [404, 401]
	 */
	ignoreStatusCodes?: number[];

	/**
	 * Custom tags attached to every error event.
	 * @example tags: { environment: 'production', version: '1.2.3' }
	 */
	tags?: Record<string, string>;

	/**
	 * Also capture unhandled promise rejections and uncaught exceptions
	 * at the process level (outside the HTTP request pipeline).
	 * @default false
	 */
	captureUnhandled?: boolean;
}

// ============= Config =============

/**
 * Configuration values that can be set via environment variables.
 * These are applied as defaults; ObservabilityOptions take precedence.
 */
export interface ObservabilityConfig {
	/** Enable/disable the observability system */
	enabled?: boolean;
	/** Maximum breadcrumb ring buffer size */
	breadcrumbsSize?: number;
	/** HTTP status codes to ignore (comma-separated in env) */
	ignoreStatusCodes?: number[];
}
