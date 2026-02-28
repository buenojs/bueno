/**
 * Trace ID generation helpers
 *
 * Generates W3C TraceContext-compatible IDs using the Web Crypto API.
 * These are intentionally kept separate from src/telemetry to avoid
 * coupling the observability module to the OTLP tracing module.
 */

/**
 * Generate a W3C-compatible trace ID (32 hex characters / 16 bytes)
 */
export function generateTraceId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Generate a W3C-compatible span ID (16 hex characters / 8 bytes)
 */
export function generateSpanId(): string {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Build a W3C `traceparent` header value from traceId + spanId.
 * Format: 00-<traceId>-<spanId>-01
 */
export function buildTraceparent(traceId: string, spanId: string): string {
	return `00-${traceId}-${spanId}-01`;
}
