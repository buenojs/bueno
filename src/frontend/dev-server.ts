/**
 * Development Server Implementation
 *
 * Provides a development server with:
 * - Static file serving using Bun.file()
 * - Framework auto-detection
 * - JSX/TSX transpilation using Bun's built-in capabilities
 * - SPA fallback support
 * - Integration with the Router for API routes
 * - Graceful shutdown handling
 */

import { Router, type RouteMatch } from "../router/index.js";
import { Logger, createLogger } from "../logger/index.js";
import type { HTTPMethod } from "../types/index.js";
import type {
	DevServerConfig,
	PartialDevServerConfig,
	DevServerState,
	FrontendFramework,
	FrameworkDetectionResult,
	PackageDependencies,
	FileResolution,
	DevServerMiddleware,
	DevServerEventListener,
	DevServerEvent,
	TransformResult,
	TransformOptions,
	HMRConfig,
	ConsoleStreamConfig,
	PartialConsoleStreamConfig,
	SSRConfig,
	PartialSSRConfig,
	BuildManifest,
} from "./types.js";
import { HMRManager, createHMRManager } from "./hmr.js";
import { injectHMRScript } from "./hmr-client.js";
import { ConsoleStreamManager, createConsoleStreamManager, injectConsoleScript } from "./console-stream.js";
import { SSRRenderer, createSSRRenderer } from "./ssr.js";

// ============= Constants =============

const DEFAULT_PORT = 3000;
const DEFAULT_HOSTNAME = "localhost";
const DEFAULT_PUBLIC_DIR = "public";
const DEFAULT_PAGES_DIR = "pages";

const MIME_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".mjs": "application/javascript; charset=utf-8",
	".ts": "application/typescript; charset=utf-8",
	".tsx": "application/typescript; charset=utf-8",
	".jsx": "application/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".eot": "application/vnd.ms-fontobject",
	".webp": "image/webp",
	".avif": "image/avif",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".mp3": "audio/mpeg",
	".wav": "audio/wav",
	".pdf": "application/pdf",
	".zip": "application/zip",
	".wasm": "application/wasm",
};

// ============= Framework Detection =============

const FRAMEWORK_INDICATORS: Record<FrontendFramework, string[]> = {
	react: ["react", "react-dom"],
	vue: ["vue"],
	svelte: ["svelte"],
	solid: ["solid-js"],
};

/**
 * Detect framework from package.json dependencies
 */
function detectFramework(rootDir: string): FrameworkDetectionResult {
	try {
		const packageJsonPath = `${rootDir}/package.json`;
		const packageJsonFile = Bun.file(packageJsonPath);

		if (!packageJsonFile.exists()) {
			return {
				framework: "react",
				detected: false,
				source: "config",
			};
		}

		// Read package.json synchronously using Bun's sync read
		const packageJson = JSON.parse(require("fs").readFileSync(packageJsonPath, "utf-8"));
		const dependencies: PackageDependencies = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		};

		// Check for each framework in order of specificity
		// Solid and Svelte are more specific than React/Vue
		const frameworkOrder: FrontendFramework[] = ["solid", "svelte", "vue", "react"];

		for (const framework of frameworkOrder) {
			const indicators = FRAMEWORK_INDICATORS[framework];
			if (indicators.some((pkg) => dependencies[pkg])) {
				return {
					framework,
					detected: true,
					source: "package.json",
				};
			}
		}

		// Default to React if no framework detected
		return {
			framework: "react",
			detected: false,
			source: "config",
		};
	} catch {
		return {
			framework: "react",
			detected: false,
			source: "config",
		};
	}
}

// ============= DevServer Class =============

export class DevServer {
	private config: DevServerConfig;
	private state: DevServerState;
	private logger: Logger;
	private router: Router | null = null;
	private apiRouter: Router | null = null;
	private server: ReturnType<typeof Bun.serve> | null = null;
	private middlewares: DevServerMiddleware[] = [];
	private eventListeners: DevServerEventListener[] = [];
	private hmrManager: HMRManager | null = null;
	private consoleStreamManager: ConsoleStreamManager | null = null;
	private ssrRenderer: SSRRenderer | null = null;
	private ssrEnabled = false;

