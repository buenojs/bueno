/**
 * Built-in Middleware
 *
 * Common middleware utilities for logging, CORS, request ID, etc.
 */

import type { Context } from "../context";
import type { Middleware } from "../index";

// ============= Logger Middleware =============

export interface LoggerOptions {
	format?: "json" | "text";
	level?: "debug" | "info" | "warn" | "error";
}

export function logger(options: LoggerOptions = {}): Middleware {
	const { format = "text", level = "info" } = options;

	return async (context: Context, next: () => Promise<Response>) => {
		const start = Date.now();
		const { method, path } = context;

		// Log request
		if (format === "json") {
			console.log(
				JSON.stringify({
					type: "request",
					method,
					path,
					timestamp: new Date().toISOString(),
				}),
			);
		} else {
			console.log(`--> ${method} ${path}`);
		}

		try {
			const response = await next();
			const duration = Date.now() - start;

			// Log response
			if (format === "json") {
				console.log(
					JSON.stringify({
						type: "response",
						method,
						path,
						status: response.status,
						duration,
						timestamp: new Date().toISOString(),
					}),
				);
			} else {
				console.log(`<-- ${method} ${path} ${response.status} (${duration}ms)`);
			}

			return response;
		} catch (error) {
			const duration = Date.now() - start;

			if (format === "json") {
				console.error(
					JSON.stringify({
						type: "error",
						method,
						path,
						error: error instanceof Error ? error.message : String(error),
						duration,
						timestamp: new Date().toISOString(),
					}),
				);
			} else {
				console.error(`<-- ${method} ${path} ERROR (${duration}ms)`, error);
			}

			throw error;
		}
	};
}

// ============= CORS Middleware =============

export interface CorsOptions {
	origin?: string | string[] | ((origin: string) => string | undefined);
	methods?: string[];
	allowedHeaders?: string[];
	exposedHeaders?: string[];
	credentials?: boolean;
	maxAge?: number;
}

export function cors(options: CorsOptions = {}): Middleware {
	const {
		origin = "*",
		methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowedHeaders = ["Content-Type", "Authorization"],
		exposedHeaders = [],
		credentials = false,
		maxAge = 86400,
	} = options;

	return async (context: Context, next: () => Promise<Response>) => {
		const requestOrigin = context.getHeader("origin") ?? "";

		// Determine allowed origin
		let allowedOrigin: string;
		if (typeof origin === "function") {
			allowedOrigin = origin(requestOrigin) ?? "*";
		} else if (Array.isArray(origin)) {
			allowedOrigin = origin.includes(requestOrigin) ? requestOrigin : "*";
		} else {
			allowedOrigin = origin;
		}

		// Handle preflight request
		if (context.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: {
					"Access-Control-Allow-Origin": allowedOrigin,
					"Access-Control-Allow-Methods": methods.join(", "),
					"Access-Control-Allow-Headers": allowedHeaders.join(", "),
					"Access-Control-Allow-Credentials": String(credentials),
					"Access-Control-Max-Age": String(maxAge),
				},
			});
		}

		const response = await next();

		// Add CORS headers to response
		response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
		response.headers.set(
			"Access-Control-Allow-Credentials",
			String(credentials),
		);

		if (exposedHeaders.length > 0) {
			response.headers.set(
				"Access-Control-Expose-Headers",
				exposedHeaders.join(", "),
			);
		}

		return response;
	};
}

// ============= Request ID Middleware =============

export interface RequestIdOptions {
	header?: string;
	generator?: () => string;
}

function generateId(): string {
	return crypto.randomUUID();
}

export function requestId(options: RequestIdOptions = {}): Middleware {
	const { header = "X-Request-Id", generator = generateId } = options;

	return async (context: Context, next: () => Promise<Response>) => {
		// Check for existing request ID header
		const existingId = context.getHeader(header.toLowerCase());
		const id = existingId ?? generator();

		// Store in context
		context.set("requestId", id);

		const response = await next();

		// Add to response header
		response.headers.set(header, id);

		return response;
	};
}

// ============= Timing Middleware =============

export function timing(): Middleware {
	return async (context: Context, next: () => Promise<Response>) => {
		const start = performance.now();

		const response = await next();

		const duration = performance.now() - start;
		response.headers.set("X-Response-Time", `${duration.toFixed(3)}ms`);
		response.headers.set("Server-Timing", `total;dur=${duration.toFixed(3)}`);

		return response;
	};
}

