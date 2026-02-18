/**
 * Solid SSR Renderer
 *
 * Provides server-side rendering for Solid components using:
 * - renderToString / renderToStringAsync from solid-js/web
 * - Solid Meta for head management
 * - Async rendering support
 */

import type {
	SSRContext,
	SSRElement,
	SSRPage,
	FrameworkSSRRenderer,
} from "../types.js";

// Solid types (dynamically imported)
interface SolidElement {
	type: unknown;
	props: Record<string, unknown>;
}

interface SolidComponent {
	(props: Record<string, unknown>): SolidElement | null;
}

interface SolidRenderResult {
	html: string;
}

// Head element storage
let headElements: SSRElement[] = [];

/**
 * Reset head elements for a new render
 */
export function resetHead(): void {
	headElements = [];
}

/**
 * Get collected head elements
 */
export function getHeadElements(): SSRElement[] {
	return [...headElements];
}

/**
 * Add a head element
 */
export function addHeadElement(element: SSRElement): void {
	headElements.push(element);
}

/**
 * Solid SSR Renderer implementation
 */
export class SolidSSRRenderer implements FrameworkSSRRenderer {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private solidJs: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private solidWeb: any = null;
	private initialized = false;

	/**
	 * Initialize Solid modules
	 */
	async init(): Promise<void> {
		if (this.initialized) return;

		try {
			this.solidJs = await import("solid-js");
			this.solidWeb = await import("solid-js/web");
			this.initialized = true;
		} catch (error) {
			throw new Error(
				"Solid is not installed. Install it with: bun add solid-js"
			);
		}
	}