	constructor(config: PartialDevServerConfig) {
		this.config = this.normalizeConfig(config);
		this.logger = createLogger({
			level: "debug",
			pretty: true,
			context: { component: "DevServer" },
		});

		// Detect framework
		const frameworkResult =
			this.config.framework === "auto"
				? detectFramework(this.config.rootDir)
				: {
						framework: this.config.framework as FrontendFramework,
						detected: true,
						source: "config" as const,
					};

		this.state = {
			running: false,
			port: this.config.port,
			hostname: this.config.hostname,
			framework: frameworkResult.framework,
			startTime: null,
			activeConnections: 0,
		};

		if (frameworkResult.detected) {
			this.logger.info(`Detected framework: ${frameworkResult.framework}`, {
				source: frameworkResult.source,
			});
		} else {
			this.logger.info(`Using default framework: ${frameworkResult.framework}`);
		}

		// Initialize HMR if enabled
		if (this.config.hmr) {
			this.hmrManager = createHMRManager(
				frameworkResult.framework,
				this.config.port
			);
			this.logger.info("HMR enabled");
		}

		// Initialize Console Stream if enabled (default: true)
		if (this.config.consoleStream?.enabled !== false) {
			this.consoleStreamManager = createConsoleStreamManager(
				this.config.port,
				this.config.consoleStream
			);
			this.logger.info("Console streaming enabled");
		}

		this.emitEvent({
			type: "framework-detected",
			framework: frameworkResult.framework,
		});
	}

	/**
	 * Normalize partial config to full config with defaults
	 */
	private normalizeConfig(config: PartialDevServerConfig): DevServerConfig {
		return {
			port: config.port ?? DEFAULT_PORT,
			hostname: config.hostname ?? DEFAULT_HOSTNAME,
			rootDir: config.rootDir,
			publicDir: config.publicDir ?? DEFAULT_PUBLIC_DIR,
			pagesDir: config.pagesDir ?? DEFAULT_PAGES_DIR,
			hmr: config.hmr ?? true,
			framework: config.framework ?? "auto",
		};
	}

	/**
	 * Get current server state
	 */
	getState(): DevServerState {
		return { ...this.state };
	}

	/**
	 * Get server configuration
	 */
	getConfig(): DevServerConfig {
		return { ...this.config };
	}

	/**
	 * Get detected framework
	 */
	getFramework(): FrontendFramework {
		return this.state.framework;
	}

	/**
	 * Set the API router for handling API routes
	 */
	setApiRouter(router: Router): void {
		this.apiRouter = router;
		this.logger.debug("API router configured");
	}

	/**
	 * Add middleware to the dev server
	 */
	use(middleware: DevServerMiddleware): void {
		this.middlewares.push(middleware);
		this.logger.debug("Middleware added");
	}

	/**
	 * Add event listener
	 */
	onEvent(listener: DevServerEventListener): void {
		this.eventListeners.push(listener);
	}

	/**
	 * Emit an event to all listeners
	 */
	private emitEvent(event: DevServerEvent): void {
		for (const listener of this.eventListeners) {
			try {
				listener(event);
			} catch (error) {
				this.logger.error("Event listener error", error);
			}
		}
	}

	/**
	 * Get content type for a file path
	 */
	private getContentType(filePath: string): string {
		const ext = filePath.substring(filePath.lastIndexOf("."));
		return MIME_TYPES[ext] || "application/octet-stream";
	}

