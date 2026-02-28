/**
 * Observability Module Unit Tests
 *
 * Tests for BreadcrumbCollector, ObservabilityService, ObservabilityInterceptor,
 * and trace utilities.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Context } from "../../src/context";
import {
	BreadcrumbCollector,
	httpBreadcrumb,
	logBreadcrumb,
} from "../../src/observability/breadcrumbs";
import { ObservabilityService, extractTraceContext } from "../../src/observability/service";
import { ObservabilityInterceptor } from "../../src/observability/interceptor";
import {
	generateTraceId,
	generateSpanId,
	buildTraceparent,
} from "../../src/observability/trace";
import type { ErrorEvent, MessageEvent, ErrorReporter } from "../../src/observability/types";

// ============= Helpers =============

function makeContext(
	path = "/test",
	method = "GET",
	headers: Record<string, string> = {},
): Context {
	const req = new Request(`http://localhost${path}`, { method, headers });
	return new Context(req);
}

class CollectingReporter implements ErrorReporter {
	errors: ErrorEvent[] = [];
	messages: MessageEvent[] = [];
	flushed = false;

	captureError(event: ErrorEvent): void {
		this.errors.push(event);
	}
	captureMessage(event: MessageEvent): void {
		this.messages.push(event);
	}
	async flush(): Promise<void> {
		this.flushed = true;
	}
}

// ============= BreadcrumbCollector =============

describe("BreadcrumbCollector", () => {
	test("stores breadcrumbs in order", () => {
		const collector = new BreadcrumbCollector(5);
		collector.add({ timestamp: new Date(), type: "log", level: "info", message: "a" });
		collector.add({ timestamp: new Date(), type: "log", level: "info", message: "b" });
		collector.add({ timestamp: new Date(), type: "log", level: "info", message: "c" });

		const all = collector.getAll();
		expect(all).toHaveLength(3);
		expect(all[0].message).toBe("a");
		expect(all[2].message).toBe("c");
	});

	test("evicts oldest entry when buffer is full", () => {
		const collector = new BreadcrumbCollector(3);
		collector.add({ timestamp: new Date(), type: "log", level: "info", message: "1" });
		collector.add({ timestamp: new Date(), type: "log", level: "info", message: "2" });
		collector.add({ timestamp: new Date(), type: "log", level: "info", message: "3" });
		collector.add({ timestamp: new Date(), type: "log", level: "info", message: "4" });

		const all = collector.getAll();
		expect(all).toHaveLength(3);
		expect(all[0].message).toBe("2");
		expect(all[2].message).toBe("4");
	});

	test("handles rapid overflow correctly", () => {
		const collector = new BreadcrumbCollector(2);
		for (let i = 1; i <= 5; i++) {
			collector.add({ timestamp: new Date(), type: "log", level: "info", message: String(i) });
		}
		const all = collector.getAll();
		expect(all).toHaveLength(2);
		expect(all[0].message).toBe("4");
		expect(all[1].message).toBe("5");
	});

	test("reports correct size", () => {
		const collector = new BreadcrumbCollector(10);
		expect(collector.size).toBe(0);
		collector.add({ timestamp: new Date(), type: "log", level: "info", message: "x" });
		expect(collector.size).toBe(1);
	});

	test("never exceeds maxSize", () => {
		const collector = new BreadcrumbCollector(3);
		for (let i = 0; i < 10; i++) {
			collector.add({ timestamp: new Date(), type: "log", level: "info", message: String(i) });
		}
		expect(collector.size).toBe(3);
		expect(collector.maxSize).toBe(3);
	});

	test("clear() empties the buffer", () => {
		const collector = new BreadcrumbCollector(5);
		collector.add({ timestamp: new Date(), type: "log", level: "info", message: "a" });
		collector.add({ timestamp: new Date(), type: "log", level: "info", message: "b" });
		collector.clear();
		expect(collector.size).toBe(0);
		expect(collector.getAll()).toEqual([]);
	});

	test("throws on invalid maxSize", () => {
		expect(() => new BreadcrumbCollector(0)).toThrow(RangeError);
	});

	test("getAll() returns empty array when empty", () => {
		expect(new BreadcrumbCollector(5).getAll()).toEqual([]);
	});

	test("single-slot buffer evicts correctly", () => {
		const collector = new BreadcrumbCollector(1);
		collector.add({ timestamp: new Date(), type: "log", level: "info", message: "a" });
		collector.add({ timestamp: new Date(), type: "log", level: "info", message: "b" });
		const all = collector.getAll();
		expect(all).toHaveLength(1);
		expect(all[0].message).toBe("b");
	});
});

// ============= Breadcrumb Helpers =============

describe("httpBreadcrumb", () => {
	test("creates a basic http breadcrumb", () => {
		const crumb = httpBreadcrumb("GET", "/users");
		expect(crumb.type).toBe("http");
		expect(crumb.message).toBe("GET /users");
		expect(crumb.level).toBe("info");
		expect(crumb.data?.method).toBe("GET");
		expect(crumb.data?.path).toBe("/users");
	});

	test("includes status code and duration", () => {
		const crumb = httpBreadcrumb("POST", "/orders", 201, 42);
		expect(crumb.message).toBe("POST /orders 201");
		expect(crumb.data?.statusCode).toBe(201);
		expect(crumb.data?.durationMs).toBe(42);
	});

	test("marks error level for 4xx/5xx responses", () => {
		expect(httpBreadcrumb("GET", "/notfound", 404).level).toBe("error");
		expect(httpBreadcrumb("GET", "/error", 500).level).toBe("error");
		expect(httpBreadcrumb("GET", "/ok", 200).level).toBe("info");
	});
});

describe("logBreadcrumb", () => {
	test("creates a log breadcrumb with data", () => {
		const crumb = logBreadcrumb("warning", "Slow query", { ms: 2000 });
		expect(crumb.type).toBe("log");
		expect(crumb.level).toBe("warning");
		expect(crumb.message).toBe("Slow query");
		expect(crumb.data?.ms).toBe(2000);
	});
});

// ============= Trace Utilities =============

describe("Trace utilities", () => {
	test("generateTraceId returns 32-char hex string", () => {
		const id = generateTraceId();
		expect(id).toHaveLength(32);
		expect(/^[0-9a-f]+$/.test(id)).toBe(true);
	});

	test("generateSpanId returns 16-char hex string", () => {
		const id = generateSpanId();
		expect(id).toHaveLength(16);
		expect(/^[0-9a-f]+$/.test(id)).toBe(true);
	});

	test("generateTraceId produces unique values", () => {
		const ids = new Set(Array.from({ length: 100 }, generateTraceId));
		expect(ids.size).toBe(100);
	});

	test("buildTraceparent formats correctly", () => {
		expect(buildTraceparent("aaa", "bbb")).toBe("00-aaa-bbb-01");
	});

	test("extractTraceContext parses valid traceparent header", () => {
		const traceId = generateTraceId();
		const spanId = generateSpanId();
		const ctx = makeContext("/test", "GET", {
			traceparent: buildTraceparent(traceId, spanId),
		});
		const extracted = extractTraceContext(ctx);
		expect(extracted.traceId).toBe(traceId);
		expect(extracted.spanId).toBe(spanId);
	});

	test("extractTraceContext returns empty for missing header", () => {
		expect(extractTraceContext(makeContext("/test"))).toEqual({});
	});

	test("extractTraceContext returns empty for malformed header", () => {
		const ctx = makeContext("/test", "GET", { traceparent: "bad-format" });
		expect(extractTraceContext(ctx)).toEqual({});
	});
});

// ============= ObservabilityService =============

describe("ObservabilityService", () => {
	let reporter: CollectingReporter;
	let service: ObservabilityService;

	beforeEach(() => {
		reporter = new CollectingReporter();
		service = new ObservabilityService({ reporter });
	});

	test("captureError dispatches to reporter asynchronously", async () => {
		const error = new Error("test error");
		service.captureError(error);
		await Promise.resolve();
		expect(reporter.errors).toHaveLength(1);
		expect(reporter.errors[0].error).toBe(error);
		expect(reporter.errors[0].level).toBe("error");
	});

	test("captureError uses specified level", async () => {
		service.captureError(new Error("fatal"), "fatal");
		await Promise.resolve();
		expect(reporter.errors[0].level).toBe("fatal");
	});

	test("captureError includes accumulated breadcrumbs", async () => {
		service.addBreadcrumb({ type: "custom", level: "info", message: "step 1" });
		service.addBreadcrumb({ type: "custom", level: "info", message: "step 2" });
		service.captureError(new Error("oops"));
		await Promise.resolve();
		const crumbs = reporter.errors[0].breadcrumbs;
		expect(crumbs.some((c) => c.message === "step 1")).toBe(true);
		expect(crumbs.some((c) => c.message === "step 2")).toBe(true);
	});

	test("captureFromContext attaches request metadata", async () => {
		const ctx = makeContext("/api/users", "POST");
		service.captureFromContext(ctx, new Error("req error"));
		await Promise.resolve();
		const event = reporter.errors[0];
		expect(event.request?.method).toBe("POST");
		expect(event.request?.path).toBe("/api/users");
	});

	test("captureFromContext reads traceId / spanId from context", async () => {
		const ctx = makeContext("/test");
		ctx.set("traceId", "abc123trace");
		ctx.set("spanId", "span456");
		service.captureFromContext(ctx, new Error("traced"));
		await Promise.resolve();
		expect(reporter.errors[0].traceId).toBe("abc123trace");
		expect(reporter.errors[0].spanId).toBe("span456");
	});

	test("captureFromContext reads user from context", async () => {
		const ctx = makeContext("/test");
		ctx.set("user", { id: 42, email: "alice@example.com" });
		service.captureFromContext(ctx, new Error("user error"));
		await Promise.resolve();
		expect(reporter.errors[0].user?.id).toBe(42);
		expect(reporter.errors[0].user?.email).toBe("alice@example.com");
	});

	test("captureFromContext strips sensitive headers", async () => {
		const ctx = makeContext("/test", "GET", {
			authorization: "Bearer secret",
			"x-api-key": "key123",
			"content-type": "application/json",
		});
		service.captureFromContext(ctx, new Error("header test"));
		await Promise.resolve();
		const headers = reporter.errors[0].request?.headers ?? {};
		expect("authorization" in headers).toBe(false);
		expect("x-api-key" in headers).toBe(false);
		expect(headers["content-type"]).toBe("application/json");
	});

	test("ignoreErrors suppresses matching error types", async () => {
		class CustomError extends Error {}
		const svc = new ObservabilityService({ reporter, ignoreErrors: [CustomError] });
		svc.captureError(new CustomError("ignored"));
		await Promise.resolve();
		expect(reporter.errors).toHaveLength(0);
	});

	test("ignoreStatusCodes suppresses matching codes", async () => {
		const svc = new ObservabilityService({ reporter, ignoreStatusCodes: [404] });
		const err = Object.assign(new Error("not found"), { statusCode: 404 });
		svc.captureError(err);
		await Promise.resolve();
		expect(reporter.errors).toHaveLength(0);
	});

	test("ignoreStatusCodes allows non-matching codes", async () => {
		const svc = new ObservabilityService({ reporter, ignoreStatusCodes: [404] });
		const err = Object.assign(new Error("server error"), { statusCode: 500 });
		svc.captureError(err);
		await Promise.resolve();
		expect(reporter.errors).toHaveLength(1);
	});

	test("tags are attached to every event", async () => {
		const svc = new ObservabilityService({
			reporter,
			tags: { environment: "test", version: "1.0.0" },
		});
		svc.captureError(new Error("tagged"));
		await Promise.resolve();
		expect(reporter.errors[0].tags?.environment).toBe("test");
		expect(reporter.errors[0].tags?.version).toBe("1.0.0");
	});

	test("captureMessage sends to reporter", async () => {
		service.captureMessage("Hello", "info", { key: "val" });
		await Promise.resolve();
		expect(reporter.messages).toHaveLength(1);
		expect(reporter.messages[0].message).toBe("Hello");
		expect(reporter.messages[0].level).toBe("info");
		expect(reporter.messages[0].extra?.key).toBe("val");
	});

	test("addBreadcrumb defaults timestamp to now", () => {
		const before = new Date();
		service.addBreadcrumb({ type: "custom", level: "debug", message: "x" });
		const after = new Date();
		const crumb = service.getBreadcrumbCollector().getAll()[0];
		expect(crumb.timestamp >= before).toBe(true);
		expect(crumb.timestamp <= after).toBe(true);
	});

	test("error events have unique IDs", async () => {
		service.captureError(new Error("e1"));
		service.captureError(new Error("e2"));
		await Promise.resolve();
		await Promise.resolve();
		const ids = reporter.errors.map((e) => e.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("breadcrumbsSize option is respected", () => {
		const svc = new ObservabilityService({ reporter, breadcrumbsSize: 3 });
		expect(svc.getBreadcrumbCollector().maxSize).toBe(3);
	});
});

// ============= ObservabilityInterceptor =============

describe("ObservabilityInterceptor", () => {
	let reporter: CollectingReporter;
	let service: ObservabilityService;
	let interceptor: ObservabilityInterceptor;

	beforeEach(() => {
		reporter = new CollectingReporter();
		service = new ObservabilityService({ reporter });
		interceptor = new ObservabilityInterceptor(service);
	});

	test("injects traceId and spanId into context", async () => {
		const ctx = makeContext("/test");
		await interceptor.intercept(ctx, { handle: async () => new Response("ok") });
		expect(ctx.get("traceId")).toBeTruthy();
		expect(ctx.get("spanId")).toBeTruthy();
		expect(String(ctx.get("traceId"))).toHaveLength(32);
	});

	test("uses existing traceId from traceparent header", async () => {
		const traceId = generateTraceId();
		const spanId = generateSpanId();
		const ctx = makeContext("/test", "GET", {
			traceparent: buildTraceparent(traceId, spanId),
		});
		await interceptor.intercept(ctx, { handle: async () => new Response("ok") });
		expect(ctx.get("traceId")).toBe(traceId);
		expect(ctx.get("spanId")).toBe(spanId);
	});

	test("adds navigation breadcrumb on request entry", async () => {
		const ctx = makeContext("/api/items", "GET");
		await interceptor.intercept(ctx, { handle: async () => new Response("ok") });
		const crumbs = service.getBreadcrumbCollector().getAll();
		const nav = crumbs.find((c) => c.type === "navigation");
		expect(nav).toBeDefined();
		expect(nav?.message).toBe("GET /api/items");
	});

	test("adds http breadcrumb with status code on success", async () => {
		const ctx = makeContext("/api/items", "GET");
		await interceptor.intercept(ctx, {
			handle: async () => new Response("ok", { status: 200 }),
		});
		const crumbs = service.getBreadcrumbCollector().getAll();
		const http = crumbs.find((c) => c.type === "http" && c.data?.statusCode === 200);
		expect(http).toBeDefined();
	});

	test("captures error and rethrows when handler throws", async () => {
		const ctx = makeContext("/api/fail", "DELETE");
		const boom = new Error("Handler exploded");

		let threw = false;
		try {
			await interceptor.intercept(ctx, {
				handle: async () => { throw boom; },
			});
		} catch (e) {
			threw = true;
			expect(e).toBe(boom);
		}

		expect(threw).toBe(true);
		await Promise.resolve();
		expect(reporter.errors).toHaveLength(1);
		expect(reporter.errors[0].error).toBe(boom);
	});

	test("error event includes request context", async () => {
		const ctx = makeContext("/api/protected", "POST");
		ctx.set("user", { id: 7, email: "bob@example.com" });

		try {
			await interceptor.intercept(ctx, {
				handle: async () => { throw new Error("auth failed"); },
			});
		} catch { /* expected */ }

		await Promise.resolve();
		const event = reporter.errors[0];
		expect(event.request?.path).toBe("/api/protected");
		expect(event.user?.id).toBe(7);
	});

	test("passes through handler result on success", async () => {
		const ctx = makeContext("/test");
		const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
		const result = await interceptor.intercept(ctx, { handle: async () => response });
		expect(result).toBe(response);
	});
});
