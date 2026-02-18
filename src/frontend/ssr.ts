/**
 * Server-Side Rendering (SSR) Implementation
 *
 * Provides a unified SSR system that supports:
 * - React, Vue, Svelte, and Solid frameworks
 * - Streaming SSR for faster TTFB
 * - Client-side hydration
 * - Server-side data fetching
 * - Head management (title, meta, links)
 */

import { createLogger, type Logger } from "../logger/index.js";
import type {
	SSRConfig,
	PartialSSRConfig,
	SSRContext,
	SSRElement,
	SSRPage,
	RenderResult,
	SSRHydrationData,
	SSRRenderOptions,
	BuildManifest,
	FrontendFramework,
	FrameworkSSRRenderer,
	PreloadLink,
} from "./types.js";
import { createReactSSRRenderer, type ReactSSRRenderer } from "./ssr/react.js";
import { createVueSSRRenderer, type VueSSRRenderer } from "./ssr/vue.js";
import { createSvelteSSRRenderer, type SvelteSSRRenderer } from "./ssr/svelte.js";
import { createSolidSSRRenderer, type SolidSSRRenderer } from "./ssr/solid.js";

// ============= Constants =============

const DEFAULT_MAX_TIMEOUT = 5000;
const DEFAULT_STREAMING = true;
const DEFAULT_BUFFER_INITIAL_STREAM = true;

// ============= SSR Renderer Class =============

/**
 * Main SSR Renderer class
 * 
 * Provides server-side rendering for all supported frameworks
 * with streaming support and client hydration.
 */
export class SSRRenderer {
	private config: SSRConfig;
	private logger: Logger;
	private frameworkRenderer: FrameworkSSRRenderer | null = null;
	private pageCache: Map<string, SSRPage> = new Map();

	constructor(config: PartialSSRConfig) {
		this.config = this.normalizeConfig(config);
		this.logger = createLogger({
			level: "debug",
			pretty: true,
			context: { component: "SSRRenderer" },
		});
	}

	/**
	 * Normalize partial config to full config with defaults
	 */
	private normalizeConfig(config: PartialSSRConfig): SSRConfig {
		return {
			entry: config.entry,
			clientEntry: config.clientEntry,
			clientManifest: config.clientManifest,
			streaming: config.streaming ?? DEFAULT_STREAMING,
			maxTimeout: config.maxTimeout ?? DEFAULT_MAX_TIMEOUT,
			bufferInitialStream: config.bufferInitialStream ?? DEFAULT_BUFFER_INITIAL_STREAM,
			framework: config.framework,
			rootDir: config.rootDir,
			template: config.template,
			templateFn: config.templateFn,
		};
	}

	/**
	 * Initialize the framework-specific renderer
	 */
	async init(): Promise<void> {
		this.frameworkRenderer = await this.createFrameworkRenderer(this.config.framework);
		this.logger.info(`SSR initialized for framework: ${this.config.framework}`);
	}

	/**
	 * Create framework-specific renderer
	 */
	private async createFrameworkRenderer(framework: FrontendFramework): Promise<FrameworkSSRRenderer> {
		switch (framework) {
			case "react":
				const reactRenderer = createReactSSRRenderer();
				await reactRenderer.init();
				return reactRenderer;
			case "vue":
				const vueRenderer = createVueSSRRenderer();
				await vueRenderer.init();
				return vueRenderer;
			case "svelte":
				const svelteRenderer = createSvelteSSRRenderer();
				await svelteRenderer.init();
				return svelteRenderer;
			case "solid":
				const solidRenderer = createSolidSSRRenderer();
				await solidRenderer.init();
				return solidRenderer;
			default:
				throw new Error(`Unsupported framework: ${framework}`);
		}
	}

