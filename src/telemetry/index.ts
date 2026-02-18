/**
 * OpenTelemetry OTLP Trace Exporter
 *
 * Provides distributed tracing with OpenTelemetry Protocol (OTLP) export.
 * Part of Layer 7 (Testing & Observability) implementation.
 */

// ============= Types =============

/**
 * Span kind enumeration
 */
export type SpanKind = "server" | "client" | "producer" | "consumer" | "internal";

/**
 * Span status code
 */
export type StatusCode = "ok" | "error" | "unset";

/**
 * Event attached to a span
 */
export interface SpanEvent {
	/** Event name */
	name: string;
	/** Event timestamp in nanoseconds */
	timestamp: number;
	/** Event attributes */
	attributes?: Record<string, string | number | boolean>;
}

/**
 * Span status
 */
export interface SpanStatus {
	/** Status code */
	code: StatusCode;
	/** Optional status message */
	message?: string;
}

/**
 * Span represents a unit of work in distributed tracing
 */
export interface Span {
	/** Unique trace identifier (32 hex characters) */
	traceId: string;
	/** Unique span identifier (16 hex characters) */
	spanId: string;
	/** Parent span identifier if this is a child span */
	parentSpanId?: string;
	/** Span name (operation name) */
	name: string;
	/** Span kind */
	kind: SpanKind;
	/** Start time in nanoseconds */
	startTime: number;
	/** End time in nanoseconds */
	endTime?: number;
	/** Duration in nanoseconds */
	duration?: number;
	/** Span attributes */
	attributes: Record<string, string | number | boolean>;
	/** Events recorded during the span */
	events: SpanEvent[];
	/** Span status */
	status: SpanStatus;
	/** Whether the span has ended */
	ended: boolean;
}

/**
 * Options for starting a new span
 */
export interface SpanOptions {
	/** Span kind */
	kind?: SpanKind;
	/** Parent span (if any) */
	parent?: Span;
	/** Initial attributes */
	attributes?: Record<string, string | number | boolean>;
	/** Links to other spans */
	links?: Array<{ traceId: string; spanId: string; attributes?: Record<string, string | number | boolean> }>;
	/** Start time in nanoseconds (defaults to current time) */
	startTime?: number;
}

/**
 * OTLP Exporter options
 */
export interface OTLPExporterOptions {
	/** OTLP endpoint URL (e.g., http://localhost:4318/v1/traces) */
	endpoint: string;
	/** Additional headers to send with requests */
	headers?: Record<string, string>;
	/** Export interval in milliseconds (default: 5000) */
	exportInterval?: number;
	/** Maximum batch size before forcing export (default: 100) */
	maxBatchSize?: number;
	/** Maximum retry attempts on failure (default: 3) */
	maxRetries?: number;
	/** Initial retry delay in milliseconds (default: 1000) */
	retryDelay?: number;
	/** Timeout for export requests in milliseconds (default: 30000) */
	timeout?: number;
}

/**
 * Sampler type
 */
export type SamplerType = "always" | "never" | "probabilistic";

/**
 * Tracer options
 */
export interface TracerOptions {
	/** OTLP exporter instance */
	exporter?: OTLPExporter;
	/** Sampling strategy (default: "always") */
	sampler?: SamplerType;
	/** Probability for probabilistic sampling (0.0 to 1.0) */
	probability?: number;
	/** Service name for resource attributes */
	serviceName?: string;
	/** Additional resource attributes */
	resourceAttributes?: Record<string, string | number | boolean>;
}

/**
 * Trace context for propagation
 */
export interface TraceContext {
	traceId: string;
	spanId: string;
	traceFlags: number;
	traceState?: string;
}

/**
 * OTLP JSON format types
 */
interface OTLPAttributeValue {
	stringValue?: string;
	intValue?: number;
	doubleValue?: number;
	boolValue?: boolean;
}

interface OTLPAttribute {
	key: string;
	value: OTLPAttributeValue;
}

interface OTLPSpan {
	traceId: string;
	spanId: string;
	parentSpanId?: string;
	name: string;
	kind: number;
	startTimeUnixNano: number;
	endTimeUnixNano: number;
	attributes: OTLPAttribute[];
	events: Array<{
		timeUnixNano: number;
		name: string;
		attributes: OTLPAttribute[];
	}>;
	status: {
		code: number;
		message?: string;
	};
}

