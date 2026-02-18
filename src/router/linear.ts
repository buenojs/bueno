/**
 * LinearRouter
 *
 * Optimized for applications with ≤10 routes.
 * - O(1) static route lookups via Map
 * - Simple O(n) iteration for dynamic routes
 * - Zero startup cost (no tree building)
 *
 * Best for: Microservices, development mode, small APIs
 */

import type {
	HTTPMethod,
	MiddlewareHandler,
	PathParams,
	RouteHandler,
} from "../types";

// ============= Types =============

export interface RouteMatch {
	handler: RouteHandler;
	params: PathParams;
	middleware?: MiddlewareHandler[];
	name?: string;
}

interface DynamicRoute {
	method: HTTPMethod | "ALL";
	pattern: string;
	handler: RouteHandler;
	middleware?: MiddlewareHandler[];
	name?: string;
	regex: RegExp;
	paramNames: string[];
	priority: number;
}

export interface RouteOptions {
	name?: string;
	middleware?: MiddlewareHandler | MiddlewareHandler[];
}

type StaticRouteKey = `${HTTPMethod | "ALL"}:${string}`;

// ============= Pattern Utilities =============

function patternToRegex(pattern: string): {
	regex: RegExp;
	paramNames: string[];
	isStatic: boolean;
	hasWildcard: boolean;
} {
	const paramNames: string[] = [];
	let isStatic = true;
	let hasWildcard = false;

	const segments: string[] = [];
	let i = 0;

	while (i < pattern.length) {
		if (pattern[i] === ":") {
			i++;

			let name = "";
			while (i < pattern.length && /[a-zA-Z0-9_]/.test(pattern[i])) {
				name += pattern[i];
				i++;
			}

			let optional = false;
			if (i < pattern.length && pattern[i] === "?") {
				optional = true;
				i++;
			}

			let customRegex = "";
			if (i < pattern.length && pattern[i] === "<") {
				i++;
				while (i < pattern.length && pattern[i] !== ">") {
					customRegex += pattern[i];
					i++;
				}
				i++;
			}

			paramNames.push(name);
			isStatic = false;

			if (optional) {
				if (segments.length > 0 && segments[segments.length - 1] === "/") {
					segments.pop();
				}
				segments.push("(?:/([^/]*))?");
			} else if (customRegex) {
				segments.push(`(${customRegex})`);
			} else {
				segments.push("([^/]+)");
			}
		} else if (pattern[i] === "*") {
			hasWildcard = true;
			isStatic = false;
			paramNames.push("*");
			segments.push("(.*)");
			i++;
		} else {
			const char = pattern[i];
			if (/[.+^${}()|[\]\\]/.test(char)) {
				segments.push(`\\${char}`);
			} else {
				segments.push(char);
			}
			i++;
		}
	}

	const regexStr = `^${segments.join("")}/?$`;

	return {
		regex: new RegExp(regexStr, "i"),
		paramNames,
		isStatic,
		hasWildcard,
	};
}

function extractParams(
	regex: RegExp,
	paramNames: string[],
	pathname: string,
): PathParams {
	const params: PathParams = {};
	const match = pathname.match(regex);

	if (match) {
		paramNames.forEach((name, index) => {
			if (match[index + 1] !== undefined) {
				params[name] = match[index + 1];
			}
		});
	}

	return params;
}

// ============= LinearRouter Class =============

export class LinearRouter {
	private staticRoutes: Map<
		StaticRouteKey,
		{
			handler: RouteHandler;
			middleware?: MiddlewareHandler[];
			name?: string;
		}
	> = new Map();

	private dynamicRoutes: DynamicRoute[] = [];

	private groupPrefix = "";
	private groupMiddleware: MiddlewareHandler[] = [];
	private routeCounter = 0;