	/**
	 * Resolve a request path to a file
	 */
	private async resolveFile(pathname: string): Promise<FileResolution> {
		// Remove leading slash and query string
		const cleanPath = pathname.split("?")[0].replace(/^\//, "");

		// Try to find the file in public directory
		const publicPath = `${this.config.rootDir}/${this.config.publicDir}/${cleanPath}`;

		// Check if file exists
		const publicFile = Bun.file(publicPath);
		if (await publicFile.exists()) {
			return {
				found: true,
				filePath: publicPath,
				contentType: this.getContentType(publicPath),
			};
		}

		// Try index.html for directory requests
		const indexPath = `${this.config.rootDir}/${this.config.publicDir}/${cleanPath}/index.html`;
		const indexFile = Bun.file(indexPath);
		if (await indexFile.exists()) {
			return {
				found: true,
				filePath: indexPath,
				contentType: "text/html; charset=utf-8",
			};
		}

		// SPA fallback to root index.html
		const rootIndexPath = `${this.config.rootDir}/${this.config.publicDir}/index.html`;
		const rootIndexFile = Bun.file(rootIndexPath);
		if (await rootIndexFile.exists()) {
			return {
				found: true,
				filePath: rootIndexPath,
				contentType: "text/html; charset=utf-8",
				isFallback: true,
			};
		}

		return { found: false };
	}

	/**
	 * Transform a file based on its type
	 */
	private async transformFile(options: TransformOptions): Promise<TransformResult> {
		const { filePath, content, framework } = options;

		// For JSX/TSX files, Bun handles transpilation automatically
		// We just need to set the correct content type
		const ext = filePath.substring(filePath.lastIndexOf("."));

		if (ext === ".jsx" || ext === ".tsx") {
			// Bun automatically handles JSX transpilation
			// The content is returned as-is since Bun's serve handles it
			return {
				content,
				contentType: "application/javascript; charset=utf-8",
			};
		}

		return {
			content,
			contentType: this.getContentType(filePath),
		};
	}

	/**
	 * Handle static file requests
	 */
	private async handleStaticFile(pathname: string): Promise<Response | null> {
		const resolution = await this.resolveFile(pathname);

		if (!resolution.found || !resolution.filePath) {
			return null;
		}

		const file = Bun.file(resolution.filePath);

		if (!(await file.exists())) {
			return null;
		}

		// Log if this is a fallback (SPA routing)
		if (resolution.isFallback) {
			this.logger.debug(`SPA fallback: ${pathname} -> index.html`);
		}

		// Inject HMR and Console scripts for HTML files
		if (resolution.contentType === "text/html; charset=utf-8") {
			let html = await file.text();
			
			// Inject HMR script
			if (this.hmrManager) {
				html = injectHMRScript(html, this.hmrManager.getPort());
			}
			
			// Inject Console Stream script
			if (this.consoleStreamManager) {
				html = injectConsoleScript(html, this.consoleStreamManager.getPort());
			}
			
			return new Response(html, {
				headers: {
					"Content-Type": "text/html; charset=utf-8",
				},
			});
		}

		return new Response(file, {
			headers: {
				"Content-Type": resolution.contentType || this.getContentType(resolution.filePath),
			},
		});
	}

	/**
	 * Handle API route requests
	 */
	private async handleApiRoute(request: Request): Promise<Response | null> {
		if (!this.apiRouter) {
			return null;
		}

		const url = new URL(request.url);
		const method = request.method as HTTPMethod;
		const match = this.apiRouter.match(method, url.pathname);

		if (!match) {
			return null;
		}

		this.logger.debug(`API route matched: ${method} ${url.pathname}`);

		// Create a minimal context for the handler
		const context = {
			request,
			method,
			path: url.pathname,
			url,
			query: url.searchParams,
			params: match.params,
			headers: request.headers,
			json: async () => request.json(),
			text: async () => request.text(),
			status: (code: number) => ({ status: code }),
			header: (name: string, value: string) => ({ header: [name, value] }),
		};

		try {
			const result = await match.handler(context);

			if (result instanceof Response) {
				return result;
			}

			// Convert result to JSON response
			return Response.json(result);
		} catch (error) {
			this.logger.error(`API route error: ${url.pathname}`, error);
			return Response.json(
				{
					error: "Internal Server Error",
					statusCode: 500,
				},
				{ status: 500 }
			);
		}
	}

	/**
	 * Apply middleware chain
	 */
	private async applyMiddleware(request: Request): Promise<Response | null> {
		if (this.middlewares.length === 0) {
			return null;
		}

		let index = 0;

		const next = async (): Promise<Response> => {
			if (index >= this.middlewares.length) {
				// Return a placeholder that indicates no middleware handled it
				return new Response(null, { status: 404 });
			}

			const middleware = this.middlewares[index++];
			return middleware(request, next);
		};

		const response = await next();

		// If middleware returned 404, it means no middleware handled the request
		if (response.status === 404 && !response.body) {
			return null;
		}

		return response;
	}

	/**
	 * Main request handler
	 */
	private async handleRequest(request: Request): Promise<Response> {
		const startTime = Date.now();
		const url = new URL(request.url);
		const pathname = url.pathname;

		this.state.activeConnections++;

		try {
			// 1. Try middleware first
			const middlewareResponse = await this.applyMiddleware(request);
			if (middlewareResponse) {
				this.logRequest(request.method, pathname, startTime);
				return middlewareResponse;
			}

			// 2. Try API routes
			const apiResponse = await this.handleApiRoute(request);
			if (apiResponse) {
				this.logRequest(request.method, pathname, startTime);
				return apiResponse;
			}

			// 3. Try SSR if enabled
			if (this.ssrEnabled) {
				const ssrResponse = await this.handleSSRRequest(request);
				if (ssrResponse) {
					this.logRequest(request.method, pathname, startTime);
					return ssrResponse;
				}
			}

			// 4. Try static files
			const staticResponse = await this.handleStaticFile(pathname);
			if (staticResponse) {
				this.logRequest(request.method, pathname, startTime);
				return staticResponse;
			}

			// 5. 404 Not Found
			this.logger.warn(`Not found: ${request.method} ${pathname}`);
			return Response.json(
				{
					error: "Not Found",
					statusCode: 404,
				},
				{ status: 404 }
			);
		} catch (error) {
			this.logger.error(`Request error: ${pathname}`, error);
			return Response.json(
				{
					error: "Internal Server Error",
					statusCode: 500,
					stack: process.env.NODE_ENV !== "production" && error instanceof Error ? error.stack : undefined,
				},
				{ status: 500 }
			);
		} finally {
			this.state.activeConnections--;
		}
	}

	/**
	 * Log a request
	 */
	private logRequest(method: string, path: string, startTime: number): void {
		const duration = Date.now() - startTime;
		this.logger.debug(`${method} ${path}`, { duration: `${duration}ms` });

		this.emitEvent({
			type: "request",
			method,
			path,
			duration,
		});
	}

	/**
	 * Start the development server
	 */
	async start(): Promise<void> {
		if (this.state.running) {
			this.logger.warn("Server is already running");
			return;
		}

		return new Promise((resolve, reject) => {
			try {
				this.server = Bun.serve({
					port: this.config.port,
					hostname: this.config.hostname,
					fetch: this.handleRequest.bind(this),
				});

				this.state.running = true;
				this.state.startTime = new Date();

				// Start HMR file watching
				if (this.hmrManager) {
					this.hmrManager.startWatching(this.config.rootDir);
				}

				// Start Console Stream server
				if (this.consoleStreamManager) {
					this.consoleStreamManager.start();
				}

				this.logger.info(
					`Development server started at http://${this.config.hostname}:${this.config.port}`
				);

				this.emitEvent({
					type: "start",
					port: this.config.port,
					hostname: this.config.hostname,
				});

				resolve();
			} catch (error) {
				this.logger.error("Failed to start server", error);
				reject(error);
			}
		});
	}

	/**
	 * Stop the development server
	 */
	async stop(reason?: string): Promise<void> {
		if (!this.state.running || !this.server) {
			this.logger.warn("Server is not running");
			return;
		}

		const server = this.server;
		return new Promise((resolve, reject) => {
			try {
				// Stop HMR manager
				if (this.hmrManager) {
					this.hmrManager.stop();
				}

				// Stop Console Stream manager
				if (this.consoleStreamManager) {
					this.consoleStreamManager.stop();
				}

				server.stop(true);
				this.state.running = false;
				this.state.startTime = null;

				this.logger.info(`Development server stopped${reason ? `: ${reason}` : ""}`);

				this.emitEvent({
					type: "stop",
					reason,
				});

				resolve();
			} catch (error) {
				this.logger.error("Failed to stop server", error);
				reject(error);
			}
		});
	}

	/**
	 * Restart the development server
	 */
	async restart(): Promise<void> {
		this.logger.info("Restarting development server...");
		await this.stop("restart");
		await this.start();
	}

	/**
	 * Check if the server is running
	 */
	isRunning(): boolean {
		return this.state.running;
	}

	/**
	 * Get server URL
	 */
	getUrl(): string {
		return `http://${this.config.hostname}:${this.config.port}`;
	}

	/**
	 * Get HMR manager
	 */
	getHMRManager(): HMRManager | null {
		return this.hmrManager;
	}

	/**
	 * Check if HMR is enabled
	 */
	isHMREnabled(): boolean {
		return this.hmrManager !== null && this.hmrManager.isEnabled();
	}

	/**
	 * Get HMR WebSocket URL
	 */
	getHMRUrl(): string | null {
		return this.hmrManager ? this.hmrManager.getWebSocketUrl() : null;
	}

	/**
	 * Get Console Stream manager
	 */
	getConsoleStreamManager(): ConsoleStreamManager | null {
		return this.consoleStreamManager;
	}

	/**
	 * Check if console streaming is enabled
	 */
	isConsoleStreamEnabled(): boolean {
		return this.consoleStreamManager !== null && this.consoleStreamManager.isEnabled();
	}

	/**
	 * Get Console Stream WebSocket URL
	 */
	getConsoleStreamUrl(): string | null {
		return this.consoleStreamManager ? this.consoleStreamManager.getWebSocketUrl() : null;
	}

	// ============= SSR Methods =============

	/**
	 * Enable SSR with configuration
	 */
	enableSSR(config: PartialSSRConfig): void {
		this.ssrRenderer = createSSRRenderer({
			...config,
			framework: config.framework || this.state.framework,
		});
		this.ssrEnabled = true;
		this.logger.info("SSR enabled", { framework: config.framework || this.state.framework });
	}

	/**
	 * Disable SSR
	 */
	disableSSR(): void {
		this.ssrRenderer = null;
		this.ssrEnabled = false;
		this.logger.info("SSR disabled");
	}

	/**
	 * Check if SSR is enabled
	 */
	isSSREnabled(): boolean {
		return this.ssrEnabled && this.ssrRenderer !== null;
	}

	/**
	 * Get SSR renderer
	 */
	getSSRRenderer(): SSRRenderer | null {
		return this.ssrRenderer;
	}

	/**
	 * Set SSR renderer directly
	 */
	setSSRRenderer(renderer: SSRRenderer): void {
		this.ssrRenderer = renderer;
		this.ssrEnabled = true;
		this.logger.info("SSR renderer configured");
	}

	/**
	 * Handle SSR request
	 */
	private async handleSSRRequest(request: Request): Promise<Response | null> {
		if (!this.ssrEnabled || !this.ssrRenderer) {
			return null;
		}

		const url = new URL(request.url);
		const pathname = url.pathname;

		// Skip static assets
		if (this.isStaticAsset(pathname)) {
			return null;
		}

		// Skip API routes
		if (pathname.startsWith("/api/")) {
			return null;
		}

		try {
			// Check if streaming is enabled
			if (this.ssrRenderer.isStreamingEnabled()) {
				const stream = this.ssrRenderer.renderToStream(request.url, request);
				return new Response(stream, {
					headers: {
						"Content-Type": "text/html; charset=utf-8",
					},
				});
			} else {
				const result = await this.ssrRenderer.render(request.url, request);
				return new Response(result.html, {
					status: result.status,
					headers: {
						"Content-Type": "text/html; charset=utf-8",
					},
				});
			}
		} catch (error) {
			this.logger.error(`SSR render error: ${pathname}`, error);
			return null;
		}
	}

	/**
	 * Check if path is a static asset
	 */
	private isStaticAsset(pathname: string): boolean {
		const staticExtensions = [
			".js", ".mjs", ".css", ".json",
			".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".avif",
			".woff", ".woff2", ".ttf", ".eot",
			".mp4", ".webm", ".mp3", ".wav",
			".pdf", ".zip", ".wasm",
		];
		return staticExtensions.some(ext => pathname.endsWith(ext));
	}
}

// ============= Factory Function =============

/**
	* Create a development server
	*/
export function createDevServer(config: PartialDevServerConfig & { consoleStream?: PartialConsoleStreamConfig }): DevServer {
	return new DevServer(config);
}