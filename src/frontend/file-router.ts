/**
 * File-based Routing Implementation
 *
 * Provides Next.js-style file-based routing:
 * - pages/ directory scanning
 * - Dynamic routes: [id].tsx, [...slug].tsx
 * - Route generation from file structure
 * - Integration with existing Router
 */

import { createLogger, type Logger } from "../logger/index.js";
import { Router } from "../router/index.js";
import type {
	FileRouterConfig,
	PartialFileRouterConfig,
	RouteDefinition,
	RouteMatch,
	DynamicRoute,
	RouteHandler,
	RouteMiddleware,
	FileRouteOptions,
	RouteType,
} from "./types.js";
import type { SSRPage } from "./types.js";

// ============= Constants =============

const DEFAULT_PAGES_DIR = "pages";
const DEFAULT_API_DIR = "api";
const SUPPORTED_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

// ============= File Router Class =============

/**
 * File-based router that scans directories and generates routes
 *
 * Features:
 * - Next.js-style file-based routing
 * - Dynamic routes with [param] syntax
 * - Catch-all routes with [...param] syntax
 * - API routes in pages/api/
 * - Hot reload support
 */
export class FileRouter {
	private config: FileRouterConfig;
	private logger: Logger;
	private routes: Map<string, RouteDefinition> = new Map();
	private dynamicRoutes: DynamicRoute[] = [];
	private router: Router;
	private pageModules: Map<string, SSRPage> = new Map();
	private apiHandlers: Map<string, Record<string, RouteHandler>> = new Map();

	constructor(config: PartialFileRouterConfig = {}) {
		this.config = this.normalizeConfig(config);
		this.logger = createLogger({
			level: "debug",
			pretty: true,
			context: { component: "FileRouter" },
		});
		this.router = new Router();
	}

	/**
	 * Normalize partial config to full config with defaults
	 */
	private normalizeConfig(config: PartialFileRouterConfig): FileRouterConfig {
		return {
			pagesDir: config.pagesDir ?? DEFAULT_PAGES_DIR,
			apiDir: config.apiDir ?? DEFAULT_API_DIR,
			rootDir: config.rootDir ?? process.cwd(),
			extensions: config.extensions ?? SUPPORTED_EXTENSIONS,
			watch: config.watch ?? false,
			ignore: config.ignore ?? ["node_modules", ".git", "dist", "build"],
		};
	}

	/**
	 * Initialize the file router by scanning the pages directory
	 */
	async init(): Promise<void> {
		this.logger.info(`Initializing file router from: ${this.config.pagesDir}`);
		await this.scanPagesDirectory();
		this.buildRouter();
		this.logger.info(`Loaded ${this.routes.size} routes`);
	}

	/**
	 * Scan the pages directory for route files
	 */
	private async scanPagesDirectory(): Promise<void> {
		const pagesPath = this.config.pagesDir;
		const glob = new Bun.Glob(`**/*{${this.config.extensions.join(",")}}`);

		try {
			for await (const file of glob.scan(pagesPath)) {
				await this.processRouteFile(file, pagesPath);
			}
		} catch (error) {
			this.logger.error(`Failed to scan pages directory: ${pagesPath}`, error);
		}
	}

	/**
	 * Process a single route file
	 */
	private async processRouteFile(filePath: string, basePath: string): Promise<void> {
		const fullPath = `${basePath}/${filePath}`;
		const routePath = this.filePathToRoute(filePath);

		// Determine route type
		const routeType = this.getRouteType(filePath);

		// Parse route parameters
		const { pattern, params } = this.parseRoutePattern(routePath);

		// Create route definition
		const route: RouteDefinition = {
			id: this.generateRouteId(filePath),
			path: routePath,
			pattern,
			filePath: fullPath,
			type: routeType,
			params,
			regex: this.routeToRegex(routePath),
		};

		// Store route
		this.routes.set(routePath, route);

		// If dynamic route, add to dynamic routes list
		if (params.length > 0) {
			this.dynamicRoutes.push({
				...route,
				paramNames: params,
			});
		}

		this.logger.debug(`Processed route: ${routePath} (${routeType})`);
	}

