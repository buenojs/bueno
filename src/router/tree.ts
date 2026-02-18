/**
 * TreeRouter (Radix Tree Router)
 *
 * Optimized for applications with 100+ routes.
 * - O(log n) lookups via radix tree traversal
 * - Efficient prefix compression
 * - Supports parameters, wildcards, and regex constraints
 *
 * Best for: Large APIs, enterprise applications, complex routing
 *
 * Tree Structure Example:
 *
 *     root
 *      |
 *     /api
 *    /    \
 *  /users  /posts
 *   /  \       \
 * /:id /list  /:id
 *  |    |      |
 * GET  GET    GET
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

export interface RouteOptions {
	name?: string;
	middleware?: MiddlewareHandler | MiddlewareHandler[];
}

interface RouteHandlerEntry {
	handler: RouteHandler;
	middleware?: MiddlewareHandler[];
	name?: string;
}

interface TreeNode {
	/** Path segment (e.g., "users", ":id", "") */
	path: string;

	/** Children indexed by path prefix */
	children: Map<string, TreeNode>;

	/** Parameter child (for :param patterns) */
	paramChild?: TreeNode;

	/** Parameter name if this is a param node */
	paramName?: string;

	/** Regex constraint for parameter */
	paramRegex?: RegExp;

	/** Wildcard child */
	wildcardChild?: TreeNode;

	/** Handlers indexed by HTTP method */
	handlers: Map<HTTPMethod | "ALL", RouteHandlerEntry>;

	/** Is this a wildcard node? */
	isWildcard: boolean;
}

// ============= TreeRouter Class =============

export class TreeRouter {
	private root: TreeNode;
	private groupPrefix = "";
	private groupMiddleware: MiddlewareHandler[] = [];
	private routeCount = 0;

	constructor() {
		this.root = this.createNode("");
	}

	private createNode(
		path: string,
		paramName?: string,
		paramRegex?: RegExp,
		isWildcard = false,
	): TreeNode {
		return {
			path,
			children: new Map(),
			handlers: new Map(),
			paramName,
			paramRegex,
			isWildcard,
		};
	}

	/**
	 * Register a route with specific HTTP method
	 */
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

		const middleware = [...this.groupMiddleware, ...routeMiddleware];

		// Parse pattern into segments
		const segments = this.parsePattern(fullPattern);

		// Insert into tree
		const node = this.insertSegments(this.root, segments, 0);

		// Store handler
		node.handlers.set(method, {
			handler,
			middleware,
			name: options?.name,
		});

