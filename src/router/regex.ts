/**
 * RegexRouter
 *
 * Balanced performance for applications with 10-100 routes.
 * - Compiled regex patterns for fast matching
 * - Priority-based sorting for correct route resolution
 * - Full feature support: params, wildcards, optional params, custom regex
 *
 * Best for: Medium-sized APIs, general purpose routing
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

interface RouteEntry {
	method: HTTPMethod | "ALL";
	pattern: string;
	handler: RouteHandler;
	middleware?: MiddlewareHandler[];
	name?: string;
	regex: RegExp;
	paramNames: string[];
	isStatic: boolean;
	priority: number;
}

export interface RouteOptions {
	name?: string;
	middleware?: MiddlewareHandler | MiddlewareHandler[];
}

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

// ============= RegexRouter Class =============

export class RegexRouter {
	private routes: RouteEntry[] = [];
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

		this.routes.push({
			method,
			pattern: fullPattern,
			handler,
			middleware: [...this.groupMiddleware, ...routeMiddleware],
			name: options?.name,
			regex,
			paramNames,
			isStatic,
			priority: this.routeCounter++,
		});

		this.sortRoutes();
	}

	private sortRoutes(): void {
		this.routes.sort((a, b) => {
			if (a.isStatic !== b.isStatic) {
				return a.isStatic ? -1 : 1;
			}
			if (a.paramNames.length !== b.paramNames.length) {
				return a.paramNames.length - b.paramNames.length;
			}
			return a.priority - b.priority;
		});
	}

	match(method: HTTPMethod | "ALL", pathname: string): RouteMatch | undefined {
		for (const route of this.routes) {
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
	): RegexRouter {
		const childRouter = new RegexRouter();
		childRouter.routes = this.routes;
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
		return this.routes.map((r) => ({
			method: r.method,
			pattern: r.pattern,
			name: r.name,
		}));
	}

	getRouterType(): "regex" {
		return "regex";
	}

	getRouteCount(): number {
		return this.routes.length;
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