	/**
	 * Render a component to HTML string
	 */
	async renderToString(component: unknown, context: SSRContext): Promise<string> {
		await this.init();

		if (!this.solidWeb) {
			throw new Error("Solid Web not initialized");
		}

		resetHead();

		try {
			const { renderToString } = this.solidWeb;

			// Create a wrapper that provides context
			const wrappedComponent = this.wrapWithContext(component, context);

			// Use synchronous renderToString
			const html = renderToString(() => wrappedComponent);
			return html;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			throw new Error(`Solid renderToString failed: ${errorMessage}`);
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

					if (!this.solidWeb) {
						controller.error(new Error("Solid Web not initialized"));
						return;
					}

					resetHead();

					const { renderToStringAsync, renderToStream } = this.solidWeb;

					// Create a wrapper that provides context
					const wrappedComponent = this.wrapWithContext(component, context);

					// Check if renderToStream is available
					if (renderToStream) {
						const stream = renderToStream(() => wrappedComponent);
						const reader = stream.getReader();

						while (true) {
							const { done, value } = await reader.read();
							if (done) {
								controller.close();
								break;
							}
							controller.enqueue(value);
						}
					} else if (renderToStringAsync) {
						// Fallback to async render
						const html = await renderToStringAsync(() => wrappedComponent);
						controller.enqueue(encoder.encode(html));
						controller.close();
					} else {
						// Final fallback to sync render
						const html = this.solidWeb.renderToString(() => wrappedComponent);
						controller.enqueue(encoder.encode(html));
						controller.close();
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : "Unknown error";
					controller.error(new Error(`Solid renderToStream failed: ${errorMessage}`));
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
	 * Wrap component with context provider
	 */
	private wrapWithContext(component: unknown, context: SSRContext): () => unknown {
		return () => {
			// In a real implementation, this would use Solid's context API
			// to provide the SSR context to child components
			if (typeof component === "function") {
				return (component as SolidComponent)({ context, ...context.data });
			}
			return component;
		};
	}

	/**
	 * Render with async support
	 */
	async renderAsync(component: unknown, context: SSRContext): Promise<string> {
		await this.init();

		if (!this.solidWeb) {
			throw new Error("Solid Web not initialized");
		}

		resetHead();

		try {
			const { renderToStringAsync } = this.solidWeb;

			if (!renderToStringAsync) {
				// Fallback to sync render
				return this.renderToString(component, context);
			}

			const wrappedComponent = this.wrapWithContext(component, context);
			const html = await renderToStringAsync(() => wrappedComponent);
			return html;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			throw new Error(`Solid renderAsync failed: ${errorMessage}`);
		}
	}

	/**
	 * Render with suspense support
	 */
	async renderWithSuspense(
		component: unknown,
		context: SSRContext,
		fallback: string = "<div>Loading...</div>"
	): Promise<string> {
		await this.init();

		if (!this.solidJs || !this.solidWeb) {
			throw new Error("Solid not initialized");
		}

		resetHead();

		try {
			const { Suspense } = this.solidJs;
			const { renderToStringAsync } = this.solidWeb;

			if (!renderToStringAsync) {
				return this.renderToString(component, context);
			}

			// Wrap with Suspense
			const wrappedComponent = () => {
				return Suspense({
					fallback,
					get children() {
						return this.wrapWithContext(component, context)();
					},
				});
			};

			const html = await renderToStringAsync(wrappedComponent);
			return html;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			throw new Error(`Solid renderWithSuspense failed: ${errorMessage}`);
		}
	}
}

/**
 * Create a Solid SSR renderer
 */
export function createSolidSSRRenderer(): SolidSSRRenderer {
	return new SolidSSRRenderer();
}

/**
 * Solid Meta-like head management
 */
export class SolidMeta {
	private static instance: SolidMeta;
	private title = "";
	private metaTags: SSRElement[] = [];
	private linkTags: SSRElement[] = [];
	private scriptTags: SSRElement[] = [];
	private styleTags: SSRElement[] = [];

	static getInstance(): SolidMeta {
		if (!SolidMeta.instance) {
			SolidMeta.instance = new SolidMeta();
		}
		return SolidMeta.instance;
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
 * Get Solid Meta instance
 */
export function solidMeta(): SolidMeta {
	return SolidMeta.getInstance();
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
 * Create Solid SSR context
 */
export function createSolidSSRContext(
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
 * Solid Start-like route data helper
 */
export function createRouteData<T>(
	fetcher: () => Promise<T>,
	options: {
		key?: () => unknown[];
		deferStream?: boolean;
	} = {}
): {
	data: T | undefined;
	loading: boolean;
	error: Error | null;
} {
	let data: T | undefined;
	let loading = true;
	let error: Error | null = null;

	// Start fetching
	fetcher()
		.then((result) => {
			data = result;
			loading = false;
		})
		.catch((err) => {
			error = err instanceof Error ? err : new Error(String(err));
			loading = false;
		});

	return { data, loading, error };
}

/**
 * Solid resource wrapper for SSR
 */
export class SolidResource<T> {
	private data: T | undefined;
	private error: Error | null = null;
	private loading = true;
	private promise: Promise<T> | null = null;

	constructor(fetcher: () => Promise<T>) {
		this.promise = fetcher();
	}

	async load(): Promise<T> {
		if (this.data !== undefined) return this.data;
		if (this.error) throw this.error;

		try {
			this.data = (await this.promise) as T;
			this.loading = false;
			return this.data;
		} catch (err) {
			this.error = err instanceof Error ? err : new Error(String(err));
			this.loading = false;
			throw this.error;
		}
	}

	get(): T | undefined {
		return this.data;
	}

	getState(): { data: T | undefined; loading: boolean; error: Error | null } {
		return {
			data: this.data,
			loading: this.loading,
			error: this.error,
		};
	}
}

/**
 * Create a Solid resource
 */
export function createSolidResource<T>(fetcher: () => Promise<T>): SolidResource<T> {
	return new SolidResource(fetcher);
}

/**
 * No hydration marker for solid
 */
export const NO_HYDRATE = "data-no-hydrate";

/**
 * Mark element as no-hydrate
 */
export function noHydrate(element: SSRElement): SSRElement {
	return {
		...element,
		attrs: {
			...element.attrs,
			[NO_HYDRATE]: "",
		},
	};
}