	/**
	 * Render a page to HTML
	 */
	async render(url: string, request: Request): Promise<RenderResult> {
		if (!this.frameworkRenderer) {
			await this.init();
		}

		const context = this.createContext(url, request);
		const startTime = Date.now();

		try {
			// Load the page module
			const page = await this.loadPage(url);
			
			// Run server-side data fetching if available
			if (page.getServerSideProps) {
				this.logger.debug(`Fetching server-side props for: ${url}`);
				const props = await page.getServerSideProps(context);
				context.data = { ...context.data, ...props };
			}

			// Render the page
			const component = this.frameworkRenderer!.createComponent(page, context);
			const html = await this.frameworkRenderer!.renderToString(component, context);

			// Get head elements
			const headElements = this.frameworkRenderer!.getHeadElements(context);
			const head = this.renderHeadElements(headElements);

			// Collect loaded modules
			const modules = Array.from(context.modules);

			const duration = Date.now() - startTime;
			this.logger.debug(`Rendered ${url} in ${duration}ms`);

			return {
				html,
				head,
				body: "",
				data: context.data,
				modules,
				status: context.status,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			this.logger.error(`SSR render failed for ${url}:`, error);
			
			return {
				html: this.renderErrorPage(error),
				head: "<title>Error</title>",
				body: "",
				data: {},
				modules: [],
				status: 500,
			};
		}
	}

	/**
	 * Render a page to a stream
	 */
	renderToStream(url: string, request: Request): ReadableStream<Uint8Array> {
		const encoder = new TextEncoder();
		let context: SSRContext;
		let frameworkRenderer = this.frameworkRenderer;

		return new ReadableStream<Uint8Array>({
			start: async (controller) => {
				try {
					if (!frameworkRenderer) {
						await this.init();
						frameworkRenderer = this.frameworkRenderer;
					}

					context = this.createContext(url, request);

					// Load the page module
					const page = await this.loadPage(url);

					// Run server-side data fetching if available
					if (page.getServerSideProps) {
						const props = await page.getServerSideProps(context);
						context.data = { ...context.data, ...props };
					}

					// Send HTML preamble
					const preamble = this.renderPreamble(context);
					controller.enqueue(encoder.encode(preamble));

					// Create component and render to stream
					const component = frameworkRenderer!.createComponent(page, context);
					const htmlStream = frameworkRenderer!.renderToStream(component, context);

					const reader = htmlStream.getReader();
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						controller.enqueue(value);
					}

					// Send HTML footer with hydration data
					const footer = this.renderFooter(context);
					controller.enqueue(encoder.encode(footer));
					controller.close();
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : "Unknown error";
					this.logger.error(`SSR stream failed for ${url}:`, error);
					controller.enqueue(encoder.encode(this.renderErrorPage(error)));
					controller.close();
				}
			},
		});
	}

	/**
	 * Render with options
	 */
	async renderWithOptions(options: SSRRenderOptions): Promise<RenderResult> {
		const { url, request, params = {}, props = {}, skipStreaming = false } = options;

		if (!skipStreaming && this.config.streaming) {
			// For streaming, we need to buffer the result
			const stream = this.renderToStream(url, request);
			const reader = stream.getReader();
			const chunks: Uint8Array[] = [];

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}

			const html = new TextDecoder().decode(
				chunks.reduce((acc, chunk) => {
					const combined = new Uint8Array(acc.length + chunk.length);
					combined.set(acc);
					combined.set(chunk, acc.length);
					return combined;
				}, new Uint8Array())
			);

			return {
				html,
				head: "",
				body: "",
				data: props,
				modules: [],
				status: 200,
			};
		}

