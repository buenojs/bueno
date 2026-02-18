/**
 * Router System with Auto-Selection
 *
 * Automatically selects the optimal router implementation based on route count:
 * - LinearRouter: ≤10 routes (O(1) static, O(n) dynamic)
 * - RegexRouter: 11-50 routes (compiled regex patterns)
 * - TreeRouter: >50 routes (O(log n) radix tree)
 *
 * You can also explicitly choose a router type for specific use cases.
 */

import type {
	HTTPMethod,
	MiddlewareHandler,
	PathParams,
	RouteHandler,
} from "../types";
import { LinearRouter } from "./linear";
import { RegexRouter } from "./regex";
import { TreeRouter } from "./tree";

// ============= Types =============

export interface RouteMatch {
	handler: RouteHandler;
	params: PathParams;
	middleware?: MiddlewareHandler[];
	name?: string;
}

export interface RouteOptions {
	name?: string;
	middleware?: MiddlewareHandler | MiddlewareHandler[];
}

export type RouterType = "auto" | "linear" | "regex" | "tree";

export interface RouterConfig {
	type?: RouterType;
	linearThreshold?: number;
	regexThreshold?: number;
}

interface RouterLike {
	match(method: HTTPMethod | "ALL", pathname: string): RouteMatch | undefined;
	group(
		prefix: string,
		options?: { middleware?: MiddlewareHandler | MiddlewareHandler[] },
	): RouterLike;
	getRoutes(): Array<{
		method: HTTPMethod | "ALL";
		pattern: string;
		name?: string;
	}>;
	getRouterType(): string;
	get(pattern: string, handler: RouteHandler, options?: RouteOptions): void;
	post(pattern: string, handler: RouteHandler, options?: RouteOptions): void;
	put(pattern: string, handler: RouteHandler, options?: RouteOptions): void;
	patch(pattern: string, handler: RouteHandler, options?: RouteOptions): void;
	delete(pattern: string, handler: RouteHandler, options?: RouteOptions): void;
	head(pattern: string, handler: RouteHandler, options?: RouteOptions): void;
	options(pattern: string, handler: RouteHandler, options?: RouteOptions): void;
	all(pattern: string, handler: RouteHandler, options?: RouteOptions): void;
}

// ============= Thresholds =============

const DEFAULT_LINEAR_THRESHOLD = 10;
const DEFAULT_REGEX_THRESHOLD = 50;

// ============= AutoRouter Class =============

export class Router {
	private router: RouterLike;
	private config: Required<RouterConfig>;
	private pendingRoutes: Array<{
		method: HTTPMethod | "ALL";
		pattern: string;
		handler: RouteHandler;
		options?: RouteOptions;
	}> = [];
	private isBuilt = false;
	private groupPrefix = "";
	private groupMiddleware: MiddlewareHandler[] = [];

	constructor(config: RouterConfig = {}) {
		this.config = {
			type: config.type ?? "auto",
			linearThreshold: config.linearThreshold ?? DEFAULT_LINEAR_THRESHOLD,
			regexThreshold: config.regexThreshold ?? DEFAULT_REGEX_THRESHOLD,
		};

		if (this.config.type !== "auto") {
			this.router = this.createRouter(this.config.type);
		} else {
			this.router = new LinearRouter();
		}
	}

	private createRouter(type: RouterType): RouterLike {
		switch (type) {
			case "linear":
				return new LinearRouter();
			case "regex":
				return new RegexRouter();
			case "tree":
				return new TreeRouter();
			default:
				return new LinearRouter();
		}
	}

	private getOptimalRouterType(count: number): "linear" | "regex" | "tree" {
		if (count <= this.config.linearThreshold) {
			return "linear";
		}
		if (count <= this.config.regexThreshold) {
			return "regex";
		}
		return "tree";
	}

	private migrateRouter(newType: "linear" | "regex" | "tree"): void {
		this.router = this.createRouter(newType);

		for (const route of this.pendingRoutes) {
			this.addToRouter(
				route.method,
				route.pattern,
				route.handler,
				route.options,
			);
		}
	}

	private addToRouter(
		method: HTTPMethod | "ALL",
		pattern: string,
		handler: RouteHandler,
		options?: RouteOptions,
	): void {
		switch (method) {
			case "GET":
				this.router.get(pattern, handler, options);
				break;
			case "POST":
				this.router.post(pattern, handler, options);
				break;
			case "PUT":
				this.router.put(pattern, handler, options);
				break;
			case "PATCH":
				this.router.patch(pattern, handler, options);
				break;
			case "DELETE":
				this.router.delete(pattern, handler, options);
				break;
			case "HEAD":
				this.router.head(pattern, handler, options);
				break;
			case "OPTIONS":
				this.router.options(pattern, handler, options);
				break;
			case "ALL":
				this.router.all(pattern, handler, options);
				break;
		}
	}

