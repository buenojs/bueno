/**
 * API Routes Implementation
 *
 * Provides Next.js-style API routes:
 * - pages/api/ directory for API endpoints
 * - HTTP method handlers (GET, POST, PUT, PATCH, DELETE, etc.)
 * - Request context with params, query, body
 * - Middleware support via _middleware.ts
 * - Type-safe response helpers
 */

import { createLogger, type Logger } from "../logger/index.js";
import type {
	APIRouteConfig,
	PartialAPIRouteConfig,
	APIRouteDefinition,
	APIRouteHandler,
	APIContext,
	APIResponse,
	APIMiddleware,
	APIRouteModule,
	HTTPMethod,
} from "./types.js";

// ============= Constants =============

const DEFAULT_API_DIR = "pages/api";
const SUPPORTED_EXTENSIONS = [".ts", ".js"];
const SUPPORTED_METHODS: HTTPMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

// ============= API Route Manager Class =============

/**
 * API Route Manager handles API endpoint registration and routing
 *
 * Features:
 * - pages/api/ directory scanning
 * - HTTP method handlers
 * - Request context with params, query, body
 * - Middleware support
 * - Type-safe response helpers
 */
export class APIRouteManager {
	private config: APIRouteConfig;
	private logger: Logger;
	private routes: Map<string, APIRouteDefinition> = new Map();
	private middlewares: Map<string, APIMiddleware[]> = new Map();
	private modules: Map<string, APIRouteModule> = new Map();

	constructor(config: PartialAPIRouteConfig = {}) {
		this.config = this.normalizeConfig(config);
		this.logger = createLogger({
			level: "debug",
			pretty: true,
			context: { component: "APIRouteManager" },
		});
	}

	/**
	 * Normalize partial config to full config with defaults
	 */
	private normalizeConfig(config: PartialAPIRouteConfig): APIRouteConfig {
		return {
			apiDir: config.apiDir ?? DEFAULT_API_DIR,
			rootDir: config.rootDir ?? process.cwd(),
			extensions: config.extensions ?? SUPPORTED_EXTENSIONS,
			bodyLimit: config.bodyLimit ?? 1024 * 1024, // 1MB default
		};
	}

	/**
	 * Initialize the API route manager by scanning for API files
	 */
	async init(): Promise<void> {
		this.logger.info(`Initializing API routes from: ${this.config.apiDir}`);
		await this.scanAPIDirectory();
		this.logger.info(`Loaded ${this.routes.size} API routes`);
	}

	/**
	 * Scan the API directory for route files
	 */
	private async scanAPIDirectory(): Promise<void> {
		const apiPath = this.config.apiDir;
		const glob = new Bun.Glob(`**/*{${this.config.extensions.join(",")}}`);

		try {
			for await (const file of glob.scan(apiPath)) {
				// Skip middleware files
				if (file.includes("_middleware")) continue;

				await this.processAPIFile(file, apiPath);
			}

			// Load middlewares after routes
			await this.loadMiddlewares(apiPath);
		} catch (error) {
			this.logger.error(`Failed to scan API directory: ${apiPath}`, error);
		}
	}

	/**
	 * Process a single API file
	 */
	private async processAPIFile(filePath: string, basePath: string): Promise<void> {
		const fullPath = `${basePath}/${filePath}`;
		const routePath = this.filePathToRoute(filePath);

		// Load the module to check for handlers
		const module = await this.loadModule(fullPath);
		if (!module) return;

		// Check which HTTP methods are exported
		const methods: HTTPMethod[] = [];
		for (const method of SUPPORTED_METHODS) {
			if (typeof module[method] === "function") {
				methods.push(method);
			}
		}

		if (methods.length === 0) {
			this.logger.warn(`No HTTP handlers found in: ${filePath}`);
			return;
		}

		// Parse route parameters
		const params = this.parseRouteParams(routePath);

		const route: APIRouteDefinition = {
			id: this.generateRouteId(filePath),
			path: routePath,
			filePath: fullPath,
			methods,
			params,
			regex: this.routeToRegex(routePath),
		};

		this.routes.set(routePath, route);
		this.logger.debug(`Processed API route: ${routePath} [${methods.join(", ")}]`);
	}

	/**
	 * Load middlewares from _middleware.ts files
	 */
	private async loadMiddlewares(basePath: string): Promise<void> {
		const glob = new Bun.Glob(`**/_middleware{${this.config.extensions.join(",")}}`);

		try {
			for await (const file of glob.scan(basePath)) {
				const fullPath = `${basePath}/${file}`;
				const segment = this.getMiddlewareSegment(file);

				const module = await import(fullPath);
				const middleware = module.default || module.middleware;

				if (middleware) {
					if (Array.isArray(middleware)) {
						this.middlewares.set(segment, middleware);
					} else {
						this.middlewares.set(segment, [middleware]);
					}
					this.logger.debug(`Loaded middleware for: ${segment}`);
				}
			}
		} catch (error) {
			this.logger.error("Failed to load middlewares", error);
		}
	}

