/**
 * Svelte SSR Renderer
 *
 * Provides server-side rendering for Svelte components using:
 * - render() from svelte/server
 * - Svelte Head component support
 * - SvelteKit-like SSR patterns
 */

import type {
	SSRContext,
	SSRElement,
	SSRPage,
	FrameworkSSRRenderer,
} from "../types.js";

// Svelte types (dynamically imported)
interface SvelteComponent {
	render(props?: Record<string, unknown>): SvelteRenderResult;
	$$render(result: string, props: Record<string, unknown>, bindings: unknown, context: unknown): string;
}

interface SvelteRenderResult {
	html: string;
	head: string;
	css: {
		code: string;
		map: unknown;
	};
}

interface SvelteComponentConstructor {
	new (options: {
		target: object | null;
		props?: Record<string, unknown>;
		hydrate?: boolean;
		intro?: boolean;
		$inline?: boolean;
	}): SvelteComponent;

	render(props?: Record<string, unknown>): SvelteRenderResult;
}

// Head element storage
let headElements: SSRElement[] = [];
let headString = "";

/**
 * Reset head elements for a new render
 */
export function resetHead(): void {
	headElements = [];
	headString = "";
}

/**
 * Get collected head elements
 */
export function getHeadElements(): SSRElement[] {
	return [...headElements];
}

/**
 * Get head string from Svelte render
 */
export function getHeadString(): string {
	return headString;
}

/**
 * Set head string from Svelte render
 */
export function setHeadString(head: string): void {
	headString = head;
}

/**
 * Add a head element
 */
export function addHeadElement(element: SSRElement): void {
	headElements.push(element);
}

/**
 * Svelte SSR Renderer implementation
 */
export class SvelteSSRRenderer implements FrameworkSSRRenderer {
	private svelteServer: typeof import("svelte/server") | null = null;
	private initialized = false;

	/**
	 * Initialize Svelte server module
	 */
	async init(): Promise<void> {
		if (this.initialized) return;

		try {
			this.svelteServer = await import("svelte/server");
			this.initialized = true;
		} catch (error) {
			throw new Error(
				"Svelte is not installed. Install it with: bun add svelte"
			);
		}
	}

	/**
	 * Render a component to HTML string
	 */
	async renderToString(component: unknown, context: SSRContext): Promise<string> {
		await this.init();

		resetHead();

		try {
			// Check if component has render method (Svelte SSR component)
			if (this.isSvelteComponent(component)) {
				const result = component.render({
					context,
					...context.data,
				});

				// Store head content from Svelte <svelte:head>
				if (result.head) {
					setHeadString(result.head);
					this.parseHeadElements(result.head);
				}

				return result.html;
			}

			// If it's a constructor, call static render
			if (typeof component === "function" && "render" in component) {
				const result = (component as SvelteComponentConstructor).render({
					context,
					...context.data,
				});

				if (result.head) {
					setHeadString(result.head);
					this.parseHeadElements(result.head);
				}

				return result.html;
			}

			throw new Error("Invalid Svelte component");
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			throw new Error(`Svelte renderToString failed: ${errorMessage}`);
		}
	}

	/**
	 * Render a component to a stream
	 */
	renderToStream(component: unknown, context: SSRContext): ReadableStream<Uint8Array> {
		const encoder = new TextEncoder();

		return new ReadableStream<Uint8Array>({
			start: async (controller) => {
				try {
					await this.init();

					resetHead();

					// Svelte doesn't have native streaming, so we render to string
					// and then stream it
					const html = await this.renderToString(component, context);

					// Simulate streaming by chunking the output
					const chunkSize = 8192; // 8KB chunks
					for (let i = 0; i < html.length; i += chunkSize) {
						const chunk = html.slice(i, i + chunkSize);
						controller.enqueue(encoder.encode(chunk));
					}

					controller.close();
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : "Unknown error";
					controller.error(new Error(`Svelte renderToStream failed: ${errorMessage}`));
				}
			},
		});
	}

	/**
	 * Get head elements from component
	 */
	getHeadElements(context: SSRContext): SSRElement[] {
		return getHeadElements();
	}

	/**
	 * Create the framework-specific component
	 */
	createComponent(page: SSRPage, context: SSRContext): unknown {
		return {
			page,
			context,
		};
	}