interface OTLPResourceSpan {
	resource: {
		attributes: OTLPAttribute[];
	};
	scopeSpans: Array<{
		scope: { name: string };
		spans: OTLPSpan[];
	}>;
}

interface OTLPExportRequest {
	resourceSpans: OTLPResourceSpan[];
}

// ============= Helper Functions =============

/**
 * Generate a random trace ID (32 hex characters / 16 bytes)
 */
export function generateTraceId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Generate a random span ID (16 hex characters / 8 bytes)
 */
export function generateSpanId(): string {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Convert hex string to base64
 */
function hexToBase64(hex: string): string {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
	}
	return btoa(String.fromCharCode(...bytes));
}

/**
 * Get current time in nanoseconds using Bun.nanoseconds()
 */
export function nowNanoseconds(): number {
	return Bun.nanoseconds();
}

/**
 * Convert an attribute value to OTLP format
 */
function toOTLPAttribute(key: string, value: string | number | boolean): OTLPAttribute {
	if (typeof value === "string") {
		return { key, value: { stringValue: value } };
	} else if (typeof value === "number") {
		// Check if it's an integer or float
		if (Number.isInteger(value)) {
			return { key, value: { intValue: value } };
		}
		return { key, value: { doubleValue: value } };
	} else if (typeof value === "boolean") {
		return { key, value: { boolValue: value } };
	}
	return { key, value: { stringValue: String(value) } };
}

/**
 * Map span kind to OTLP kind number
 */
function spanKindToOTLP(kind: SpanKind): number {
	const kindMap: Record<SpanKind, number> = {
		internal: 1,
		server: 2,
		client: 3,
		producer: 4,
		consumer: 5,
	};
	return kindMap[kind] ?? 1;
}

/**
 * Map status code to OTLP status number
 */
function statusCodeToOTLP(code: StatusCode): number {
	const codeMap: Record<StatusCode, number> = {
		unset: 0,
		ok: 1,
		error: 2,
	};
	return codeMap[code];
}

// ============= OTLPExporter Class =============

/**
 * OTLP HTTP Trace Exporter
 *
 * Exports traces to an OTLP-compatible endpoint using HTTP/JSON.
 */
export class OTLPExporter {
	private endpoint: string;
	private headers: Record<string, string>;
	private exportInterval: number;
	private maxBatchSize: number;
	private maxRetries: number;
	private retryDelay: number;
	private timeout: number;
	private pendingSpans: Span[] = [];
	private exportTimer: Timer | null = null;
	private isShuttingDown = false;
	private serviceName: string = "unknown-service";
	private resourceAttributes: Record<string, string | number | boolean> = {};

	constructor(options: OTLPExporterOptions) {
		this.endpoint = options.endpoint;
		this.headers = {
			"Content-Type": "application/json",
			...options.headers,
		};
		this.exportInterval = options.exportInterval ?? 5000;
		this.maxBatchSize = options.maxBatchSize ?? 100;
		this.maxRetries = options.maxRetries ?? 3;
		this.retryDelay = options.retryDelay ?? 1000;
		this.timeout = options.timeout ?? 30000;
	}

	/**
	 * Set service name for resource attributes
	 */
	setServiceName(name: string): void {
		this.serviceName = name;
	}

	/**
	 * Set resource attributes
	 */
	setResourceAttributes(attributes: Record<string, string | number | boolean>): void {
		this.resourceAttributes = { ...attributes };
	}

	/**
	 * Start periodic export
	 */
	start(): void {
		if (this.exportTimer !== null) return;

		this.exportTimer = setInterval(() => {
			this.flush().catch(() => {
				// Ignore errors in periodic flush
			});
		}, this.exportInterval);
	}

	/**
	 * Stop periodic export
	 */
	stop(): void {
		if (this.exportTimer !== null) {
			clearInterval(this.exportTimer);
			this.exportTimer = null;
		}
	}

	/**
	 * Add a span to the pending batch
	 */
	addSpan(span: Span): void {
		if (this.isShuttingDown) return;

		this.pendingSpans.push(span);

		// Force export if batch is full
		if (this.pendingSpans.length >= this.maxBatchSize) {
			this.flush().catch(() => {
				// Ignore errors
			});
		}
	}