	/**
	 * Get middleware segment from file path
	 */
	private getMiddlewareSegment(filePath: string): string {
		const segment = filePath.replace(/\/_middleware\.(ts|js)$/, "");
		return segment === "" ? "/" : `/${segment}`;
	}

	/**
	 * Convert file path to API route path
	 */
	private filePathToRoute(filePath: string): string {
		// Remove file extension
		let route = filePath.replace(/\.(ts|js)$/, "");

		// Convert index to root
		if (route === "index") {
			return "/api";
		}

		// Handle nested index files
		if (route.endsWith("/index")) {
			route = route.replace(/\/index$/, "");
		}

		// Ensure leading /api
		if (!route.startsWith("api/")) {
			route = `api/${route}`;
		}

		return `/${route}`;
	}

	/**
	 * Parse route parameters from path
	 */
	private parseRouteParams(path: string): string[] {
		const params: string[] = [];
		const regex = /\[([^\]]+)\]/g;
		let match;

		while ((match = regex.exec(path)) !== null) {
			params.push(match[1]);
		}

		return params;
	}

	/**
	 * Convert route path to regex
	 */
	private routeToRegex(routePath: string): RegExp {
		let regex = routePath;

		// Escape special regex characters
		regex = regex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

		// Replace catch-all params [...param] with capture group
		regex = regex.replace(/\\\[\\\.\.\.([^\]]+)\\\]/g, "(.*)");

		// Replace single params [param] with capture group
		regex = regex.replace(/\\\[([^\]]+)\\\]/g, "([^/]+)");

		return new RegExp(`^${regex}$`);
	}

	/**
	 * Generate unique route ID
	 */
	private generateRouteId(filePath: string): string {
		return `api-${filePath.replace(/[\/\\.]/g, "-")}`;
	}

	/**
	 * Load API module
	 */
	private async loadModule(filePath: string): Promise<APIRouteModule | null> {
		if (this.modules.has(filePath)) {
			return this.modules.get(filePath)!;
		}

		try {
			const module = await import(filePath);
			this.modules.set(filePath, module);
			return module;
		} catch (error) {
			this.logger.error(`Failed to load API module: ${filePath}`, error);
			return null;
		}
	}

	/**
	 * Match a request to an API route
	 */
	match(method: string, pathname: string): { route: APIRouteDefinition; params: Record<string, string> } | null {
		for (const route of this.routes.values()) {
			const match = pathname.match(route.regex);
			if (match) {
				// Check if method is supported
				if (!route.methods.includes(method as HTTPMethod)) {
					continue;
				}

				// Extract params
				const params: Record<string, string> = {};
				for (let i = 0; i < route.params.length; i++) {
					params[route.params[i]] = match[i + 1];
				}

				return { route, params };
			}
		}

		return null;
	}

	/**
	 * Handle incoming API request
	 */
	async handle(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const pathname = url.pathname;
		const method = request.method as HTTPMethod;

		const match = this.match(method, pathname);

		if (!match) {
			// Check if route exists but method not allowed
			const routeExists = this.routeExists(pathname);
			if (routeExists) {
				return this.jsonResponse({ error: "Method Not Allowed" }, 405);
			}
			return this.jsonResponse({ error: "Not Found" }, 404);
		}

		const { route, params } = match;

		// Create context
		const context = await this.createContext(request, params);

		// Get middlewares
		const middlewares = this.getMiddlewaresForPath(pathname);

		// Run middlewares and handler
		try {
			return await this.runWithMiddleware(context, middlewares, route, method);
		} catch (error) {
			this.logger.error(`API error: ${pathname}`, error);
			return this.jsonResponse(
				{ error: "Internal Server Error", message: error instanceof Error ? error.message : "Unknown error" },
				500
			);
		}
	}

	/**
	 * Check if a route exists (any method)
	 */
	private routeExists(pathname: string): boolean {
		for (const route of this.routes.values()) {
			if (pathname.match(route.regex)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Create API context from request
	 */
	private async createContext(
		request: Request,
		params: Record<string, string>
	): Promise<APIContext> {
		const url = new URL(request.url);

		// Parse body based on content type
		let body: unknown = null;
		const contentType = request.headers.get("content-type") || "";

		if (request.body) {
			try {
				if (contentType.includes("application/json")) {
					body = await request.json();
				} else if (contentType.includes("application/x-www-form-urlencoded")) {
					const formData = await request.formData();
					body = Object.fromEntries(formData);
				} else if (contentType.includes("multipart/form-data")) {
					const formData = await request.formData();
					body = formData;
				} else {
					body = await request.text();
				}
			} catch (error) {
				this.logger.warn("Failed to parse request body", error as Record<string, unknown>);
			}
		}

		return {
			request,
			url: request.url,
			pathname: url.pathname,
			query: url.searchParams,
			params,
			body,
			headers: request.headers,
			method: request.method as HTTPMethod,
			cookies: this.parseCookies(request.headers.get("cookie") || ""),
		};
	}

	/**
	 * Parse cookies from header
	 */
	private parseCookies(cookieHeader: string): Record<string, string> {
		const cookies: Record<string, string> = {};

		if (!cookieHeader) return cookies;

		for (const cookie of cookieHeader.split(";")) {
			const [name, value] = cookie.trim().split("=");
			if (name && value) {
				cookies[name] = decodeURIComponent(value);
			}
		}

		return cookies;
	}

	/**
	 * Get middlewares for a path
	 */
	private getMiddlewaresForPath(pathname: string): APIMiddleware[] {
		const middlewares: APIMiddleware[] = [];

		// Check each middleware segment
		for (const [segment, segmentMiddlewares] of this.middlewares) {
			if (segment === "/" || pathname.startsWith(segment)) {
				middlewares.push(...segmentMiddlewares);
			}
		}

		return middlewares;
	}

	/**
	 * Run request through middlewares and handler
	 */
	private async runWithMiddleware(
		context: APIContext,
		middlewares: APIMiddleware[],
		route: APIRouteDefinition,
		method: HTTPMethod
	): Promise<Response> {
		let index = 0;

		const next = async (): Promise<Response> => {
			if (index < middlewares.length) {
				const middleware = middlewares[index++];
				return middleware(context, next);
			}

			// Run the actual handler
			const module = await this.loadModule(route.filePath);
			if (!module || !module[method]) {
				return this.jsonResponse({ error: "Handler Not Found" }, 404);
			}

			const result = await module[method](context);
			return this.normalizeResponse(result);
		};

		return next();
	}

	/**
	 * Normalize response to Response object
	 */
	private normalizeResponse(result: APIResponse | Response): Response {
		if (result instanceof Response) {
			return result;
		}

		if (typeof result === "string") {
			return new Response(result, {
				headers: { "Content-Type": "text/plain" },
			});
		}

		return this.jsonResponse(result);
	}

	/**
	 * Create JSON response
	 */
	private jsonResponse(data: unknown, status = 200): Response {
		return new Response(JSON.stringify(data), {
			status,
			headers: {
				"Content-Type": "application/json",
			},
		});
	}

	/**
	 * Get all routes
	 */
	getRoutes(): APIRouteDefinition[] {
		return Array.from(this.routes.values());
	}

	/**
	 * Get route by path
	 */
	getRoute(path: string): APIRouteDefinition | undefined {
		return this.routes.get(path);
	}

	/**
	 * Reload routes (for hot reload)
	 */
	async reload(): Promise<void> {
		this.logger.info("Reloading API routes...");
		this.routes.clear();
		this.middlewares.clear();
		this.modules.clear();
		await this.init();
	}

	/**
	 * Get configuration
	 */
	getConfig(): APIRouteConfig {
		return { ...this.config };
	}
}

// ============= Factory Function =============

/**
 * Create an API route manager
 */
export function createAPIRouteManager(config: PartialAPIRouteConfig = {}): APIRouteManager {
	return new APIRouteManager(config);
}

// ============= Response Helpers =============

/**
 * Create a JSON response
 */
export function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
	});
}