	private addRoute(
		method: HTTPMethod | "ALL",
		pattern: string,
		handler: RouteHandler,
		options?: RouteOptions,
	): void {
		const fullPattern = this.groupPrefix + pattern;

		const optsMiddleware = options?.middleware;
		const routeMiddleware: MiddlewareHandler[] = optsMiddleware
			? Array.isArray(optsMiddleware)
				? optsMiddleware
				: [optsMiddleware]
			: [];

		const allMiddleware = [...this.groupMiddleware, ...routeMiddleware];
		const fullOptions: RouteOptions | undefined =
			options?.name || allMiddleware.length > 0
				? {
						name: options?.name,
						middleware: allMiddleware,
					}
				: undefined;

		this.pendingRoutes.push({
			method,
			pattern: fullPattern,
			handler,
			options: fullOptions,
		});

		this.addToRouter(method, fullPattern, handler, fullOptions);

		if (this.config.type === "auto" && !this.isBuilt) {
			const routeCount = this.pendingRoutes.length;
			const optimalType = this.getOptimalRouterType(routeCount);
			const currentType = this.router.getRouterType();

			if (currentType !== optimalType) {
				this.migrateRouter(optimalType);
			}
		}
	}

	match(method: HTTPMethod | "ALL", pathname: string): RouteMatch | undefined {
		this.isBuilt = true;
		return this.router.match(method, pathname);
	}

	group(
		prefix: string,
		options?: { middleware?: MiddlewareHandler | MiddlewareHandler[] },
	): Router {
		const childRouter = new Router(this.config);

		(childRouter as unknown as { router: RouterLike }).router = this.router;
		childRouter.pendingRoutes = this.pendingRoutes;
		childRouter.groupPrefix = this.groupPrefix + prefix;
		childRouter.isBuilt = this.isBuilt;

		const optsMiddleware = options?.middleware;
		const middlewareArray: MiddlewareHandler[] = optsMiddleware
			? Array.isArray(optsMiddleware)
				? optsMiddleware
				: [optsMiddleware]
			: [];

		childRouter.groupMiddleware = [...this.groupMiddleware, ...middlewareArray];

		return childRouter;
	}

	getRoutes(): Array<{
		method: HTTPMethod | "ALL";
		pattern: string;
		name?: string;
	}> {
		return this.router.getRoutes();
	}

	getRouterType(): string {
		return this.router.getRouterType();
	}

	getRouteCount(): number {
		return this.pendingRoutes.length;
	}

	getConfig(): Required<RouterConfig> {
		return { ...this.config };
	}

	get(pattern: string, handler: RouteHandler, options?: RouteOptions): void {
		this.addRoute("GET", pattern, handler, options);
	}

	post(pattern: string, handler: RouteHandler, options?: RouteOptions): void {
		this.addRoute("POST", pattern, handler, options);
	}

	put(pattern: string, handler: RouteHandler, options?: RouteOptions): void {
		this.addRoute("PUT", pattern, handler, options);
	}

	patch(pattern: string, handler: RouteHandler, options?: RouteOptions): void {
		this.addRoute("PATCH", pattern, handler, options);
	}

	delete(pattern: string, handler: RouteHandler, options?: RouteOptions): void {
		this.addRoute("DELETE", pattern, handler, options);
	}

	head(pattern: string, handler: RouteHandler, options?: RouteOptions): void {
		this.addRoute("HEAD", pattern, handler, options);
	}

	options(
		pattern: string,
		handler: RouteHandler,
		options?: RouteOptions,
	): void {
		this.addRoute("OPTIONS", pattern, handler, options);
	}

	all(pattern: string, handler: RouteHandler, options?: RouteOptions): void {
		this.addRoute("ALL", pattern, handler, options);
	}
}

// ============= Re-export Router Types =============

export { LinearRouter } from "./linear";
export { RegexRouter } from "./regex";
export { TreeRouter } from "./tree";

// ============= Utility: Route URL Generation =============

export function generateUrl(pattern: string, params: PathParams = {}): string {
	return pattern
		.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\?/g, (_, name) => params[name] ?? "")
		.replace(
			/:([a-zA-Z_][a-zA-Z0-9_]*)<[^>]+>/g,
			(_, name) => params[name] ?? "",
		)
		.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
			if (params[name] === undefined) {
				throw new Error(`Missing required parameter: ${name}`);
			}
			return params[name];
		})
		.replace(/\*/g, () => params["*"] ?? "");
}

// ============= Factory Functions =============

export function createRouter(config?: RouterConfig): Router {
	return new Router(config);
}

export function createLinearRouter(): LinearRouter {
	return new LinearRouter();
}

export function createRegexRouter(): RegexRouter {
	return new RegexRouter();
}

export function createTreeRouter(): TreeRouter {
	return new TreeRouter();
}