	/**
	 * Export spans to OTLP endpoint
	 */
	async export(spans: Span[]): Promise<boolean> {
		if (spans.length === 0) return true;

		const exportRequest = this.buildExportRequest(spans);

		for (let attempt = 0; attempt < this.maxRetries; attempt++) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), this.timeout);

				const response = await fetch(this.endpoint, {
					method: "POST",
					headers: this.headers,
					body: JSON.stringify(exportRequest),
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				if (response.ok) {
					return true;
				}

				// Don't retry on client errors (4xx)
				if (response.status >= 400 && response.status < 500) {
					console.error(`OTLP export failed with status ${response.status}`);
					return false;
				}

				// Retry on server errors (5xx)
				if (attempt < this.maxRetries - 1) {
					await this.delay(this.retryDelay * Math.pow(2, attempt));
				}
			} catch (error) {
				if (attempt < this.maxRetries - 1) {
					await this.delay(this.retryDelay * Math.pow(2, attempt));
				} else {
					console.error("OTLP export failed:", error);
					return false;
				}
			}
		}

		return false;
	}

	/**
	 * Flush all pending spans
	 */
	async flush(): Promise<void> {
		if (this.pendingSpans.length === 0) return;

		const spansToExport = [...this.pendingSpans];
		this.pendingSpans = [];

		await this.export(spansToExport);
	}

	/**
	 * Close the exporter and flush remaining spans
	 */
	async close(): Promise<void> {
		this.isShuttingDown = true;
		this.stop();
		await this.flush();
	}

	/**
	 * Build OTLP export request from spans
	 */
	private buildExportRequest(spans: Span[]): OTLPExportRequest {
		const resourceAttributes: OTLPAttribute[] = [
			toOTLPAttribute("service.name", this.serviceName),
		];

		// Add custom resource attributes
		for (const [key, value] of Object.entries(this.resourceAttributes)) {
			resourceAttributes.push(toOTLPAttribute(key, value));
		}

		const otlpSpans: OTLPSpan[] = spans.map((span) => ({
			traceId: hexToBase64(span.traceId),
			spanId: hexToBase64(span.spanId),
			parentSpanId: span.parentSpanId ? hexToBase64(span.parentSpanId) : undefined,
			name: span.name,
			kind: spanKindToOTLP(span.kind),
			startTimeUnixNano: span.startTime,
			endTimeUnixNano: span.endTime ?? span.startTime,
			attributes: Object.entries(span.attributes).map(([k, v]) => toOTLPAttribute(k, v)),
			events: span.events.map((event) => ({
				timeUnixNano: event.timestamp,
				name: event.name,
				attributes: event.attributes
					? Object.entries(event.attributes).map(([k, v]) => toOTLPAttribute(k, v))
					: [],
			})),
			status: {
				code: statusCodeToOTLP(span.status.code),
				message: span.status.message,
			},
		}));

		return {
			resourceSpans: [
				{
					resource: {
						attributes: resourceAttributes,
					},
					scopeSpans: [
						{
							scope: { name: "bueno-tracer" },
							spans: otlpSpans,
						},
					],
				},
			],
		};
	}

	/**
	 * Delay helper
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

// ============= Tracer Class =============

/**
 * Tracer creates and manages spans for distributed tracing
 */
export class Tracer {
	private serviceName: string;
	private exporter?: OTLPExporter;
	private sampler: SamplerType;
	private probability: number;
	private resourceAttributes: Record<string, string | number | boolean>;
	private currentSpan: Span | null = null;
	private spanStack: Span[] = [];

	constructor(options: TracerOptions = {}) {
		this.serviceName = options.serviceName ?? "unknown-service";
		this.exporter = options.exporter;
		this.sampler = options.sampler ?? "always";
		this.probability = options.probability ?? 1.0;
		this.resourceAttributes = options.resourceAttributes ?? {};

		// Configure exporter with service name
		if (this.exporter) {
			this.exporter.setServiceName(this.serviceName);
			this.exporter.setResourceAttributes(this.resourceAttributes);
			this.exporter.start();
		}
	}

	/**
	 * Check if a span should be sampled
	 */
	private shouldSample(): boolean {
		switch (this.sampler) {
			case "always":
				return true;
			case "never":
				return false;
			case "probabilistic":
				return Math.random() < this.probability;
			default:
				return true;
		}
	}