	/**
	 * Check if object is a Svelte component
	 */
	private isSvelteComponent(obj: unknown): obj is SvelteComponent {
		return (
			typeof obj === "object" &&
			obj !== null &&
			"render" in obj &&
			typeof (obj as SvelteComponent).render === "function"
		);
	}

	/**
	 * Parse head HTML string into SSRElement array
	 */
	private parseHeadElements(headHtml: string): void {
		// Simple regex-based parsing for common head elements
		const titleMatch = headHtml.match(/<title>([^<]*)<\/title>/);
		if (titleMatch) {
			addHeadElement({
				tag: "title",
				attrs: {},
				children: [{ tag: "#text", attrs: {}, innerHTML: titleMatch[1] }],
			});
		}

		// Parse meta tags
		const metaRegex = /<meta\s+([^>]*)\/?>/g;
		let metaMatch;
		while ((metaMatch = metaRegex.exec(headHtml)) !== null) {
			const attrs = this.parseAttributes(metaMatch[1]);
			addHeadElement({ tag: "meta", attrs });
		}

		// Parse link tags
		const linkRegex = /<link\s+([^>]*)\/?>/g;
		let linkMatch;
		while ((linkMatch = linkRegex.exec(headHtml)) !== null) {
			const attrs = this.parseAttributes(linkMatch[1]);
			addHeadElement({ tag: "link", attrs });
		}

		// Parse style tags
		const styleRegex = /<style([^>]*)>([^<]*)<\/style>/g;
		let styleMatch;
		while ((styleMatch = styleRegex.exec(headHtml)) !== null) {
			const attrs = this.parseAttributes(styleMatch[1]);
			addHeadElement({ tag: "style", attrs, innerHTML: styleMatch[2] });
		}
	}

	/**
	 * Parse HTML attributes string into object
	 */
	private parseAttributes(attrString: string): Record<string, string> {
		const attrs: Record<string, string> = {};
		const regex = /(\w+)=["']([^"']*)["']/g;
		let match;

		while ((match = regex.exec(attrString)) !== null) {
			attrs[match[1]] = match[2];
		}

		return attrs;
	}

	/**
	 * Render with CSS extraction
	 */
	async renderWithCSS(
		component: unknown,
		context: SSRContext
	): Promise<{
		html: string;
		head: string;
		css: string;
	}> {
		await this.init();

		resetHead();

		if (this.isSvelteComponent(component)) {
			const result = component.render({
				context,
				...context.data,
			});

			if (result.head) {
				setHeadString(result.head);
				this.parseHeadElements(result.head);
			}

			return {
				html: result.html,
				head: result.head,
				css: result.css.code,
			};
		}

		if (typeof component === "function" && "render" in component) {
			const result = (component as SvelteComponentConstructor).render({
				context,
				...context.data,
			});

			if (result.head) {
				setHeadString(result.head);
				this.parseHeadElements(result.head);
			}

			return {
				html: result.html,
				head: result.head,
				css: result.css.code,
			};
		}

		throw new Error("Invalid Svelte component");
	}
}

/**
 * Create a Svelte SSR renderer
 */
export function createSvelteSSRRenderer(): SvelteSSRRenderer {
	return new SvelteSSRRenderer();
}

/**
 * Svelte Head component helper
 */
export class SvelteHead {
	private static instance: SvelteHead;
	private title = "";
	private metaTags: SSRElement[] = [];
	private linkTags: SSRElement[] = [];
	private scriptTags: SSRElement[] = [];
	private styleTags: SSRElement[] = [];

	static getInstance(): SvelteHead {
		if (!SvelteHead.instance) {
			SvelteHead.instance = new SvelteHead();
		}
		return SvelteHead.instance;
	}

	setTitle(title: string): this {
		this.title = title;
		addHeadElement({ tag: "title", attrs: {}, children: [{ tag: "#text", attrs: {}, innerHTML: title }] });
		return this;
	}

	addMeta(attrs: Record<string, string>): this {
		this.metaTags.push({ tag: "meta", attrs });
		addHeadElement({ tag: "meta", attrs });
		return this;
	}