		return this.render(url, request);
	}

	/**
	 * Get client hydration script
	 */
	getHydrationScript(): string {
		const framework = this.config.framework;
		const clientEntry = this.config.clientEntry;

		// Framework-specific hydration code
		const hydrationScripts: Record<FrontendFramework, string> = {
			react: `
(function() {
  const data = JSON.parse(document.getElementById('__DATA__').textContent);
  window.__SSR_DATA__ = data;
  import('${clientEntry}').then(({ hydrate }) => {
    hydrate(document.getElementById('app'), data);
  });
})();`,
			vue: `
(function() {
  const data = JSON.parse(document.getElementById('__DATA__').textContent);
  window.__SSR_DATA__ = data;
  import('${clientEntry}').then(({ createApp }) => {
    createApp(data).mount('#app', true);
  });
})();`,
			svelte: `
(function() {
  const data = JSON.parse(document.getElementById('__DATA__').textContent);
  window.__SSR_DATA__ = data;
  import('${clientEntry}').then(({ mount }) => {
    mount(document.getElementById('app'), { props: data.props, hydrate: true });
  });
})();`,
			solid: `
(function() {
  const data = JSON.parse(document.getElementById('__DATA__').textContent);
  window.__SSR_DATA__ = data;
  import('${clientEntry}').then({ hydrate } => {
    hydrate(document.getElementById('app'));
  });
})();`,
		};

		return `<script type="module">${hydrationScripts[framework]}</script>`;
	}

	/**
	 * Get preload links for modules
	 */
	getPreloadLinks(modules: string[]): string {
		const manifest = this.config.clientManifest;
		const links: string[] = [];
		const seen = new Set<string>();

		for (const module of modules) {
			if (seen.has(module)) continue;
			seen.add(module);

			const fileInfo = manifest.files[module];
			if (!fileInfo) continue;

			if (fileInfo.type === "js") {
				links.push(`<link rel="modulepreload" href="/${module}">`);
			}

			// Also preload dependencies
			if (fileInfo.imports) {
				for (const dep of fileInfo.imports) {
					if (!seen.has(dep)) {
						links.push(`<link rel="modulepreload" href="/${dep}">`);
						seen.add(dep);
					}
				}
			}
		}

		return links.join("\n");
	}

	/**
	 * Get CSS links for modules
	 */
	getCSSLinks(modules: string[]): string {
		const manifest = this.config.clientManifest;
		const links: string[] = [];
		const seen = new Set<string>();

		// Get CSS for each entry point
		for (const [entry, cssFiles] of Object.entries(manifest.css)) {
			for (const cssFile of cssFiles) {
				if (!seen.has(cssFile)) {
					links.push(`<link rel="stylesheet" href="/${cssFile}">`);
					seen.add(cssFile);
				}
			}
		}

		// Also check module-specific CSS
		for (const module of modules) {
			const fileInfo = manifest.files[module];
			if (fileInfo?.type === "css" && !seen.has(module)) {
				links.push(`<link rel="stylesheet" href="/${module}">`);
				seen.add(module);
			}
		}

		return links.join("\n");
	}

	/**
	 * Create SSR context
	 */
	private createContext(url: string, request: Request): SSRContext {
		const parsedUrl = new URL(url, request.url);

		return {
			url: parsedUrl.href,
			request,
			headers: new Headers(),
			status: 200,
			head: [],
			body: [],
			data: {},
			modules: new Set(),
			pathname: parsedUrl.pathname,
			query: parsedUrl.searchParams,
			params: {},
		};
	}

	/**
	 * Load page module
	 */
	private async loadPage(url: string): Promise<SSRPage> {
		// Check cache first
		const cached = this.pageCache.get(url);
		if (cached) return cached;

		// Dynamic import of the server entry
		try {
			const entryPath = this.config.entry.startsWith("/")
				? this.config.entry
				: `${this.config.rootDir || "."}/${this.config.entry}`;

			const module = await import(entryPath);
			const page: SSRPage = module.default || module;

			// Cache for future requests
			this.pageCache.set(url, page);

			return page;
		} catch (error) {
			this.logger.error(`Failed to load page: ${url}`, error);
			throw new Error(`Page not found: ${url}`);
		}
	}

	/**
	 * Render head elements to string
	 */
	private renderHeadElements(elements: SSRElement[]): string {
		return elements.map(this.ssrElementToString).join("\n");
	}

	/**
	 * Convert SSR element to HTML string
	 */
	private ssrElementToString(element: SSRElement): string {
		if (element.tag === "#text") {
			return this.escapeHtml(element.innerHTML || "");
		}

		const attrs = Object.entries(element.attrs)
			.map(([key, value]) => `${key}="${this.escapeHtml(value)}"`)
			.join(" ");

		const openTag = attrs ? `<${element.tag} ${attrs}>` : `<${element.tag}>`;

		if (element.innerHTML) {
			return `${openTag}${element.innerHTML}</${element.tag}>`;
		}

		if (element.children && element.children.length > 0) {
			const children = element.children.map(this.ssrElementToString.bind(this)).join("");
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
	private escapeHtml(str: string): string {
		return str
			.replace(/&/g, "\x26amp;")
			.replace(/</g, "\x26lt;")
			.replace(/>/g, "\x26gt;")
			.replace(/"/g, "\x26quot;")
			.replace(/'/g, "&#39;");
	}

	/**
	 * Render HTML preamble (opening tags)
	 */
	private renderPreamble(context: SSRContext): string {
		const manifest = this.config.clientManifest;
		const preloadLinks = this.getPreloadLinks([]);
		const cssLinks = this.getCSSLinks([]);

		return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${preloadLinks}
  ${cssLinks}
</head>
<body>
  <div id="app">`;
	}

	/**
	 * Render HTML footer (closing tags and scripts)
	 */
	private renderFooter(context: SSRContext): string {
		const hydrationData: SSRHydrationData = {
			props: context.data,
			url: context.url,
			params: context.params,
			query: Object.fromEntries(context.query),
			framework: this.config.framework,
		};

		const dataScript = `<script type="application/json" id="__DATA__">${JSON.stringify(hydrationData)}</script>`;
		const hydrationScript = this.getHydrationScript();

		return `</div>
  ${dataScript}
  ${hydrationScript}
</body>
</html>`;
	}

	/**
	 * Render error page
	 */
	private renderErrorPage(error: unknown): string {
		const message = error instanceof Error ? error.message : "Unknown error";
		const stack = error instanceof Error && process.env.NODE_ENV !== "production" 
			? `<pre>${this.escapeHtml(error.stack || "")}</pre>` 
			: "";

		return `<!DOCTYPE html>
<html>
<head>
  <title>Error</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; }
    h1 { color: #dc2626; }
    pre { background: #f5f5f5; padding: 1rem; overflow: auto; }
  </style>
</head>
<body>
  <h1>Server Error</h1>
  <p>${this.escapeHtml(message)}</p>
  ${stack}
</body>
</html>`;
	}

	/**
	 * Clear page cache
	 */
	clearCache(): void {
		this.pageCache.clear();
		this.logger.debug("Page cache cleared");
	}

	/**
	 * Get configuration
	 */
	getConfig(): SSRConfig {
		return { ...this.config };
	}

	/**
	 * Check if streaming is enabled
	 */
	isStreamingEnabled(): boolean {
		return this.config.streaming;
	}

	/**
	 * Get framework
	 */
	getFramework(): FrontendFramework {
		return this.config.framework;
	}
}

// ============= Factory Function =============

/**
 * Create an SSR renderer
 */
export function createSSRRenderer(config: PartialSSRConfig): SSRRenderer {
	return new SSRRenderer(config);
}

// ============= Utility Functions =============

/**
 * Create SSR context from request
 */
export function createSSRContext(
	request: Request,
	params: Record<string, string> = {}
): SSRContext {
	const url = new URL(request.url);

	return {
		url: request.url,
		request,
		headers: new Headers(),
		status: 200,
		head: [],
		body: [],
		data: {},
		modules: new Set(),
		pathname: url.pathname,
		query: url.searchParams,
		params,
	};
}

/**
 * Serialize data for hydration
 */
export function serializeHydrationData(data: SSRHydrationData): string {
	return JSON.stringify(data);
}

/**
 * Deserialize hydration data
 */
export function deserializeHydrationData(json: string): SSRHydrationData {
	return JSON.parse(json);
}

/**
 * Generate HTML template
 */
export function generateHTML(options: {
	head: string;
	body: string;
	data: Record<string, unknown>;
	scripts: string[];
	styles: string[];
}): string {
	const { head, body, data, scripts, styles } = options;

	return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${styles.join("\n")}
  ${head}
</head>
<body>
  <div id="app">${body}</div>
  <script type="application/json" id="__DATA__">${JSON.stringify(data)}</script>
  ${scripts.join("\n")}
</body>
</html>`;
}

/**
 * Create preload link tag
 */
export function createPreloadLink(link: PreloadLink): string {
	const attrs = Object.entries(link.attrs || {})
		.map(([key, value]) => `${key}="${value}"`)
		.join(" ");

	if (link.as) {
		return `<link rel="${link.rel}" href="${link.href}" as="${link.as}" ${attrs}>`;
	}

	return `<link rel="${link.rel}" href="${link.href}" ${attrs}>`;
}

/**
 * Merge multiple head element arrays
 */
export function mergeHeadElements(...arrays: SSRElement[][]): SSRElement[] {
	const seen = new Set<string>();
	const result: SSRElement[] = [];

	for (const arr of arrays) {
		for (const element of arr) {
			// Create a key based on tag and identifying attributes
			const key = element.tag === "title"
				? "title"
				: element.tag === "meta" && element.attrs.name
					? `meta:${element.attrs.name}`
					: element.tag === "meta" && element.attrs.property
						? `meta:${element.attrs.property}`
						: JSON.stringify(element);

			if (!seen.has(key)) {
				seen.add(key);
				result.push(element);
			}
		}
	}

	return result;
}

// Re-export framework renderers
export { createReactSSRRenderer, type ReactSSRRenderer } from "./ssr/react.js";
export { createVueSSRRenderer, type VueSSRRenderer } from "./ssr/vue.js";
export { createSvelteSSRRenderer, type SvelteSSRRenderer } from "./ssr/svelte.js";
export { createSolidSSRRenderer, type SolidSSRRenderer } from "./ssr/solid.js";