	/**
	 * Start a new span
	 */
	startSpan(name: string, options: SpanOptions = {}): Span {
		// Check sampling
		if (!this.shouldSample()) {
			// Return a no-op span that won't be exported
			return this.createNoopSpan(name, options);
		}

		// Determine parent: explicit parent > current span > none
		const parent = options.parent ?? this.currentSpan;

		const span: Span = {
			traceId: parent?.traceId ?? generateTraceId(),
			spanId: generateSpanId(),
			parentSpanId: parent?.spanId,
			name,
			kind: options.kind ?? "internal",
			startTime: options.startTime ?? nowNanoseconds(),
			attributes: { ...options.attributes },
			events: [],
			status: { code: "unset" },
			ended: false,
		};

		return span;
	}

	/**
	 * End a span
	 */
	endSpan(span: Span, endTime?: number): void {
		if (span.ended) return;

		span.ended = true;
		span.endTime = endTime ?? nowNanoseconds();
		span.duration = span.endTime - span.startTime;

		// Export the span
		if (this.exporter) {
			this.exporter.addSpan(span);
		}
	}

	/**
	 * Get the current active span
	 */
	getCurrentSpan(): Span | null {
		return this.currentSpan;
	}

	/**
	 * Run a function within span context
	 */
	async withSpan<T>(
		name: string,
		fn: (span: Span) => T | Promise<T>,
		options: SpanOptions = {},
	): Promise<T> {
		const span = this.startSpan(name, options);

		// Push to stack
		const previousSpan = this.currentSpan;
		this.currentSpan = span;
		this.spanStack.push(span);

		try {
			const result = await fn(span);
			return result;
		} catch (error) {
			// Record error on span
			this.setError(span, error as Error);
			throw error;
		} finally {
			this.endSpan(span);

			// Pop from stack
			this.spanStack.pop();
			this.currentSpan = previousSpan ?? this.spanStack[this.spanStack.length - 1] ?? null;
		}
	}

	/**
	 * Add an event to a span
	 */
	addEvent(span: Span, name: string, attributes?: Record<string, string | number | boolean>): void {
		if (span.ended) return;

		span.events.push({
			name,
			timestamp: nowNanoseconds(),
			attributes,
		});
	}

	/**
	 * Set an attribute on a span
	 */
	setAttribute(span: Span, key: string, value: string | number | boolean): void {
		if (span.ended) return;
		span.attributes[key] = value;
	}

	/**
	 * Set multiple attributes on a span
	 */
	setAttributes(span: Span, attributes: Record<string, string | number | boolean>): void {
		if (span.ended) return;
		Object.assign(span.attributes, attributes);
	}

	/**
	 * Set span status
	 */
	setStatus(span: Span, code: StatusCode, message?: string): void {
		if (span.ended) return;
		span.status = { code, message };
	}

	/**
	 * Record an error on a span
	 */
	setError(span: Span, error: Error): void {
		if (span.ended) return;

		span.status = {
			code: "error",
			message: error.message,
		};

		span.events.push({
			name: "exception",
			timestamp: nowNanoseconds(),
			attributes: {
				"exception.type": error.name,
				"exception.message": error.message,
				"exception.stacktrace": error.stack ?? "",
			},
		});
	}

	/**
	 * Update span name
	 */
	updateName(span: Span, name: string): void {
		if (span.ended) return;
		span.name = name;
	}

	/**
	 * Inject trace context into a carrier (for W3C TraceContext propagation)
	 */
	injectContext(carrier: Record<string, string>, span?: Span): void {
		const activeSpan = span ?? this.currentSpan;
		if (!activeSpan) return;

		// traceparent: version-traceid-spanid-flags
		const traceFlags = activeSpan.status.code === "error" ? 0 : 1;
		const traceparent = `00-${activeSpan.traceId}-${activeSpan.spanId}-${traceFlags.toString(16).padStart(2, "0")}`;

		carrier["traceparent"] = traceparent;

		// tracestate is optional
		// Could be extended to support tracestate
	}

	/**
	 * Extract trace context from a carrier (for W3C TraceContext propagation)
	 */
	extractContext(carrier: Record<string, string>): TraceContext | null {
		const traceparent = carrier["traceparent"] ?? carrier["Traceparent"];
		if (!traceparent) return null;

		// Parse traceparent: version-traceid-spanid-flags
		const parts = traceparent.split("-");
		if (parts.length !== 4) return null;

		const [version, traceId, spanId, flags] = parts;

		// Validate version
		if (version !== "00") return null;

		// Validate trace ID (32 hex chars)
		if (!/^[0-9a-f]{32}$/i.test(traceId)) return null;

		// Validate span ID (16 hex chars)
		if (!/^[0-9a-f]{16}$/i.test(spanId)) return null;

		return {
			traceId,
			spanId,
			traceFlags: parseInt(flags, 16),
			traceState: carrier["tracestate"] ?? carrier["Tracestate"],
		};
	}

