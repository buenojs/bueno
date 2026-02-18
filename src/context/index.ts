/**
 * Context System
 *
 * Provides a rich request/response context for route handlers
 * with convenient methods for accessing request data and building responses.
 */

import type { PathParams, StatusCode } from "../types";

// ============= Context Types =============

interface ContextVariables {
	[key: string]: unknown;
}

interface ResponseState {
	status: StatusCode;
	headers: Headers;
}

// ============= Cookie Parser =============

function parseCookies(cookieHeader: string): Record<string, string> {
	const cookies: Record<string, string> = {};

	for (const part of cookieHeader.split(";")) {
		const trimmed = part.trim();
		if (trimmed) {
			const [name, ...rest] = trimmed.split("=");
			if (name && rest.length > 0) {
				cookies[name.trim()] = rest.join("=").trim();
			}
		}
	}

	return cookies;
}

// ============= Context Class =============

export class Context<V extends ContextVariables = ContextVariables> {
	/** Raw Request object */
	readonly req: Request;

	/** Path parameters extracted from route */
	readonly params: PathParams;

	/** Query parameters parsed from URL */
	readonly query: Record<string, string>;

	/** Cached cookies */
	private _cookies?: Record<string, string>;

	/** Cached body */
	private _bodyCache?: unknown;

	/** Response state for building responses */
	private _response: ResponseState;

	/** Context variables */
	private _variables: V = {} as V;

	constructor(request: Request, params: PathParams = {}) {
		this.req = request;
		this.params = params;
		this.query = this.parseQuery(request.url);
		this._response = {
			status: 200,
			headers: new Headers(),
		};
	}

	// ============= Request Properties =============

	/** HTTP method */
	get method(): string {
		return this.req.method;
	}

	/** Parsed URL */
	get url(): URL {
		return new URL(this.req.url);
	}

	/** Path name */
	get path(): string {
		return this.url.pathname;
	}

	// ============= Request Helpers =============

	/**
	 * Get request header (case-insensitive)
	 */
	getHeader(name: string): string | undefined {
		return this.req.headers.get(name) ?? undefined;
	}

	/**
	 * Get cookie value
	 */
	getCookie(name: string): string | undefined {
		if (!this._cookies) {
			const cookieHeader = this.req.headers.get("Cookie");
			this._cookies = cookieHeader ? parseCookies(cookieHeader) : {};
		}
		return this._cookies[name];
	}

	/**
	 * Get all cookies
	 */
	get cookies(): Record<string, string> {
		if (!this._cookies) {
			const cookieHeader = this.req.headers.get("Cookie");
			this._cookies = cookieHeader ? parseCookies(cookieHeader) : {};
		}
		return this._cookies;
	}

	// ============= Body Parsing =============

	/**
	 * Parse body as JSON
	 */
	async body<T = unknown>(): Promise<T> {
		if (this._bodyCache !== undefined) {
			return this._bodyCache as T;
		}
		const text = await this.req.text();
		this._bodyCache = text ? JSON.parse(text) : null;
		return this._bodyCache as T;
	}

	/**
	 * Parse body as JSON (alias for body)
	 */
	async parseBody<T = unknown>(): Promise<T> {
		return this.body<T>();
	}

	/**
	 * Get body as text
	 */
	async bodyText(): Promise<string> {
		return this.req.text();
	}

	/**
	 * Parse body as FormData
	 */
	async bodyFormData(): Promise<FormData> {
		return this.req.formData() as Promise<FormData>;
	}

	/**
	 * Get body as ArrayBuffer
	 */
	async bodyArrayBuffer(): Promise<ArrayBuffer> {
		return this.req.arrayBuffer();
	}

	/**
	 * Get body as Blob
	 */
	async bodyBlob(): Promise<Blob> {
		return this.req.blob();
	}

	// ============= Variable Storage =============

	/**
	 * Set a context variable
	 */
	set<K extends keyof V>(key: K, value: V[K]): this {
		this._variables[key] = value;
		return this;
	}

	/**
	 * Get a context variable
	 */
	get<K extends keyof V>(key: K): V[K] | undefined {
		return this._variables[key];
	}

	/**
	 * Check if variable exists
	 */
	has(key: keyof V): boolean {
		return key in this._variables;
	}

	// ============= Response Building =============

	/**
	 * Set response status
	 */
	status(code: StatusCode): this {
		this._response.status = code;
		return this;
	}

	/**
	 * Set response header
	 */
	setHeader(name: string, value: string): this {
		this._response.headers.set(name, value);
		return this;
	}

	/**
	 * Append response header
	 */
	appendHeader(name: string, value: string): this {
		this._response.headers.append(name, value);
		return this;
	}

	/**
	 * Create JSON response
	 */
	json<T>(data: T): Response {
		this._response.headers.set("Content-Type", "application/json");
		return new Response(JSON.stringify(data), {
			status: this._response.status,
			headers: this._response.headers,
		});
	}

	/**
	 * Create text response
	 */
	text(data: string): Response {
		if (!this._response.headers.has("Content-Type")) {
			this._response.headers.set("Content-Type", "text/plain");
		}
		return new Response(data, {
			status: this._response.status,
			headers: this._response.headers,
		});
	}

	/**
	 * Create HTML response
	 */
	html(data: string): Response {
		this._response.headers.set("Content-Type", "text/html; charset=utf-8");
		return new Response(data, {
			status: this._response.status,
			headers: this._response.headers,
		});
	}

	/**
	 * Create redirect response
	 */
	redirect(url: string, status: StatusCode = 302): Response {
		return new Response(null, {
			status,
			headers: {
				Location: url,
			},
		});
	}

	/**
	 * Create 404 Not Found response
	 */
	notFound(message = "Not Found"): Response {
		return new Response(JSON.stringify({ error: message }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
	}

	/**
	 * Create error response
	 */
	error(message: string, status: StatusCode = 500): Response {
		return new Response(JSON.stringify({ error: message }), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}

	/**
	 * Create a new Response with current state
	 */
	newResponse(body: Blob | ArrayBuffer | FormData | URLSearchParams | ReadableStream<unknown> | string | null, options?: ResponseInit): Response {
		return new Response(body, {
			status: this._response.status,
			headers: this._response.headers,
			...options,
		});
	}

	// ============= Utility Methods =============

	/**
	 * Parse query parameters from URL
	 */
	private parseQuery(url: string): Record<string, string> {
		const query: Record<string, string> = {};
		const searchParams = new URL(url).searchParams;

		for (const [key, value] of searchParams.entries()) {
			query[key] = value;
		}

		return query;
	}

	/**
	 * Check if request accepts a content type
	 */
	accepts(...types: string[]): string | undefined {
		const acceptHeader = this.req.headers.get("Accept");
		if (!acceptHeader) return types[0];

		// Simple implementation - just check if type is in accept header
		for (const type of types) {
			if (acceptHeader.includes(type) || acceptHeader.includes("*/*")) {
				return type;
			}
		}

		return undefined;
	}

	/**
	 * Check if request is AJAX
	 */
	get isXHR(): boolean {
		return this.req.headers.get("X-Requested-With") === "XMLHttpRequest";
	}

	/**
	 * Get client IP address
	 */
	get ip(): string | undefined {
		return (
			this.req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
			this.req.headers.get("x-real-ip") ??
			undefined
		);
	}
}

// ============= Context Factory =============

/**
 * Create a new context
 */
export function createContext(
	request: Request,
	params: PathParams = {},
): Context {
	return new Context(request, params);
}