	/**
	 * Convert file path to route path
	 */
	private filePathToRoute(filePath: string): string {
		// Remove file extension
		let route = filePath.replace(/\.(tsx?|jsx?)$/, "");

		// Convert index to root
		if (route === "index") {
			return "/";
		}

		// Handle nested index files
		if (route.endsWith("/index")) {
			route = route.replace(/\/index$/, "");
		}

		// Ensure leading slash
		if (!route.startsWith("/")) {
			route = "/" + route;
		}

		return route;
	}

	/**
	 * Determine route type from file path
	 */
	private getRouteType(filePath: string): RouteType {
		if (filePath.startsWith(`${this.config.apiDir}/`) || filePath.startsWith("api/")) {
			return "api";
		}
		return "page";
	}

	/**
	 * Parse route pattern and extract parameters
	 */
	private parseRoutePattern(routePath: string): { pattern: string; params: string[] } {
		const params: string[] = [];
		let pattern = routePath;

		// Match [param] - single parameter
		const singleParamRegex = /\[([^\]]+)\]/g;
		let match;

		while ((match = singleParamRegex.exec(routePath)) !== null) {
			const paramName = match[1];
			if (!paramName.startsWith("...")) {
				params.push(paramName);
			}
		}

		// Match [...param] - catch-all parameter
		const catchAllRegex = /\[\.\.\.([^\]]+)\]/g;
		while ((match = catchAllRegex.exec(routePath)) !== null) {
			params.push(match[1]);
		}

		return { pattern, params };
	}

	/**
	 * Convert route path to regex
	 */
	private routeToRegex(routePath: string): RegExp {
		let regex = routePath;

		// Escape special regex characters except our param syntax
		regex = regex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

		// Replace catch-all params [...param] with capture group
		regex = regex.replace(/\\\[\\\.\.\.([^\]]+)\\\]/g, "(.*)");

		// Replace single params [param] with capture group
		regex = regex.replace(/\\\[([^\]]+)\\\]/g, "([^/]+)");

		// Ensure exact match
		return new RegExp(`^${regex}$`);
	}

	/**
	 * Generate unique route ID
	 */
	private generateRouteId(filePath: string): string {
		return filePath.replace(/[\/\\.]/g, "-").replace(/^-/, "");
	}

	/**
	 * Build the router from collected routes
	 */
	private buildRouter(): void {
		// Sort routes by specificity (static routes first, then dynamic)
		const sortedRoutes = this.sortRoutesBySpecificity();

		for (const route of sortedRoutes) {
			if (route.type === "page") {
				this.router.get(route.path, this.createPageHandler(route) as import("../types").RouteHandler);
			} else if (route.type === "api") {
				this.registerApiRoute(route);
			}
		}
	}

	/**
	 * Sort routes by specificity
	 * Static routes come before dynamic routes
	 */
	private sortRoutesBySpecificity(): RouteDefinition[] {
		return Array.from(this.routes.values()).sort((a, b) => {
			// Static routes first
			if (a.params.length === 0 && b.params.length > 0) return -1;
			if (a.params.length > 0 && b.params.length === 0) return 1;

			// More specific routes first (fewer params)
			if (a.params.length !== b.params.length) {
				return a.params.length - b.params.length;
			}

			// Alphabetical by path
			return a.path.localeCompare(b.path);
		});
	}

	/**
	 * Create page handler for a route
	 */
	private createPageHandler(route: RouteDefinition): RouteHandler {
		return async (request: Request) => {
			const module = await this.loadPageModule(route.filePath);
			if (!module) {
				return new Response("Page not found", { status: 404 });
			}

			// Extract params from request
			const url = new URL(request.url);
			const params = this.extractParams(url.pathname, route);

			// Call the page's render method or default handler
			if (module.render) {
				const ctx = this.createContext(request, params);
				const result = await module.render(ctx);
				return new Response(result.html, {
					headers: { "Content-Type": "text/html" },
					status: result.status,
				});
			}

			return new Response("Page handler not implemented", { status: 500 });
		};
	}

	/**
	 * Register API route with all HTTP methods
	 */
	private async registerApiRoute(route: RouteDefinition): Promise<void> {
		const module = await this.loadApiModule(route.filePath);
		if (!module) return;

		const handlers: Record<string, RouteHandler> = {};
		const methodMap: Record<string, (pattern: string, handler: import("../types").RouteHandler) => void> = {
			GET: this.router.get.bind(this.router),
			POST: this.router.post.bind(this.router),
			PUT: this.router.put.bind(this.router),
			PATCH: this.router.patch.bind(this.router),
			DELETE: this.router.delete.bind(this.router),
			HEAD: this.router.head.bind(this.router),
			OPTIONS: this.router.options.bind(this.router),
		};

		for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const) {
			if (module[method]) {
				handlers[method] = module[method];
				methodMap[method](route.path, this.createApiHandler(route, method) as import("../types").RouteHandler);
			}
		}

		this.apiHandlers.set(route.path, handlers);
	}

	/**
	 * Create API handler for a route and method
	 */
	private createApiHandler(route: RouteDefinition, method: string): RouteHandler {
		return async (request: Request) => {
			const module = await this.loadApiModule(route.filePath);
			if (!module || !module[method]) {
				return new Response("Method not allowed", { status: 405 });
			}

			const url = new URL(request.url);
			const params = this.extractParams(url.pathname, route);
			const ctx = this.createContext(request, params);

			return module[method](ctx as unknown as Request);
		};
	}

	/**
	 * Load page module dynamically
	 */
	private async loadPageModule(filePath: string): Promise<SSRPage | null> {
		if (this.pageModules.has(filePath)) {
			return this.pageModules.get(filePath)!;
		}

		try {
			const module = await import(filePath);
			this.pageModules.set(filePath, module.default || module);
			return module.default || module;
		} catch (error) {
			this.logger.error(`Failed to load page module: ${filePath}`, error);
			return null;
		}
	}

	/**
	 * Load API module dynamically
	 */
	private async loadApiModule(filePath: string): Promise<Record<string, RouteHandler> | null> {
		try {
			const module = await import(filePath);
			return module;
		} catch (error) {
			this.logger.error(`Failed to load API module: ${filePath}`, error);
			return null;
		}
	}

	/**
	 * Extract params from URL using route definition
	 */
	private extractParams(pathname: string, route: RouteDefinition): Record<string, string> {
		const params: Record<string, string> = {};
		const match = pathname.match(route.regex);

		if (match && route.params.length > 0) {
			for (let i = 0; i < route.params.length; i++) {
				params[route.params[i]] = match[i + 1];
			}
		}

		return params;
	}

	/**
	 * Create context for request
	 */
	private createContext(request: Request, params: Record<string, string> = {}): import("./types").SSRContext {
		const url = new URL(request.url);
		return {
			request,
			url: request.url,
			pathname: url.pathname,
			query: url.searchParams,
			params,
			headers: new Headers(),
			status: 200,
			head: [],
			body: [],
			data: {},
			modules: new Set<string>(),
		};
	}

	/**
	 * Match a request to a route
	 */
	match(method: string, pathname: string): RouteMatch | null {
		// Try static routes first
		const staticRoute = this.routes.get(pathname);
		if (staticRoute) {
			return {
				route: staticRoute,
				params: {},
			};
		}

		// Try dynamic routes
		for (const route of this.dynamicRoutes) {
			const match = pathname.match(route.regex);
			if (match) {
				const params: Record<string, string> = {};
				for (let i = 0; i < route.paramNames.length; i++) {
					params[route.paramNames[i]] = match[i + 1];
				}
				return {
					route,
					params,
				};
			}
		}

		return null;
	}

	/**
	 * Handle incoming request
	 */
	async handle(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const match = this.match(request.method, url.pathname);

		if (!match) {
			return new Response("Not Found", { status: 404 });
		}

		const handler = this.createHandler(match.route, request.method);
		return handler(request);
	}

	/**
	 * Create handler for route
	 */
	private createHandler(route: RouteDefinition, method: string): RouteHandler {
		if (route.type === "api") {
			return this.createApiHandler(route, method);
		}
		return this.createPageHandler(route);
	}

	/**
	 * Get all routes
	 */
	getRoutes(): RouteDefinition[] {
		return Array.from(this.routes.values());
	}

	/**
	 * Get route by path
	 */
	getRoute(path: string): RouteDefinition | undefined {
		return this.routes.get(path);
	}

	/**
	 * Get dynamic routes
	 */
	getDynamicRoutes(): DynamicRoute[] {
		return this.dynamicRoutes;
	}

	/**
	 * Generate URL for a route
	 */
	generateUrl(routeId: string, params: Record<string, string> = {}): string | null {
		for (const route of this.routes.values()) {
			if (route.id === routeId) {
				let url = route.path;
				for (const [key, value] of Object.entries(params)) {
					url = url.replace(`[${key}]`, value);
					url = url.replace(`[...${key}]`, value);
				}
				return url;
			}
		}
		return null;
	}

	/**
	 * Reload routes (for hot reload)
	 */
	async reload(): Promise<void> {
		this.logger.info("Reloading routes...");
		this.routes.clear();
		this.dynamicRoutes = [];
		this.pageModules.clear();
		this.apiHandlers.clear();
		this.router = new Router();
		await this.init();
	}

	/**
	 * Get the underlying router
	 */
	getRouter(): Router {
		return this.router;
	}

	/**
	 * Get configuration
	 */
	getConfig(): FileRouterConfig {
		return { ...this.config };
	}
}