	private addRoute(
		method: HTTPMethod | "ALL",
		pattern: string,
		handler: RouteHandler,
		options?: RouteOptions,
	): void {
		const fullPattern = this.groupPrefix + pattern;
		const { regex, paramNames, isStatic } = patternToRegex(fullPattern);

		const optsMiddleware = options?.middleware;
		const routeMiddleware: MiddlewareHandler[] = optsMiddleware
			? Array.isArray(optsMiddleware)
				? optsMiddleware
				: [optsMiddleware]
			: [];

		const middleware = [...this.groupMiddleware, ...routeMiddleware];

		if (isStatic) {
			const normalizedPath = fullPattern.toLowerCase();
			const key: StaticRouteKey = `${method}:${normalizedPath}`;

			this.staticRoutes.set(key, { handler, middleware, name: options?.name });

			if (!normalizedPath.endsWith("/")) {
				this.staticRoutes.set(`${method}:${normalizedPath}/`, {
					handler,
					middleware,
					name: options?.name,
				});
			} else if (normalizedPath.length > 1) {
				this.staticRoutes.set(`${method}:${normalizedPath.slice(0, -1)}`, {
					handler,
					middleware,
					name: options?.name,
				});
			}
		} else {
			this.dynamicRoutes.push({
				method,
				pattern: fullPattern,
				handler,
				middleware,
				name: options?.name,
				regex,
				paramNames,
				priority: this.routeCounter++,
			});

			this.sortDynamicRoutes();
		}
	}

	private sortDynamicRoutes(): void {
		this.dynamicRoutes.sort((a, b) => {
			if (a.paramNames.length !== b.paramNames.length) {
				return a.paramNames.length - b.paramNames.length;
			}
			return a.priority - b.priority;
		});
	}

	match(method: HTTPMethod | "ALL", pathname: string): RouteMatch | undefined {
		const normalizedPath = pathname.toLowerCase();

		const staticKey: StaticRouteKey = `${method}:${normalizedPath}`;
		const staticRoute = this.staticRoutes.get(staticKey);

		if (staticRoute) {
			return {
				handler: staticRoute.handler,
				params: {},
				middleware: staticRoute.middleware,
				name: staticRoute.name,
			};
		}

		const allKey: StaticRouteKey = `ALL:${normalizedPath}`;
		const allRoute = this.staticRoutes.get(allKey);

		if (allRoute) {
			return {
				handler: allRoute.handler,
				params: {},
				middleware: allRoute.middleware,
				name: allRoute.name,
			};
		}

		for (const route of this.dynamicRoutes) {
			if (route.method !== "ALL" && route.method !== method) {
				continue;
			}

			if (route.regex.test(pathname)) {
				const params = extractParams(route.regex, route.paramNames, pathname);
				return {
					handler: route.handler,
					params,
					middleware: route.middleware,
					name: route.name,
				};
			}
		}

		return undefined;
	}

	group(
		prefix: string,
		options?: { middleware?: MiddlewareHandler | MiddlewareHandler[] },
	): LinearRouter {
		const childRouter = new LinearRouter();

		childRouter.staticRoutes = this.staticRoutes;
		childRouter.dynamicRoutes = this.dynamicRoutes;
		childRouter.groupPrefix = this.groupPrefix + prefix;

		const optsMiddleware = options?.middleware;
		const middlewareArray: MiddlewareHandler[] = optsMiddleware
			? Array.isArray(optsMiddleware)
				? optsMiddleware
				: [optsMiddleware]
			: [];

		childRouter.groupMiddleware = [...this.groupMiddleware, ...middlewareArray];
		childRouter.routeCounter = this.routeCounter;

		return childRouter;
	}

	getRoutes(): Array<{
		method: HTTPMethod | "ALL";
		pattern: string;
		name?: string;
	}> {
		const routes: Array<{
			method: HTTPMethod | "ALL";
			pattern: string;
			name?: string;
		}> = [];
		const seenPatterns = new Set<string>();

		for (const [key, value] of this.staticRoutes) {
			const [method, path] = key.split(":") as [HTTPMethod | "ALL", string];
			const pattern =
				path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
			const dedupeKey = `${method}:${pattern}`;

			if (!seenPatterns.has(dedupeKey)) {
				seenPatterns.add(dedupeKey);
				routes.push({ method, pattern: pattern || "/", name: value.name });
			}
		}

		for (const route of this.dynamicRoutes) {
			routes.push({
				method: route.method,
				pattern: route.pattern,
				name: route.name,
			});
		}

		return routes;
	}

	getRouterType(): "linear" {
		return "linear";
	}

	getRouteCount(): { static: number; dynamic: number; total: number } {
		const staticCount = Math.floor(this.staticRoutes.size / 2);
		return {
			static: staticCount,
			dynamic: this.dynamicRoutes.length,
			total: staticCount + this.dynamicRoutes.length,
		};
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
