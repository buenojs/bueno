/**
 * React SSR Renderer
 *
 * Provides server-side rendering for React components using:
 * - renderToPipeableStream / renderToReadableStream for streaming
 * - React Helmet for head management
 * - Suspense boundary support
 */

import type {
	SSRContext,
	SSRElement,
	SSRPage,
	FrameworkSSRRenderer,
	SSRHydrationData,
} from "../types.js";

// React types (dynamically imported)
interface ReactElement {
	type: unknown;
	props: Record<string, unknown>;
	key: string | null;
}

interface ReactComponent {
	(props: Record<string, unknown>): ReactElement | null;
}

// Head element storage (similar to React Helmet)
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
 * Create a title element for head
 */
export function title(text: string): SSRElement {
	return { tag: "title", attrs: {}, children: [{ tag: "#text", attrs: {}, innerHTML: text }] };
}

/**
 * Create a meta element for head
 */
export function meta(attrs: Record<string, string>): SSRElement {
	return { tag: "meta", attrs };
}

/**
 * Create a link element for head
 */
export function link(attrs: Record<string, string>): SSRElement {
	return { tag: "link", attrs };
}

/**
 * Create a script element for head
 */
export function script(attrs: Record<string, string>, innerHTML?: string): SSRElement {
	return { tag: "script", attrs, innerHTML };
}

/**
 * Create a style element for head
 */
export function style(innerHTML: string, attrs?: Record<string, string>): SSRElement {
	return { tag: "style", attrs: attrs || {}, innerHTML };
}

/**
 * React SSR Renderer implementation
 */
export class ReactSSRRenderer implements FrameworkSSRRenderer {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private react: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private reactDomServer: any = null;
	private initialized = false;

	/**
	 * Initialize React modules
	 */
	async init(): Promise<void> {
		if (this.initialized) return;

		try {
			this.react = await import("react");
			this.reactDomServer = await import("react-dom/server");
			this.initialized = true;
		} catch (error) {
			throw new Error(
				"React is not installed. Install it with: bun add react react-dom"
			);
		}
	}

	/**
	 * Render a component to HTML string
	 */
	async renderToString(component: unknown, context: SSRContext): Promise<string> {
		await this.init();

		if (!this.reactDomServer) {
			throw new Error("React DOM Server not initialized");
		}

		resetHead();

		try {
			// Use renderToString for non-streaming
			const renderToStringFn = (this.reactDomServer as unknown as { renderToString: (el: unknown) => string }).renderToString;
			const html = renderToStringFn(component as ReactElement);
			return html;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			throw new Error(`React renderToString failed: ${errorMessage}`);
		}
	}

	/**
	 * Render a component to a stream
	 */
	renderToStream(component: unknown, context: SSRContext): ReadableStream<Uint8Array> {
		// Create a promise-based initialization
		const encoder = new TextEncoder();

		return new ReadableStream<Uint8Array>({
			start: async (controller) => {
				try {
					await this.init();

					if (!this.reactDomServer) {
						controller.error(new Error("React DOM Server not initialized"));
						return;
					}

					resetHead();

					// Check if renderToReadableStream is available (modern API)
					if ("renderToReadableStream" in this.reactDomServer) {
						const stream = await this.reactDomServer.renderToReadableStream(
							component as ReactElement,
							{
								bootstrapScripts: [],
								onError: (error: Error) => {
									console.error("React streaming error:", error);
								},
							}
						);

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
						// Fallback to renderToString for older React versions
						const html = this.reactDomServer.renderToString(component as ReactElement);
						controller.enqueue(encoder.encode(html));
						controller.close();
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : "Unknown error";
					controller.error(new Error(`React renderToStream failed: ${errorMessage}`));
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
		// Return the page render function wrapped in React context
		return {
			page,
			context,
		};
	}

	/**
	 * Render with Suspense support
	 */
	async renderWithSuspense(
		component: unknown,
		context: SSRContext,
		fallback: string = "<div>Loading...</div>"
	): Promise<string> {
		await this.init();

		if (!this.react || !this.reactDomServer) {
			throw new Error("React not initialized");
		}

		resetHead();

		try {
			// Wrap with Suspense if available
			const suspenseWrapper = this.react.createElement(
				this.react.Suspense,
				{ fallback },
				component as ReactElement
			);

			const html = this.reactDomServer.renderToString(suspenseWrapper);
			return html;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			throw new Error(`React renderWithSuspense failed: ${errorMessage}`);
		}
	}

	/**
	 * Render to stream with all callbacks
	 */
	async renderToStreamWithCallbacks(
		component: unknown,
		context: SSRContext,
		options: {
			onAllReady?: () => void;
			onShellReady?: () => void;
			onShellError?: (error: Error) => void;
			onError?: (error: Error) => void;
		} = {}
	): Promise<ReadableStream<Uint8Array>> {
		await this.init();

		if (!this.reactDomServer) {
			throw new Error("React DOM Server not initialized");
		}

		resetHead();

		const encoder = new TextEncoder();

		return new ReadableStream<Uint8Array>({
			start: async (controller) => {
				try {
					if ("renderToReadableStream" in this.reactDomServer!) {
						const stream = await this.reactDomServer.renderToReadableStream(
							component as ReactElement,
							{
								bootstrapScripts: [],
								onError: (error: Error) => {
									options.onError?.(error);
									console.error("React streaming error:", error);
								},
							}
						);

						// Wait for shell to be ready
						await stream.allReady;
						options.onAllReady?.();

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
						// Fallback
						const html = this.reactDomServer!.renderToString(component as ReactElement);
						options.onAllReady?.();
						controller.enqueue(encoder.encode(html));
						controller.close();
					}
				} catch (error) {
					const err = error instanceof Error ? error : new Error("Unknown error");
					options.onShellError?.(err);
					controller.error(err);
				}
			},
		});
	}
}

/**
 * Create a React SSR renderer
 */
export function createReactSSRRenderer(): ReactSSRRenderer {
	return new ReactSSRRenderer();
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
 * React Helmet-like head management
 */
export class ReactHelmet {
	private static instance: ReactHelmet;
	private title = "";
	private metaTags: SSRElement[] = [];
	private linkTags: SSRElement[] = [];
	private scriptTags: SSRElement[] = [];
	private styleTags: SSRElement[] = [];

	static getInstance(): ReactHelmet {
		if (!ReactHelmet.instance) {
			ReactHelmet.instance = new ReactHelmet();
		}
		return ReactHelmet.instance;
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
 * Get React Helmet instance
 */
export function helmet(): ReactHelmet {
	return ReactHelmet.getInstance();
}