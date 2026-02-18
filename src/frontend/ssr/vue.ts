/**
 * Vue SSR Renderer
 *
 * Provides server-side rendering for Vue components using:
 * - renderToString / renderToStream from vue/server-renderer
 * - Vue Router integration
 * - Vue Meta for head management
 */

import type {
	SSRContext,
	SSRElement,
	SSRPage,
	FrameworkSSRRenderer,
} from "../types.js";

// Vue types (dynamically imported)
interface VueApp {
	component(name: string, component: unknown): VueApp;
	use(plugin: unknown, ...options: unknown[]): VueApp;
	provide(key: string | symbol, value: unknown): VueApp;
	config: {
		globalProperties: Record<string, unknown>;
		errorHandler: ((err: unknown, instance: unknown, info: string) => void) | null;
	};
	mount(selector: string): unknown;
	unmount(): void;
	ssrContext: SSRContext | null;
}

interface VueRouter {
	push(location: string): Promise<unknown>;
	replace(location: string): Promise<unknown>;
	currentRoute: {
		value: {
			path: string;
			params: Record<string, string>;
			query: Record<string, string>;
			meta: Record<string, unknown>;
		};
	};
	isReady(): Promise<void>;
}

interface CreateSSRAppOptions {
	/**
	 * Component to render
	 */
	component: unknown;

	/**
	 * Props to pass to component
	 */
	props?: Record<string, unknown>;

	/**
	 * Initial state for hydration
	 */
	state?: Record<string, unknown>;
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
 * Vue SSR Renderer implementation
 */
export class VueSSRRenderer implements FrameworkSSRRenderer {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private vue: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private vueServerRenderer: any = null;
	private initialized = false;

	/**
	 * Initialize Vue modules
	 */
	async init(): Promise<void> {
		if (this.initialized) return;

		try {
			this.vue = await import("vue");
			this.vueServerRenderer = await import("vue/server-renderer");
			this.initialized = true;
		} catch (error) {
			throw new Error(
				"Vue is not installed. Install it with: bun add vue"
			);
		}
	}

	/**
	 * Create a Vue SSR app instance
	 */
	async createSSRApp(options: CreateSSRAppOptions): Promise<VueApp> {
		await this.init();

		if (!this.vue) {
			throw new Error("Vue not initialized");
		}

		const { createSSRApp } = this.vue;
		const app = createSSRApp(options.component, options.props || {});

		// Provide initial state for hydration
		if (options.state) {
			app.provide("__INITIAL_STATE__", options.state);
		}

		return app as VueApp;
	}

	/**
	 * Render a component to HTML string
	 */
	async renderToString(component: unknown, context: SSRContext): Promise<string> {
		await this.init();

		if (!this.vueServerRenderer) {
			throw new Error("Vue Server Renderer not initialized");
		}

		resetHead();

		try {
			// If component is already a Vue app, render it directly
			if (this.isVueApp(component)) {
				component.ssrContext = context;
				const html = await this.vueServerRenderer.renderToString(component);
				return html;
			}

			// Otherwise create an app and render
			const app = await this.createSSRApp({
				component,
				props: { context },
			});
			app.ssrContext = context;

			const html = await this.vueServerRenderer.renderToString(app);
			return html;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			throw new Error(`Vue renderToString failed: ${errorMessage}`);
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

					if (!this.vueServerRenderer) {
						controller.error(new Error("Vue Server Renderer not initialized"));
						return;
					}

					resetHead();

					// Set SSR context
					if (this.isVueApp(component)) {
						component.ssrContext = context;
					}

					// Use renderToNodeStream equivalent via Web Streams
					const { renderToWebStream } = this.vueServerRenderer;

					if (renderToWebStream) {
						const stream = renderToWebStream(component);

						const reader = stream.getReader();

						while (true) {
							const { done, value } = await reader.read();
							if (done) {
								controller.close();
								break;
							}
							controller.enqueue(value);
						}
					} else {
						// Fallback to renderToString
						const html = await this.vueServerRenderer.renderToString(component);
						controller.enqueue(encoder.encode(html));
						controller.close();
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : "Unknown error";
					controller.error(new Error(`Vue renderToStream failed: ${errorMessage}`));
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
	 * Check if object is a Vue app instance
	 */
	private isVueApp(obj: unknown): obj is VueApp {
		return (
			typeof obj === "object" &&
			obj !== null &&
			"component" in obj &&
			"use" in obj &&
			"provide" in obj &&
			"config" in obj
		);
	}

	/**
	 * Create Vue Router for SSR
	 */
	async createRouter(routes: unknown[]): Promise<{
		router: VueRouter;
		app: VueApp;
	}> {
		await this.init();

		if (!this.vue) {
			throw new Error("Vue not initialized");
		}

		try {
			const vueRouter = await import("vue-router");
			const { createMemoryHistory, createRouter } = vueRouter;

			const router = createRouter({
				history: createMemoryHistory(),
				routes: routes as [],
			});

			const app = await this.createSSRApp({
				component: {},
			});

			app.use(router);

			return { router: router as unknown as VueRouter, app };
		} catch (error) {
			throw new Error(
				"Vue Router is not installed. Install it with: bun add vue-router"
			);
		}
	}

	/**
	 * Render with Vue Router
	 */
	async renderWithRouter(
		app: VueApp,
		router: VueRouter,
		url: string,
		context: SSRContext
	): Promise<string> {
		await this.init();

		if (!this.vueServerRenderer) {
			throw new Error("Vue Server Renderer not initialized");
		}

		resetHead();

		try {
			// Push to router and wait for ready
			await router.push(url);
			await router.isReady();

			// Set SSR context
			app.ssrContext = context;

			// Render
			const html = await this.vueServerRenderer.renderToString(app);
			return html;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			throw new Error(`Vue renderWithRouter failed: ${errorMessage}`);
		}
	}
}

/**
 * Create a Vue SSR renderer
 */
export function createVueSSRRenderer(): VueSSRRenderer {
	return new VueSSRRenderer();
}

/**
 * Vue Meta-like head management
 */
export class VueMeta {
	private static instance: VueMeta;
	private title = "";
	private metaTags: SSRElement[] = [];
	private linkTags: SSRElement[] = [];
	private scriptTags: SSRElement[] = [];
	private styleTags: SSRElement[] = [];

	static getInstance(): VueMeta {
		if (!VueMeta.instance) {
			VueMeta.instance = new VueMeta();
		}
		return VueMeta.instance;
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
 * Get Vue Meta instance
 */
export function vueMeta(): VueMeta {
	return VueMeta.getInstance();
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
 * Vue useHead composable-like function
 */
export function useHead(head: {
	title?: string;
	meta?: Record<string, string>[];
	link?: Record<string, string>[];
	script?: Record<string, string>[];
	style?: { innerHTML: string; attrs?: Record<string, string> }[];
}): void {
	const meta = vueMeta();

	if (head.title) {
		meta.setTitle(head.title);
	}

	head.meta?.forEach((attrs) => meta.addMeta(attrs));
	head.link?.forEach((attrs) => meta.addLink(attrs));
	head.script?.forEach((attrs) => meta.addScript(attrs));
	head.style?.forEach(({ innerHTML, attrs }) => meta.addStyle(innerHTML, attrs));
}

/**
 * Create Vue SSR context with initial state
 */
export function createVueSSRContext(
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