/**
 * Create a text response
 */
export function text(data: string, status = 200, headers?: Record<string, string>): Response {
	return new Response(data, {
		status,
		headers: {
			"Content-Type": "text/plain",
			...headers,
		},
	});
}

/**
 * Create an HTML response
 */
export function html(data: string, status = 200, headers?: Record<string, string>): Response {
	return new Response(data, {
		status,
		headers: {
			"Content-Type": "text/html",
			...headers,
		},
	});
}

/**
 * Create a redirect response
 */
export function redirect(url: string, status = 302): Response {
	return new Response(null, {
		status,
		headers: {
			Location: url,
		},
	});
}

/**
 * Create an error response
 */
export function error(message: string, status = 500): Response {
	return json({ error: message }, status);
}

/**
 * Create a 404 Not Found response
 */
export function notFound(message = "Not Found"): Response {
	return json({ error: message }, 404);
}

/**
 * Create a 401 Unauthorized response
 */
export function unauthorized(message = "Unauthorized"): Response {
	return json({ error: message }, 401);
}

/**
 * Create a 403 Forbidden response
 */
export function forbidden(message = "Forbidden"): Response {
	return json({ error: message }, 403);
}

/**
 * Create a 400 Bad Request response
 */
export function badRequest(message = "Bad Request"): Response {
	return json({ error: message }, 400);
}

/**
 * Create a 201 Created response
 */
export function created(data: unknown): Response {
	return json(data, 201);
}

/**
 * Create a 204 No Content response
 */
export function noContent(): Response {
	return new Response(null, { status: 204 });
}

// ============= Utility Functions =============

/**
 * Check if a file is an API route file
 */
export function isAPIRouteFile(filename: string): boolean {
	return SUPPORTED_EXTENSIONS.some(ext => filename.endsWith(ext)) && 
		!filename.includes("_middleware");
}

/**
 * Check if a file is a middleware file
 */
export function isMiddlewareFile(filename: string): boolean {
	return filename.includes("_middleware");
}

/**
 * Get HTTP methods from module
 */
export function getModuleMethods(module: APIRouteModule): HTTPMethod[] {
	return SUPPORTED_METHODS.filter(method => typeof module[method] === "function");
}