// ============= Factory Function =============

/**
 * Create a file router
 */
export function createFileRouter(config: PartialFileRouterConfig = {}): FileRouter {
	return new FileRouter(config);
}

// ============= Utility Functions =============

/**
 * Check if a path is a dynamic route
 */
export function isDynamicRoute(path: string): boolean {
	return /\[.*\]/.test(path);
}

/**
 * Check if a path is a catch-all route
 */
export function isCatchAllRoute(path: string): boolean {
	return /\[\.\.\..*\]/.test(path);
}

/**
 * Get parameter names from route path
 */
export function getRouteParams(path: string): string[] {
	const params: string[] = [];
	const regex = /\[([^\]]+)\]/g;
	let match;

	while ((match = regex.exec(path)) !== null) {
		let param = match[1];
		if (param.startsWith("...")) {
			param = param.slice(3);
		}
		params.push(param);
	}

	return params;
}

/**
 * Normalize route path
 */
export function normalizeRoutePath(path: string): string {
	// Remove trailing slash except for root
	if (path !== "/" && path.endsWith("/")) {
		path = path.slice(0, -1);
	}

	// Ensure leading slash
	if (!path.startsWith("/")) {
		path = "/" + path;
	}

	return path;
}

/**
 * Compare route specificity
 * Returns negative if a is more specific, positive if b is more specific
 */
export function compareRouteSpecificity(a: string, b: string): number {
	const aParams = getRouteParams(a);
	const bParams = getRouteParams(b);

	// Fewer params = more specific
	if (aParams.length !== bParams.length) {
		return aParams.length - bParams.length;
	}

	// Catch-all routes are less specific
	const aCatchAll = isCatchAllRoute(a);
	const bCatchAll = isCatchAllRoute(b);

	if (aCatchAll && !bCatchAll) return 1;
	if (!aCatchAll && bCatchAll) return -1;

	// Alphabetical comparison
	return a.localeCompare(b);
}