	addLink(attrs: Record<string, string>): this {
		this.linkTags.push({ tag: "link", attrs });
		addHeadElement({ tag: "link", attrs });
		return this;
	}

	addScript(attrs: Record<string, string>, innerHTML?: string): this {
		this.scriptTags.push({ tag: "script", attrs, innerHTML });
		addHeadElement({ tag: "script", attrs, innerHTML });
		return this;
	}

	addStyle(innerHTML: string, attrs?: Record<string, string>): this {
		this.styleTags.push({ tag: "style", attrs: attrs || {}, innerHTML });
		addHeadElement({ tag: "style", attrs: attrs || {}, innerHTML });
		return this;
	}

	reset(): void {
		this.title = "";
		this.metaTags = [];
		this.linkTags = [];
		this.scriptTags = [];
		this.styleTags = [];
		resetHead();
	}

	getTitle(): string {
		return this.title;
	}

	getMetaTags(): SSRElement[] {
		return [...this.metaTags];
	}

	getLinkTags(): SSRElement[] {
		return [...this.linkTags];
	}

	getScriptTags(): SSRElement[] {
		return [...this.scriptTags];
	}

	getStyleTags(): SSRElement[] {
		return [...this.styleTags];
	}
}

/**
 * Get Svelte Head instance
 */
export function svelteHead(): SvelteHead {
	return SvelteHead.getInstance();
}

/**
 * Convert SSRElement to HTML string
 */
export function ssrElementToString(element: SSRElement): string {
	if (element.tag === "#text") {
		return escapeHtml(element.innerHTML || "");
	}

	const attrs = Object.entries(element.attrs)
		.map(([key, value]) => `${key}="${escapeHtml(value)}"`)
		.join(" ");

	const openTag = attrs ? `<${element.tag} ${attrs}>` : `<${element.tag}>`;

	if (element.innerHTML) {
		return `${openTag}${element.innerHTML}</${element.tag}>`;
	}

	if (element.children && element.children.length > 0) {
		const children = element.children.map(ssrElementToString).join("");
		return `${openTag}${children}</${element.tag}>`;
	}

	// Self-closing tags
	const voidElements = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];
	if (voidElements.includes(element.tag)) {
		return attrs ? `<${element.tag} ${attrs}>` : `<${element.tag}>`;
	}

	return `${openTag}</${element.tag}>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "\x26amp;")
		.replace(/</g, "\x26lt;")
		.replace(/>/g, "\x26gt;")
		.replace(/"/g, "\x26quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Load a Svelte component from file path
 */
export async function loadSvelteComponent(
	filePath: string
): Promise<SvelteComponentConstructor> {
	try {
		// Dynamic import of the compiled Svelte component
		const module = await import(filePath);
		return module.default;
	} catch (error) {
		throw new Error(`Failed to load Svelte component: ${filePath}`);
	}
}

/**
 * Create Svelte SSR context
 */
export function createSvelteSSRContext(
	request: Request,
	initialState: Record<string, unknown> = {}
): SSRContext {
	const url = new URL(request.url);

	return {
		url: request.url,
		request,
		headers: new Headers(),
		status: 200,
		head: [],
		body: [],
		data: initialState,
		modules: new Set(),
		pathname: url.pathname,
		query: url.searchParams,
		params: {},
	};
}

/**
 * SvelteKit-like page store for SSR
 */
export class SveltePageStore {
	private static instance: SveltePageStore;
	private state: {
		url: URL;
		params: Record<string, string>;
		route: { id: string };
		status: number;
		error: Error | null;
		data: Record<string, unknown>;
	} | null = null;

	static getInstance(): SveltePageStore {
		if (!SveltePageStore.instance) {
			SveltePageStore.instance = new SveltePageStore();
		}
		return SveltePageStore.instance;
	}

	set(context: SSRContext): void {
		this.state = {
			url: new URL(context.url),
			params: context.params,
			route: { id: context.pathname },
			status: context.status,
			error: null,
			data: context.data,
		};
	}

	get(): typeof this.state {
		return this.state;
	}

	reset(): void {
		this.state = null;
	}
}

/**
 * Get Svelte page store
 */
export function getPageStore(): SveltePageStore {
	return SveltePageStore.getInstance();
}