// ============= Security Headers Middleware =============

export interface SecurityHeadersOptions {
	contentSecurityPolicy?: string;
	xssProtection?: boolean;
	frameGuard?: "DENY" | "SAMEORIGIN" | "ALLOW-FROM";
	hsts?: boolean | { maxAge?: number; includeSubDomains?: boolean };
}

export function securityHeaders(
	options: SecurityHeadersOptions = {},
): Middleware {
	const {
		xssProtection = true,
		frameGuard = "SAMEORIGIN",
		hsts = false,
	} = options;

	return async (context: Context, next: () => Promise<Response>) => {
		const response = await next();

		// XSS Protection
		if (xssProtection) {
			response.headers.set("X-XSS-Protection", "1; mode=block");
		}

		// Frame Guard
		if (frameGuard) {
			response.headers.set("X-Frame-Options", frameGuard);
		}

		// HSTS
		if (hsts) {
			const maxAge =
				typeof hsts === "object" ? (hsts.maxAge ?? 31536000) : 31536000;
			const includeSubDomains =
				typeof hsts === "object" ? (hsts.includeSubDomains ?? true) : true;

			let hstsValue = `max-age=${maxAge}`;
			if (includeSubDomains) {
				hstsValue += "; includeSubDomains";
			}

			response.headers.set("Strict-Transport-Security", hstsValue);
		}

		// Prevent MIME type sniffing
		response.headers.set("X-Content-Type-Options", "nosniff");

		return response;
	};
}

// ============= Rate Limiter Middleware =============

export interface RateLimitOptions {
	windowMs?: number;
	max?: number;
	keyGenerator?: (context: Context) => string;
	handler?: (context: Context) => Response;
}

export function rateLimit(options: RateLimitOptions = {}): Middleware {
	const {
		windowMs = 60000, // 1 minute
		max = 100,
		keyGenerator = (ctx) => ctx.ip ?? "unknown",
		handler = (ctx) =>
			ctx.error("Too many requests, please try again later.", 429),
	} = options;

	const hits = new Map<string, { count: number; resetTime: number }>();

	// Cleanup old entries periodically
	setInterval(() => {
		const now = Date.now();
		for (const [key, value] of hits.entries()) {
			if (value.resetTime < now) {
				hits.delete(key);
			}
		}
	}, windowMs);

	return async (context: Context, next: () => Promise<Response>) => {
		const key = keyGenerator(context);
		const now = Date.now();

		let record = hits.get(key);

		if (!record || record.resetTime < now) {
			record = { count: 0, resetTime: now + windowMs };
		}

		record.count++;
		hits.set(key, record);

		// Set rate limit headers
		context.setHeader("X-RateLimit-Limit", String(max));
		context.setHeader(
			"X-RateLimit-Remaining",
			String(Math.max(0, max - record.count)),
		);
		context.setHeader("X-RateLimit-Reset", String(record.resetTime));

		if (record.count > max) {
			return handler(context);
		}

		return next();
	};
}

// ============= Compression Middleware =============

export interface CompressionOptions {
	threshold?: number;
	types?: string[];
}

export function compression(options: CompressionOptions = {}): Middleware {
	const { threshold = 1024 } = options;

	return async (context: Context, next: () => Promise<Response>) => {
		const response = await next();

		// Check if client accepts gzip
		const acceptEncoding = context.getHeader("accept-encoding") ?? "";
		if (!acceptEncoding.includes("gzip")) {
			return response;
		}

		// Check content type
		const contentType = response.headers.get("content-type") ?? "";
		if (
			!contentType.includes("text") &&
			!contentType.includes("json") &&
			!contentType.includes("javascript")
		) {
			return response;
		}

		// Check size
		const contentLength = Number.parseInt(
			response.headers.get("content-length") ?? "0",
			10,
		);
		if (contentLength > 0 && contentLength < threshold) {
			return response;
		}

		// Compress using Bun's built-in gzip
		const buffer = await response.arrayBuffer();
		const compressed = Bun.gzipSync(buffer);

		return new Response(compressed, {
			status: response.status,
			headers: {
				...Object.fromEntries(response.headers.entries()),
				"Content-Encoding": "gzip",
				"Content-Length": String(compressed.byteLength),
			},
		});
	};
}