	/**
	 * Create a child span from extracted context
	 */
	startSpanFromContext(
		name: string,
		context: TraceContext,
		options: SpanOptions = {},
	): Span {
		return this.startSpan(name, {
			...options,
			parent: {
				traceId: context.traceId,
				spanId: context.spanId,
			} as Span,
		});
	}

	/**
	 * Flush pending spans
	 */
	async flush(): Promise<void> {
		if (this.exporter) {
			await this.exporter.flush();
		}
	}

	/**
	 * Close the tracer
	 */
	async close(): Promise<void> {
		if (this.exporter) {
			await this.exporter.close();
		}
	}

	/**
	 * Create a no-op span (not sampled)
	 */
	private createNoopSpan(name: string, options: SpanOptions): Span {
		return {
			traceId: generateTraceId(),
			spanId: generateSpanId(),
			parentSpanId: options.parent?.spanId,
			name,
			kind: options.kind ?? "internal",
			startTime: options.startTime ?? nowNanoseconds(),
			attributes: {},
			events: [],
			status: { code: "unset" },
			ended: false,
		};
	}
}

// ============= Factory Functions =============

/**
 * Create a configured tracer
 */
export function createTracer(serviceName: string, options: Omit<TracerOptions, "serviceName"> = {}): Tracer {
	return new Tracer({
		...options,
		serviceName,
	});
}

// ============= Middleware Helpers =============

/**
 * Request context for middleware
 */
interface RequestContext {
	method: string;
	path: string;
	url: URL;
	headers: Record<string, string>;
	getHeader: (name: string) => string | undefined;
	setHeader: (name: string, value: string) => void;
	status?: number;
}

/**
 * Response context for middleware
 */
interface ResponseContext {
	status: number;
	headers?: Record<string, string>;
}

/**
 * Create middleware for automatic HTTP tracing
 */
export function traceMiddleware(tracer: Tracer) {
	return async (
		ctx: RequestContext,
		next: () => Promise<ResponseContext>,
	): Promise<ResponseContext> => {
		// Extract context from incoming headers
		const headers: Record<string, string> = {};
		for (const [key, value] of Object.entries(ctx.headers)) {
			headers[key.toLowerCase()] = value;
		}

		const parentContext = tracer.extractContext(headers);

		// Start span
		const spanOptions: SpanOptions = {
			kind: "server",
			attributes: {
				"http.method": ctx.method,
				"http.url": ctx.url?.toString() ?? ctx.path,
				"http.route": ctx.path,
			},
		};

		let span: Span;
		if (parentContext) {
			span = tracer.startSpanFromContext(`${ctx.method} ${ctx.path}`, parentContext, spanOptions);
		} else {
			span = tracer.startSpan(`${ctx.method} ${ctx.path}`, spanOptions);
		}

		// Inject context for downstream services
		const outgoingHeaders: Record<string, string> = {};
		tracer.injectContext(outgoingHeaders, span);
		for (const [key, value] of Object.entries(outgoingHeaders)) {
			ctx.setHeader(key, value);
		}

		try {
			const response = await next();

			// Set response attributes
			tracer.setAttribute(span, "http.status_code", response.status);

			if (response.status >= 400) {
				tracer.setStatus(span, "error");
			} else {
				tracer.setStatus(span, "ok");
			}

			return response;
		} catch (error) {
			tracer.setError(span, error as Error);
			throw error;
		} finally {
			tracer.endSpan(span);
		}
	};
}

// ============= Database Tracing Helper =============

/**
 * Database interface for tracing
 */
interface TracedDatabase {
	query?: (sql: string, params?: unknown[]) => Promise<unknown>;
	execute?: (sql: string, params?: unknown[]) => Promise<unknown>;
	[key: string]: unknown;
}

/**
 * Wrap database with tracing
 */