		this.routeCount++;
	}

	/**
	 * Parse a pattern into segments
	 *
	 * Examples:
	 * - "/users/:id" -> [{ type: 'static', value: 'users' }, { type: 'param', name: 'id' }]
	 * - "/files/*" -> [{ type: 'static', value: 'files' }, { type: 'wildcard' }]
	 */
	private parsePattern(pattern: string): Array<{
		type: "static" | "param" | "wildcard";
		value?: string;
		name?: string;
		regex?: RegExp;
		optional?: boolean;
	}> {
		const segments: Array<{
			type: "static" | "param" | "wildcard";
			value?: string;
			name?: string;
			regex?: RegExp;
			optional?: boolean;
		}> = [];

		// Normalize pattern
		let normalized = pattern;
		if (!normalized.startsWith("/")) {
			normalized = `/${normalized}`;
		}

		// Remove trailing slash (except for root)
		if (normalized.length > 1 && normalized.endsWith("/")) {
			normalized = normalized.slice(0, -1);
		}

		if (normalized === "/") {
			return [{ type: "static", value: "" }];
		}

		const parts = normalized.split("/").filter(Boolean);

		for (const part of parts) {
			if (part === "*") {
				segments.push({ type: "wildcard" });
			} else if (part.startsWith(":")) {
				let name = part.slice(1);
				let regex: RegExp | undefined;
				let optional = false;

				// Check for optional marker
				if (name.endsWith("?")) {
					optional = true;
					name = name.slice(0, -1);
				}

				// Check for custom regex
				const regexMatch = name.match(/^(\w+)<(.+)>$/);
				if (regexMatch) {
					name = regexMatch[1];
					regex = new RegExp(`^(${regexMatch[2]})$`);
				}

				segments.push({ type: "param", name, regex, optional });
			} else {
				segments.push({ type: "static", value: part.toLowerCase() });
			}
		}

		return segments;
	}

	/**
	 * Insert segments into the tree, creating nodes as needed
	 */
	private insertSegments(
		node: TreeNode,
		segments: Array<{
			type: "static" | "param" | "wildcard";
			value?: string;
			name?: string;
			regex?: RegExp;
			optional?: boolean;
		}>,
		index: number,
	): TreeNode {
		if (index >= segments.length) {
			return node;
		}

		const segment = segments[index];

		if (segment.type === "wildcard") {
			// Create or get wildcard child
			if (!node.wildcardChild) {
				node.wildcardChild = this.createNode("*", "*", undefined, true);
			}
			return node.wildcardChild;
		}

		if (segment.type === "param") {
			// Create or get parameter child
			if (!node.paramChild) {
				node.paramChild = this.createNode(
					`:${segment.name}`,
					segment.name,
					segment.regex,
				);
			}

			// Continue with next segment
			return this.insertSegments(node.paramChild, segments, index + 1);
		}

		// Static segment
		const value = segment.value!;

		// Look for existing child with common prefix
		let child = node.children.get(value);

		if (!child) {
			// Create new child
			child = this.createNode(value);
			node.children.set(value, child);
		}

		// Continue with next segment
		return this.insertSegments(child, segments, index + 1);
	}

	/**
	 * Match a route by method and pathname
	 *
	 * Performance: O(log n) average case for tree traversal
	 */
	match(method: HTTPMethod | "ALL", pathname: string): RouteMatch | undefined {
		const params: PathParams = {};

		// Normalize pathname
		let normalized = pathname.toLowerCase();
		if (normalized.length > 1 && normalized.endsWith("/")) {
			normalized = normalized.slice(0, -1);
		}

		// Split into parts
		const parts =
			normalized === "/" ? [""] : normalized.split("/").filter(Boolean);

		// Search tree
		const result = this.searchTree(this.root, parts, 0, method, params);

		return result;
	}

	/**
	 * Search the tree for a matching route
	 */
	private searchTree(
		node: TreeNode,
		parts: string[],
		partIndex: number,
		method: HTTPMethod | "ALL",
		params: PathParams,
	): RouteMatch | undefined {
		// Check if we've consumed all parts
		if (partIndex >= parts.length) {
			// Check for handler
			const handlerEntry =
				node.handlers.get(method) || node.handlers.get("ALL");
			if (handlerEntry) {
				return {
					handler: handlerEntry.handler,
					params: { ...params },
					middleware: handlerEntry.middleware,
					name: handlerEntry.name,
				};
			}
			return undefined;
		}

		const part = parts[partIndex];

		// 1. Try exact match (static child) - highest priority
		const staticChild = node.children.get(part);
		if (staticChild) {
			const result = this.searchTree(
				staticChild,
				parts,
				partIndex + 1,
				method,
				params,
			);
			if (result) return result;
		}

		// 2. Try parameter child
		if (node.paramChild) {
			const paramNode = node.paramChild;

			// Check regex constraint
			if (paramNode.paramRegex) {
				if (paramNode.paramRegex.test(part)) {
					params[paramNode.paramName!] = part;
					const result = this.searchTree(
						paramNode,
						parts,
						partIndex + 1,
						method,
						params,
					);
					if (result) return result;
					delete params[paramNode.paramName!];
				}
			} else {
				params[paramNode.paramName!] = part;
				const result = this.searchTree(
					paramNode,
					parts,
					partIndex + 1,
					method,
					params,
				);
				if (result) return result;
				delete params[paramNode.paramName!];
			}
		}

		// 3. Try wildcard child - lowest priority
		if (node.wildcardChild) {
			const wildcardNode = node.wildcardChild;
			// Capture remaining path
			params["*"] = parts.slice(partIndex).join("/");

			const handlerEntry =
				wildcardNode.handlers.get(method) || wildcardNode.handlers.get("ALL");
			if (handlerEntry) {
				return {
					handler: handlerEntry.handler,
					params: { ...params },
					middleware: handlerEntry.middleware,
					name: handlerEntry.name,
				};
			}
		}

		return undefined;
	}

	/**
	 * Create a route group with prefix and optional middleware
	 */
	group(
		prefix: string,
		options?: { middleware?: MiddlewareHandler | MiddlewareHandler[] },
	): TreeRouter {
		const childRouter = new TreeRouter();

		// Share root node
		childRouter.root = this.root;
		childRouter.groupPrefix = this.groupPrefix + prefix;

		const optsMiddleware = options?.middleware;
		const middlewareArray: MiddlewareHandler[] = optsMiddleware
			? Array.isArray(optsMiddleware)
				? optsMiddleware
				: [optsMiddleware]
			: [];

		childRouter.groupMiddleware = [...this.groupMiddleware, ...middlewareArray];
		childRouter.routeCount = this.routeCount;

		return childRouter;
	}

	/**
	 * Get all registered routes (traverses tree)
	 */
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

		this.traverseTree(this.root, "", routes);

		return routes;
	}

	/**
	 * Traverse tree to collect all routes
	 */
	private traverseTree(
		node: TreeNode,
		currentPath: string,
		routes: Array<{
			method: HTTPMethod | "ALL";
			pattern: string;
			name?: string;
		}>,
	): void {
		// Add handlers at this node
		for (const [method, entry] of node.handlers) {
			routes.push({
				method,
				pattern: currentPath || "/",
				name: entry.name,
			});
		}

		// Traverse static children
		for (const [path, child] of node.children) {
			const childPath = `${currentPath}/${path}`;
			this.traverseTree(child, childPath, routes);
		}

		// Traverse parameter child
		if (node.paramChild) {
			const childPath = `${currentPath}/:${node.paramChild.paramName}`;
			this.traverseTree(node.paramChild, childPath, routes);
		}

		// Traverse wildcard child
		if (node.wildcardChild) {
			const childPath = `${currentPath}/*`;
			this.traverseTree(node.wildcardChild, childPath, routes);
		}
	}

	/**
	 * Get router type for debugging
	 */
	getRouterType(): "tree" {
		return "tree";
	}

	/**
	 * Get route count
	 */
	getRouteCount(): number {
		return this.routeCount;
	}

	/**
	 * Get tree statistics
	 */
	getTreeStats(): { nodes: number; depth: number; routes: number } {
		return {
			nodes: this.countNodes(this.root),
			depth: this.getTreeDepth(this.root),
			routes: this.routeCount,
		};
	}

	private countNodes(node: TreeNode): number {
		let count = 1;

		for (const child of node.children.values()) {
			count += this.countNodes(child);
		}

		if (node.paramChild) {
			count += this.countNodes(node.paramChild);
		}

		if (node.wildcardChild) {
			count += this.countNodes(node.wildcardChild);
		}

		return count;
	}

	private getTreeDepth(node: TreeNode): number {
		let maxDepth = 0;

		for (const child of node.children.values()) {
			maxDepth = Math.max(maxDepth, this.getTreeDepth(child));
		}

		if (node.paramChild) {
			maxDepth = Math.max(maxDepth, this.getTreeDepth(node.paramChild));
		}

		if (node.wildcardChild) {
			maxDepth = Math.max(maxDepth, this.getTreeDepth(node.wildcardChild));
		}

		return maxDepth + 1;
	}

	// ============= HTTP Method Helpers =============

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
