/**
 * Layout Nesting Implementation
 *
 * Provides Next.js-style layout nesting:
 * - _layout.tsx convention for nested layouts
 * - Layout inheritance down directory tree
 * - Layout state preservation on navigation
 * - Per-segment layouts
 */

import { createLogger, type Logger } from "../logger/index.js";
import type {
	LayoutDefinition,
	LayoutNode,
	LayoutTree,
	LayoutProps,
	LayoutRenderer,
	LayoutMiddleware,
	LayoutConfig,
	PartialLayoutConfig,
	LayoutRenderResult,
	LayoutSegment,
} from "./types.js";
import type { SSRContext, SSRElement, RenderResult } from "./types.js";

// ============= Constants =============

const LAYOUT_FILE = "_layout";
const SUPPORTED_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

// ============= Layout Manager Class =============

/**
 * Layout Manager handles nested layout resolution and rendering
 *
 * Features:
 * - _layout.tsx convention
 * - Layout inheritance down directory tree
 * - Layout state preservation
 * - Per-segment layouts
 */
export class LayoutManager {
	private config: LayoutConfig;
	private logger: Logger;
	private layouts: Map<string, LayoutDefinition> = new Map();
	private layoutTree: LayoutTree | null = null;

	constructor(config: PartialLayoutConfig = {}) {
		this.config = this.normalizeConfig(config);
		this.logger = createLogger({
			level: "debug",
			pretty: true,
			context: { component: "LayoutManager" },
		});
	}

	/**
	 * Normalize partial config to full config with defaults
	 */
	private normalizeConfig(config: PartialLayoutConfig): LayoutConfig {
		return {
			pagesDir: config.pagesDir ?? "pages",
			rootDir: config.rootDir ?? process.cwd(),
			extensions: config.extensions ?? SUPPORTED_EXTENSIONS,
			preserveState: config.preserveState ?? true,
		};
	}

	/**
	 * Initialize the layout manager by scanning for layout files
	 */
	async init(): Promise<void> {
		this.logger.info(`Initializing layout manager from: ${this.config.pagesDir}`);
		await this.scanLayoutFiles();
		this.buildLayoutTree();
		this.logger.info(`Loaded ${this.layouts.size} layouts`);
	}

	/**
	 * Scan for layout files in the pages directory
	 */
	private async scanLayoutFiles(): Promise<void> {
		const pagesPath = this.config.pagesDir;
		const glob = new Bun.Glob(`**/${LAYOUT_FILE}{${this.config.extensions.join(",")}}`);

		try {
			for await (const file of glob.scan(pagesPath)) {
				await this.processLayoutFile(file, pagesPath);
			}
		} catch (error) {
			this.logger.error(`Failed to scan layouts: ${pagesPath}`, error);
		}
	}

	/**
	 * Process a single layout file
	 */
	private async processLayoutFile(filePath: string, basePath: string): Promise<void> {
		const fullPath = `${basePath}/${filePath}`;
		const segment = this.getLayoutSegment(filePath);

		const layout: LayoutDefinition = {
			id: this.generateLayoutId(filePath),
			filePath: fullPath,
			segment,
			depth: this.calculateDepth(segment),
		};

		this.layouts.set(segment, layout);
		this.logger.debug(`Processed layout: ${segment}`);
	}

	/**
	 * Get layout segment from file path
	 */
	private getLayoutSegment(filePath: string): string {
		// Remove _layout.tsx from path
		const segment = filePath.replace(new RegExp(`/${LAYOUT_FILE}\\.(tsx?|jsx?)$`), "");
		return segment === "" ? "/" : `/${segment}`;
	}

	/**
	 * Calculate depth of layout segment
	 */
	private calculateDepth(segment: string): number {
		if (segment === "/") return 0;
		return segment.split("/").length - 1;
	}

	/**
	 * Generate unique layout ID
	 */
	private generateLayoutId(filePath: string): string {
		return filePath.replace(/[\/\\.]/g, "-").replace(/^-/, "");
	}

	/**
	 * Build the layout tree from collected layouts
	 */
	private buildLayoutTree(): void {
		// Find root layout
		const rootLayout = this.layouts.get("/");
		if (!rootLayout) {
			this.logger.warn("No root layout found");
			this.layoutTree = null;
			return;
		}

		// Build tree recursively
		this.layoutTree = this.buildTreeNode(rootLayout, null);
	}

	/**
	 * Build a layout tree node
	 */
	private buildTreeNode(layout: LayoutDefinition, parent: LayoutNode | null): LayoutNode {
		const node: LayoutNode = {
			layout,
			parent,
			children: [],
		};

		// Find child layouts
		for (const [segment, childLayout] of this.layouts) {
			if (segment === layout.segment) continue;

			// Check if this is a direct child
			if (this.isDirectChild(layout.segment, segment)) {
				node.children.push(this.buildTreeNode(childLayout, node));
			}
		}

		// Sort children by depth
		node.children.sort((a, b) => a.layout.depth - b.layout.depth);

		return node;
	}

	/**
	 * Check if a segment is a direct child of another
	 */
	private isDirectChild(parentSegment: string, childSegment: string): boolean {
		if (parentSegment === "/") {
			// Root layout: direct children have no other parent
			const parts = childSegment.split("/").filter(Boolean);
			return parts.length === 1;
		}

		// Check if child starts with parent and has exactly one more segment
		if (!childSegment.startsWith(parentSegment + "/")) return false;

		const remaining = childSegment.slice(parentSegment.length + 1);
		return !remaining.includes("/");
	}