export function traceDatabase(tracer: Tracer, db: TracedDatabase, system: string = "unknown"): TracedDatabase {
	const tracedDb: TracedDatabase = { ...db };

	// Wrap query method
	if (typeof db.query === "function") {
		const originalQuery = db.query.bind(db);
		tracedDb.query = async (sql: string, params?: unknown[]) => {
			return tracer.withSpan(
				`db.query`,
				async (span) => {
					tracer.setAttributes(span, {
						"db.system": system,
						"db.statement": sql,
						"db.operation": extractOperation(sql),
					});

					if (params) {
						tracer.setAttribute(span, "db.params", JSON.stringify(params));
					}

					const result = await originalQuery(sql, params);
					tracer.setStatus(span, "ok");
					return result;
				},
				{ kind: "client" },
			);
		};
	}

	// Wrap execute method
	if (typeof db.execute === "function") {
		const originalExecute = db.execute.bind(db);
		tracedDb.execute = async (sql: string, params?: unknown[]) => {
			return tracer.withSpan(
				`db.execute`,
				async (span) => {
					tracer.setAttributes(span, {
						"db.system": system,
						"db.statement": sql,
						"db.operation": extractOperation(sql),
					});

					if (params) {
						tracer.setAttribute(span, "db.params", JSON.stringify(params));
					}

					const result = await originalExecute(sql, params);
					tracer.setStatus(span, "ok");
					return result;
				},
				{ kind: "client" },
			);
		};
	}

	return tracedDb;
}

/**
 * Extract operation type from SQL statement
 */
function extractOperation(sql: string): string {
	const normalized = sql.trim().toUpperCase();
	const match = normalized.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE)/);
	return match ? match[1] : "UNKNOWN";
}

// ============= Fetch Tracing Helper =============

/**
 * Options for traced fetch
 */
interface TracedFetchOptions extends RequestInit {
	/** Span to use as parent */
	parentSpan?: Span;
	/** Additional attributes to add to span */
	attributes?: Record<string, string | number | boolean>;
}

/**
 * Create a traced fetch function
 */
export function createTracedFetch(tracer: Tracer): (url: string | URL, options?: TracedFetchOptions) => Promise<Response> {
	return async (url: string | URL, options: TracedFetchOptions = {}) => {
		const { parentSpan, attributes = {}, ...fetchOptions } = options;
		const urlStr = url.toString();

		return tracer.withSpan(
			`HTTP ${fetchOptions.method ?? "GET"}`,
			async (span) => {
				tracer.setAttributes(span, {
					"http.method": fetchOptions.method ?? "GET",
					"http.url": urlStr,
					...attributes,
				});

				// Inject trace context into headers
				const headers = new Headers(fetchOptions.headers);
				const carrier: Record<string, string> = {};
				tracer.injectContext(carrier, span);
				for (const [key, value] of Object.entries(carrier)) {
					headers.set(key, value);
				}

				try {
					const response = await fetch(url, {
						...fetchOptions,
						headers,
					});

					tracer.setAttribute(span, "http.status_code", response.status);
					tracer.setStatus(span, response.status >= 400 ? "error" : "ok");

					return response;
				} catch (error) {
					tracer.setError(span, error as Error);
					throw error;
				}
			},
			{ kind: "client", parent: parentSpan },
		);
	};
}

// ============= Span Builder Helper =============

/**
 * Span builder for fluent API
 */
export class SpanBuilder {
	private span: Span;
	private tracer: Tracer;

	constructor(tracer: Tracer, name: string, options: SpanOptions = {}) {
		this.tracer = tracer;
		this.span = tracer.startSpan(name, options);
	}

	/**
	 * Set an attribute
	 */
	setAttribute(key: string, value: string | number | boolean): this {
		this.tracer.setAttribute(this.span, key, value);
		return this;
	}

	/**
	 * Set multiple attributes
	 */
	setAttributes(attributes: Record<string, string | number | boolean>): this {
		this.tracer.setAttributes(this.span, attributes);
		return this;
	}

	/**
	 * Add an event
	 */
	addEvent(name: string, attributes?: Record<string, string | number | boolean>): this {
		this.tracer.addEvent(this.span, name, attributes);
		return this;
	}

	/**
	 * Set status
	 */
	setStatus(code: StatusCode, message?: string): this {
		this.tracer.setStatus(this.span, code, message);
		return this;
	}

	/**
	 * Record error
	 */
	setError(error: Error): this {
		this.tracer.setError(this.span, error);
		return this;
	}

	/**
	 * End the span
	 */
	end(): Span {
		this.tracer.endSpan(this.span);
		return this.span;
	}

	/**
	 * Get the underlying span
	 */
	getSpan(): Span {
		return this.span;
	}
}

/**
 * Create a span builder
 */
export function span(tracer: Tracer, name: string, options: SpanOptions = {}): SpanBuilder {
	return new SpanBuilder(tracer, name, options);
}