	/**
	 * Get layout chain for a route
	 */
	getLayoutChain(routePath: string): LayoutDefinition[] {
		const chain: LayoutDefinition[] = [];

		// Start from root and work down
		const segments = this.getRouteSegments(routePath);

		for (let i = 0; i <= segments.length; i++) {
			const segment = i === 0 ? "/" : "/" + segments.slice(0, i).join("/");
			const layout = this.layouts.get(segment);

			if (layout) {
				chain.push(layout);
			}
		}

		return chain;
	}

	/**
	 * Get route segments from path
	 */
	private getRouteSegments(path: string): string[] {
		return path.split("/").filter(Boolean);
	}

	/**
	 * Load layout module
	 */
	private async loadLayoutModule(filePath: string): Promise<LayoutRenderer | null> {
		try {
			const module = await import(filePath);
			return module.default || module;
		} catch (error) {
			this.logger.error(`Failed to load layout module: ${filePath}`, error);
			return null;
		}
	}

	/**
	 * Render layouts with nested content
	 */
	async renderLayouts(
		routePath: string,
		content: string,
		context: SSRContext
	): Promise<LayoutRenderResult> {
		const chain = this.getLayoutChain(routePath);

		if (chain.length === 0) {
			return {
				html: content,
				head: [],
				body: [],
				layouts: [],
			};
		}

		let html = content;
		const head: SSRElement[] = [];
		const body: SSRElement[] = [];
		const renderedLayouts: string[] = [];

		// Render layouts from innermost to outermost
		for (let i = chain.length - 1; i >= 0; i--) {
			const layout = chain[i];
			const renderer = await this.loadLayoutModule(layout.filePath);

			if (renderer) {
				const props: LayoutProps = {
					children: html,
					params: context.params,
					query: context.query,
					pathname: context.pathname,
				};

				// Render layout
				const result = await renderer(props, context);

				if (typeof result === "string") {
					html = result;
				} else {
					html = result.html;
					if (result.head) head.push(...result.head);
					if (result.body) body.push(...result.body);
				}

				renderedLayouts.push(layout.segment);
			}
		}

		return {
			html,
			head,
			body,
			layouts: renderedLayouts,
		};
	}

	/**
	 * Get layout for a segment
	 */
	getLayout(segment: string): LayoutDefinition | undefined {
		return this.layouts.get(segment);
	}

	/**
	 * Get all layouts
	 */
	getAllLayouts(): LayoutDefinition[] {
		return Array.from(this.layouts.values());
	}

	/**
	 * Get layout tree
	 */
	getLayoutTree(): LayoutNode | null {
		return this.layoutTree;
	}

	/**
	 * Check if a route has a layout
	 */
	hasLayout(routePath: string): boolean {
		const segments = this.getRouteSegments(routePath);

		for (let i = 0; i <= segments.length; i++) {
			const segment = i === 0 ? "/" : "/" + segments.slice(0, i).join("/");
			if (this.layouts.has(segment)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Get layout depth for a route
	 */
	getLayoutDepth(routePath: string): number {
		return this.getLayoutChain(routePath).length;
	}

	/**
	 * Reload layouts (for hot reload)
	 */
	async reload(): Promise<void> {
		this.logger.info("Reloading layouts...");
		this.layouts.clear();
		this.layoutTree = null;
		await this.init();
	}

	/**
	 * Get configuration
	 */
	getConfig(): LayoutConfig {
		return { ...this.config };
	}
}

// ============= Factory Function =============

/**
 * Create a layout manager
 */
export function createLayoutManager(config: PartialLayoutConfig = {}): LayoutManager {
	return new LayoutManager(config);
}

// ============= Utility Functions =============

/**
 * Check if a file is a layout file
 */
export function isLayoutFile(filename: string): boolean {
	const baseName = filename.replace(/\.(tsx?|jsx?)$/, "");
	return baseName === LAYOUT_FILE;
}

/**
 * Get layout segment from file path
 */
export function getLayoutSegmentFromPath(filePath: string): string {
	const parts = filePath.split("/");
	const dirParts = parts.slice(0, -1); // Remove filename

	if (dirParts.length === 0) {
		return "/";
	}

	return "/" + dirParts.join("/");
}

/**
 * Build layout props for a page
 */
export function buildLayoutProps(
	children: string,
	context: SSRContext
): LayoutProps {
	return {
		children,
		params: context.params,
		query: context.query,
		pathname: context.pathname,
	};
}

/**
 * Create a layout segment
 */
export function createLayoutSegment(
	path: string,
	params: Record<string, string> = {}
): LayoutSegment {
	return {
		path,
		params,
		component: null,
	};
}

/**
 * Merge layout head elements
 */
export function mergeLayoutHead(
	...heads: SSRElement[][]
): SSRElement[] {
	const merged: SSRElement[] = [];
	const seen = new Set<string>();

	for (const head of heads) {
		for (const element of head) {
			const key = getHeadElementKey(element);
			if (!seen.has(key)) {
				seen.add(key);
				merged.push(element);
			}
		}
	}

	return merged;
}

/**
 * Get unique key for head element
 */
function getHeadElementKey(element: SSRElement): string {
	switch (element.tag) {
		case "title":
			return "title";
		case "meta":
			return `meta-${element.attrs.name || element.attrs.property || ""}`;
		case "link":
			return `link-${element.attrs.rel}-${element.attrs.href}`;
		case "script":
			return `script-${element.attrs.src || ""}`;
		case "style":
			return `style-${element.attrs.id || ""}`;
		default:
			return `${element.tag}-${JSON.stringify(element.attrs)}`;
	}
}

/**
 * Render layout tree to string (for debugging)
 */
export function layoutTreeToString(node: LayoutNode, indent = 0): string {
	const prefix = "  ".repeat(indent);
	let result = `${prefix}${node.layout.segment}\n`;

	for (const child of node.children) {
		result += layoutTreeToString(child, indent + 1);
	}

	return result;
}