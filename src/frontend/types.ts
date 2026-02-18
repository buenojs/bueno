/**
 * TypeScript interfaces for the Frontend Integration Layer
 *
 * Provides type definitions for the development server,
 * framework detection, and frontend-related configurations.
 */

// ============= Framework Types =============

/**
 * Supported frontend frameworks
 */
export type FrontendFramework = 'react' | 'vue' | 'svelte' | 'solid';

/**
 * Framework detection mode
 */
export type FrameworkDetectionMode = FrontendFramework | 'auto';

// ============= Dev Server Configuration =============

/**
 * Development server configuration options
 */
export interface DevServerConfig {
	/**
	 * Port number for the dev server
	 * @default 3000
	 */
	port: number;

	/**
	 * Hostname for the dev server
	 * @default 'localhost'
	 */
	hostname: string;

	/**
	 * Project root directory
	 */
	rootDir: string;

	/**
	 * Static files directory (relative to rootDir)
	 * @default 'public'
	 */
	publicDir: string;

	/**
	 * Pages directory (relative to rootDir)
	 * @default 'pages'
	 */
	pagesDir: string;

	/**
	 * Enable Hot Module Replacement
	 * @default true
	 */
	hmr: boolean;

	/**
	 * Frontend framework to use
	 * 'auto' will detect from package.json dependencies
	 * @default 'auto'
	 */
	framework: FrameworkDetectionMode;

	/**
	 * Console streaming configuration
	 * Browser console output will be streamed to terminal
	 */
	consoleStream?: PartialConsoleStreamConfig;
}

/**
 * Partial configuration for creating a dev server
 */
export type PartialDevServerConfig = Partial<DevServerConfig> & Pick<DevServerConfig, 'rootDir'>;

// ============= Server State Types =============

/**
 * Runtime state of the development server
 */
export interface DevServerState {
	/**
	 * Whether the server is currently running
	 */
	running: boolean;

	/**
	 * Port the server is listening on
	 */
	port: number;

	/**
	 * Hostname the server is bound to
	 */
	hostname: string;

	/**
	 * Detected or configured framework
	 */
	framework: FrontendFramework;

	/**
	 * Server start time
	 */
	startTime: Date | null;

	/**
	 * Number of active connections
	 */
	activeConnections: number;
}

// ============= Request Handling Types =============

/**
 * Information about an incoming request
 */
export interface RequestInfo {
	/**
	 * HTTP method
	 */
	method: string;

	/**
	 * Request URL
	 */
	url: URL;

	/**
	 * Request path
	 */
	path: string;

	/**
	 * Request headers
	 */
	headers: Headers;

	/**
	 * Query parameters
	 */
	query: URLSearchParams;
}

/**
 * Result of file resolution for a request
 */
export interface FileResolution {
	/**
	 * Whether a file was found
	 */
	found: boolean;

	/**
	 * Absolute path to the file
	 */
	filePath?: string;

	/**
	 * Content type of the file
	 */
	contentType?: string;

	/**
	 * Whether this is an index.html fallback
	 */
	isFallback?: boolean;
}

// ============= Framework Detection Types =============

/**
 * Package.json dependency information for framework detection
 */
export interface PackageDependencies {
	[key: string]: string;
}

/**
 * Result of framework detection
 */
export interface FrameworkDetectionResult {
	/**
	 * Detected framework
	 */
	framework: FrontendFramework;

	/**
	 * Whether detection was successful
	 */
	detected: boolean;

	/**
	 * Source of detection ('package.json' or 'config')
	 */
	source: 'package.json' | 'config';
}

// ============= Build/Transform Types =============

/**
 * Result of transforming a file
 */
export interface TransformResult {
	/**
	 * Transformed content
	 */
	content: string;

	/**
	 * Content type
	 */
	contentType: string;

	/**
	 * Source map (if applicable)
	 */
	sourceMap?: string;
}

/**
 * Options for file transformation
 */
export interface TransformOptions {
	/**
	 * File path being transformed
	 */
	filePath: string;

	/**
	 * Original content
	 */
	content: string;

	/**
	 * Target framework
	 */
	framework: FrontendFramework;

	/**
	 * Whether to generate source maps
	 */
	sourceMap?: boolean;
}

// ============= Middleware Types =============

/**
 * Dev server middleware function
 */
export type DevServerMiddleware = (
	request: Request,
	next: () => Promise<Response>
) => Response | Promise<Response>;

// ============= Event Types =============

/**
 * Dev server event types
 */
export type DevServerEvent =
	| { type: 'start'; port: number; hostname: string }
	| { type: 'stop'; reason?: string }
	| { type: 'request'; method: string; path: string; duration: number }
	| { type: 'error'; error: Error }
	| { type: 'file-change'; path: string }
	| { type: 'framework-detected'; framework: FrontendFramework };

/**
 * Dev server event listener
 */
export type DevServerEventListener = (event: DevServerEvent) => void;

// ============= Response Types =============

/**
 * Standard error response
 */
export interface ErrorResponse {
	/**
	 * Error message
	 */
	error: string;

	/**
	 * HTTP status code
	 */
	statusCode: number;

	/**
	 * Optional stack trace (development only)
	 */
	stack?: string;
}

// ============= HMR Types =============

/**
 * HMR client connection information
 */
export interface HMRClient {
	/**
	 * Unique client identifier
	 */
	id: string;

	/**
	 * WebSocket connection
	 */
	ws: WebSocket;

	/**
	 * Set of file paths the client is subscribed to
	 */
	subscribedFiles: Set<string>;
}

/**
 * HMR update error information
 */
export interface HMRUpdateError {
	/**
	 * Error message
	 */
	message: string;

	/**
	 * Stack trace
	 */
	stack?: string;

	/**
	 * File where error occurred
	 */
	file?: string;

	/**
	 * Line number of error
	 */
	line?: number;

	/**
	 * Column number of error
	 */
	column?: number;
}

/**
 * HMR update message sent to clients
 */
export interface HMRUpdate {
	/**
	 * Type of update
	 */
	type: 'update' | 'reload' | 'error';

	/**
	 * Unique identifier for this update
	 */
	fileId: string;

	/**
	 * Timestamp of the update
	 */
	timestamp: number;

	/**
	 * List of changed file paths
	 */
	changes: string[];

	/**
	 * Error information if type is 'error'
	 */
	error?: HMRUpdateError;
}

/**
 * HMR configuration options
 */
export interface HMRConfig {
	/**
	 * Enable or disable HMR
	 * @default true
	 */
	enabled: boolean;

	/**
	 * WebSocket port for HMR
	 * Defaults to dev server port + 1
	 */
	port?: number;

	/**
	 * Debounce time for file changes in milliseconds
	 * @default 100
	 */
	debounceMs: number;

	/**
	 * File patterns to ignore for file watching
	 * @default ['node_modules', '.git', 'dist', 'build']
	 */
	ignorePatterns: string[];
}

/**
 * Partial HMR configuration for creating HMR manager
 */
export type PartialHMRConfig = Partial<HMRConfig>;

/**
 * HMR dependency graph entry
 */
export interface HMRDependencyNode {
	/**
	 * File path
	 */
	filePath: string;

	/**
	 * Files that this file imports
	 */
	imports: Set<string>;

	/**
	 * Files that import this file
	 */
	importedBy: Set<string>;

	/**
	 * Last modification timestamp
	 */
	lastModified: number;
}

/**
 * HMR module update result
 */
export interface HMRModuleUpdate {
	/**
	 * Module ID (file path)
	 */
	moduleId: string;

	/**
	 * Updated module code
	 */
	code: string;

	/**
	 * Whether the module accepts hot updates
	 */
	accepted: boolean;

	/**
	 * Dependencies that need to be updated
	 */
	dependencies: string[];
}

/**
 * HMR client message types
 */
export type HMRClientMessage =
	| { type: 'subscribe'; fileId: string }
	| { type: 'unsubscribe'; fileId: string }
	| { type: 'ping' }
	| { type: 'module-accepted'; moduleId: string; dependencies: string[] };

/**
 * HMR server message types
 */
export type HMRServerMessage =
	| HMRUpdate
	| { type: 'pong' }
	| { type: 'connected'; clientId: string };

/**
 * File change event information
 */
export interface FileChangeEvent {
	/**
	 * Path to the changed file
	 */
	path: string;

	/**
	 * Type of change
	 */
	event: 'create' | 'update' | 'delete';

	/**
	 * Timestamp of the change
	 */
	timestamp: number;
}

// ============= Console Stream Types =============

/**
 * Console message types that can be captured
 */
export type ConsoleMessageType = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'table';

/**
 * Console message captured from the browser
 */
export interface ConsoleMessage {
	/**
	 * Type of console method called
	 */
	type: ConsoleMessageType;

	/**
	 * Serialized arguments passed to console method
	 */
	args: unknown[];

	/**
	 * Timestamp when the message was created
	 */
	timestamp: number;

	/**
	 * Source file where console was called
	 */
	file?: string;

	/**
	 * Line number in source file
	 */
	line?: number;

	/**
	 * Column number in source file
	 */
	column?: number;

	/**
	 * Stack trace for errors
	 */
	stack?: string;

	/**
	 * Page URL where console was called
	 */
	url?: string;
}

/**
 * Configuration for console streaming
 */
export interface ConsoleStreamConfig {
	/**
	 * Enable or disable console streaming
	 * @default true
	 */
	enabled: boolean;

	/**
	 * Show timestamps in output
	 * @default true
	 */
	showTimestamps: boolean;

	/**
	 * Show file:line information
	 * @default true
	 */
	showFile: boolean;

	/**
	 * Colorize terminal output
	 * @default true
	 */
	colorize: boolean;

	/**
	 * Filter which console types to show
	 * Default: show all types
	 */
	filter: ConsoleMessageType[];
}

/**
 * Partial console stream configuration
 */
export type PartialConsoleStreamConfig = Partial<ConsoleStreamConfig>;

/**
 * Console stream client connection
 */
export interface ConsoleStreamClient {
	/**
	 * Unique client identifier
	 */
	id: string;

	/**
	 * WebSocket connection
	 */
	ws: WebSocket;

	/**
	 * Page URL of the client
	 */
	url?: string;
}

/**
 * Console message from client
 */
export interface ConsoleClientMessage {
	/**
	 * Message type identifier
	 */
	type: 'console';

	/**
	 * Console method called (log, warn, error, etc.)
	 */
	consoleType: ConsoleMessageType;

	/**
	 * Serialized arguments passed to console method
	 */
	args: unknown[];

	/**
	 * Timestamp when the message was created
	 */
	timestamp: number;

	/**
	 * Source file where console was called
	 */
	file?: string;

	/**
	 * Line number in source file
	 */
	line?: number;

	/**
	 * Column number in source file
	 */
	column?: number;

	/**
	 * Stack trace for errors
	 */
	stack?: string;

	/**
	 * Page URL where console was called
	 */
	url?: string;
}

/**
 * Server message for console stream
 */
export type ConsoleServerMessage =
	| { type: 'connected'; clientId: string }
	| { type: 'pong' };

// ============= Bundler Types =============

/**
 * Build plugin interface for framework-specific plugins
 */
export interface BuildPlugin {
	/**
	 * Plugin name
	 */
	name: string;

	/**
	 * Setup function called during build
	 */
	setup?: (build: unknown) => void | Promise<void>;

	/**
	 * Plugin namespace for module resolution
	 */
	namespace?: string;
}

/**
 * Source map generation options
 */
export type SourcemapOption = 'linked' | 'external' | 'none';

/**
 * Build target environment
 */
export type BuildTarget = 'browser' | 'node' | 'bun';

/**
 * Output module format
 */
export type OutputFormat = 'esm' | 'cjs' | 'iife';

/**
 * Bundler configuration options
 */
export interface BundlerConfig {
	/**
	 * Entry file(s) for the build
	 * Can be a single file or array of files
	 */
	entryPoints: string | string[];

	/**
	 * Output directory for built files
	 * @default 'dist'
	 */
	outDir: string;

	/**
	 * Frontend framework to use
	 * 'auto' will detect from package.json
	 * @default 'auto'
	 */
	framework: FrontendFramework | 'auto';

	/**
	 * Minify output
	 * @default true
	 */
	minify: boolean;

	/**
	 * Source map generation
	 * @default 'linked'
	 */
	sourcemap: SourcemapOption;

	/**
	 * Enable code splitting
	 * @default true
	 */
	splitting: boolean;

	/**
	 * Enable tree shaking
	 * @default true
	 */
	treeshaking: boolean;

	/**
	 * Environment variable prefix to include in build
	 * @default 'PUBLIC_'
	 */
	envPrefix: string;

	/**
	 * Global constants to define
	 */
	define: Record<string, string>;

	/**
	 * External dependencies to exclude from bundle
	 */
	external: string[];

	/**
	 * Build target environment
	 * @default 'browser'
	 */
	target: BuildTarget;

	/**
	 * Output module format
	 * @default 'esm'
	 */
	format: OutputFormat;

	/**
	 * Project root directory
	 * @default process.cwd()
	 */
	rootDir?: string;

	/**
	 * Public path for assets
	 */
	publicPath?: string;

	/**
	 * Generate build manifest
	 * @default true
	 */
	manifest: boolean;

	/**
	 * Environment mode
	 */
	mode?: 'development' | 'production';
}

/**
 * Partial bundler configuration
 */
export type PartialBundlerConfig = Partial<BundlerConfig> & Pick<BundlerConfig, 'entryPoints'>;

/**
 * Build output file information
 */
export interface BuildOutput {
	/**
	 * Output file path (relative to outDir)
	 */
	path: string;

	/**
	 * Type of output file
	 */
	type: 'js' | 'css' | 'asset';

	/**
	 * File size in bytes
	 */
	size: number;

	/**
	 * Content hash for cache busting
	 */
	hash?: string;

	/**
	 * Entry point this file belongs to
	 */
	entryPoint?: string;

	/**
	 * For JS files, list of imported modules
	 */
	imports?: string[];

	/**
	 * For JS files, list of dynamically imported modules
	 */
	dynamicImports?: string[];

	/**
	 * For CSS files, list of referenced assets
	 */
	references?: string[];
}

/**
 * Build error information
 */
export interface BuildError {
	/**
	 * Error message
	 */
	message: string;

	/**
	 * File where error occurred
	 */
	file?: string;

	/**
	 * Line number
	 */
	line?: number;

	/**
	 * Column number
	 */
	column?: number;

	/**
	 * Stack trace
	 */
	stack?: string;
}

/**
 * Build warning information
 */
export interface BuildWarning {
	/**
	 * Warning message
	 */
	message: string;

	/**
	 * File where warning occurred
	 */
	file?: string;

	/**
	 * Line number
	 */
	line?: number;

	/**
	 * Column number
	 */
	column?: number;
}

/**
 * Result of a production build
 */
export interface BuildResult {
	/**
	 * Whether the build succeeded
	 */
	success: boolean;

	/**
	 * Output files generated
	 */
	outputs: BuildOutput[];

	/**
	 * Build errors
	 */
	errors: BuildError[];

	/**
	 * Build warnings
	 */
	warnings: BuildWarning[];

	/**
	 * Build duration in milliseconds
	 */
	duration: number;

	/**
	 * Build manifest (if generated)
	 */
	manifest?: BuildManifest;

	/**
	 * Total output size in bytes
	 */
	totalSize: number;
}

/**
 * Framework-specific build configuration
 */
export interface FrameworkBuildConfig {
	/**
	 * JSX runtime to use
	 */
	jsxRuntime: 'automatic' | 'classic';

	/**
	 * JSX import source for automatic runtime
	 */
	jsxImportSource?: string;

	/**
	 * JSX fragment import source
	 */
	jsxFragment?: string;

	/**
	 * Framework-specific build plugins
	 */
	plugins: BuildPlugin[];

	/**
	 * Global constants for the framework
	 */
	define: Record<string, string>;

	/**
	 * External dependencies
	 */
	external: string[];

	/**
	 * File extensions to handle
	 */
	extensions: string[];

	/**
	 * Additional loader configurations
	 */
	loaders?: Record<string, 'js' | 'jsx' | 'ts' | 'tsx' | 'css' | 'file' | 'dataurl' | 'text'>;
}

/**
 * Build manifest for SSR integration
 */
export interface BuildManifest {
	/**
	 * Entry points and their files
	 */
	entryPoints: Record<string, string[]>;

	/**
	 * All output files
	 */
	files: Record<string, {
		type: 'js' | 'css' | 'asset';
		size: number;
		hash?: string;
		imports?: string[];
		dynamicImports?: string[];
	}>;

		/**
	 * CSS files for each entry point
	 */
	css: Record<string, string[]>;

	/**
	 * Build timestamp
	 */
	timestamp: number;

	/**
	 * Build duration in ms
	 */
	duration: number;
}

/**
 * Bundle analysis result
 */
export interface BundleAnalysis {
	/**
	 * Total bundle size in bytes
	 */
	totalSize: number;

	/**
	 * Size breakdown by module
	 */
	modules: {
		path: string;
		size: number;
		percentage: number;
	}[];

	/**
	 * Duplicate code detection
	 */
	duplicates: {
		module: string;
		occurrences: number;
		wastedBytes: number;
	}[];

	/**
	 * Large modules (>50KB)
	 */
	largeModules: {
		path: string;
		size: number;
	}[];

	/**
	 * Dependency tree
	 */
	dependencyTree: Record<string, string[]>;
}

/**
 * Watch mode callback
 */
export type BuildWatchCallback = (result: BuildResult) => void;

/**
 * Bundler state
 */
export interface BundlerState {
	/**
	 * Whether a build is in progress
	 */
	building: boolean;

	/**
	 * Last build result
	 */
	lastResult: BuildResult | null;

	/**
	 * Whether watch mode is active
	 */
	watching: boolean;

	/**
	 * Detected framework
	 */
	framework: FrontendFramework | null;
}

// ============= SSR Types =============

/**
 * SSR element representation for head/body elements
 */
export interface SSRElement {
	/**
	 * HTML tag name
	 */
	tag: string;

	/**
	 * HTML attributes
	 */
	attrs: Record<string, string>;

	/**
	 * Child elements
	 */
	children?: SSRElement[];

	/**
	 * Inner HTML content
	 */
	innerHTML?: string;
}

/**
 * SSR context passed to page components
 */
export interface SSRContext {
	/**
	 * Request URL
	 */
	url: string;

	/**
	 * Original request object
	 */
	request: Request;

	/**
	 * Response headers
	 */
	headers: Headers;

	/**
	 * HTTP response status
	 */
	status: number;

	/**
	 * Head elements to inject
	 */
	head: SSRElement[];

	/**
	 * Body elements to inject
	 */
	body: SSRElement[];

	/**
	 * Serialized data for client hydration
	 */
	data: Record<string, unknown>;

	/**
	 * Loaded modules for preload
	 */
	modules: Set<string>;

	/**
	 * URL pathname
	 */
	pathname: string;

	/**
	 * Query parameters
	 */
	query: URLSearchParams;

	/**
	 * Route parameters
	 */
	params: Record<string, string>;
}

/**
 * Result of rendering a page
 */
export interface RenderResult {
	/**
	 * Rendered HTML or stream
	 */
	html: string | ReadableStream<Uint8Array>;

	/**
	 * Head content string
	 */
	head: string;

	/**
	 * Body content string
	 */
	body: string;

	/**
	 * Data for client hydration
	 */
	data: Record<string, unknown>;

	/**
	 * Loaded modules
	 */
	modules: string[];

	/**
	 * HTTP status code
	 */
	status: number;
}

/**
 * SSR page component interface
 */
export interface SSRPage {
	/**
	 * Render the page to HTML
	 */
	render(ctx: SSRContext): Promise<RenderResult> | RenderResult;

	/**
	 * Server-side data fetching
	 */
	getServerSideProps?(ctx: SSRContext): Promise<Record<string, unknown>>;

	/**
	 * Static paths for dynamic routes
	 */
	getStaticPaths?(): Promise<{ paths: string[]; fallback: boolean }>;
}

/**
 * SSR configuration options
 */
export interface SSRConfig {
	/**
	 * Server entry point file
	 */
	entry: string;

	/**
	 * Client entry point for hydration
	 */
	clientEntry: string;

	/**
	 * Build manifest from bundler
	 */
	clientManifest: BuildManifest;

	/**
	 * Enable streaming SSR
	 * @default true
	 */
	streaming: boolean;

	/**
	 * Maximum await timeout in milliseconds
	 * @default 5000
	 */
	maxTimeout: number;

	/**
	 * Buffer initial stream for faster TTFB
	 * @default true
	 */
	bufferInitialStream: boolean;

	/**
	 * Framework to use for SSR
	 */
	framework: FrontendFramework;

	/**
	 * Project root directory
	 */
	rootDir?: string;

	/**
	 * Base HTML template
	 */
	template?: string;

	/**
	 * Custom HTML template function
	 */
	templateFn?: (ctx: SSRContext, content: string, head: string, body: string) => string;
}

/**
 * Partial SSR configuration
 */
export type PartialSSRConfig = Partial<SSRConfig> & Pick<SSRConfig, 'entry' | 'clientEntry' | 'clientManifest' | 'framework'>;

/**
 * Framework-specific SSR renderer
 */
export interface FrameworkSSRRenderer {
	/**
	 * Render a component to HTML string
	 */
	renderToString(component: unknown, context: SSRContext): Promise<string>;

	/**
	 * Render a component to a stream
	 */
	renderToStream(component: unknown, context: SSRContext): ReadableStream<Uint8Array>;

	/**
	 * Get head elements from component
	 */
	getHeadElements(context: SSRContext): SSRElement[];

	/**
	 * Create the framework-specific component
	 */
	createComponent(page: SSRPage, context: SSRContext): unknown;
}

/**
 * SSR hydration data structure
 */
export interface SSRHydrationData {
	/**
	 * Page props
	 */
	props: Record<string, unknown>;

	/**
	 * Current URL
	 */
	url: string;

	/**
	 * Route parameters
	 */
	params: Record<string, string>;

	/**
	 * Query parameters
	 */
	query: Record<string, string>;

	/**
	 * Framework identifier
	 */
	framework: FrontendFramework;
}

/**
 * SSR error information
 */
export interface SSRError {
	/**
	 * Error message
	 */
	message: string;

	/**
	 * Stack trace
	 */
	stack?: string;

	/**
	 * Component where error occurred
	 */
	component?: string;

	/**
	 * Error timestamp
	 */
	timestamp: number;
}

/**
 * SSR render options
 */
export interface SSRRenderOptions {
	/**
	 * Request URL
	 */
	url: string;

	/**
	 * Original request
	 */
	request: Request;

	/**
	 * Route parameters
	 */
	params?: Record<string, string>;

	/**
	 * Additional props to pass to page
	 */
	props?: Record<string, unknown>;

	/**
	 * Skip streaming and return string
	 */
	skipStreaming?: boolean;
}

/**
 * Preload link information
 */
export interface PreloadLink {
	/**
	 * Module path
	 */
	href: string;

	/**
	 * Link rel type
	 */
	rel: 'preload' | 'prefetch' | 'modulepreload';

	/**
	 * As attribute
	 */
	as?: 'script' | 'style' | 'font' | 'image' | 'fetch';

	/**
	 * Additional attributes
	 */
	attrs?: Record<string, string>;
}
// ============= ISR Types =============

/**
 * ISR cache entry
 */
export interface ISRCacheEntry {
	/**
	 * Rendered result
	 */
	result: RenderResult;

	/**
	 * Timestamp when cached
	 */
	timestamp: number;

	/**
	 * Revalidation time in seconds
	 */
	revalidate: number;

	/**
	 * Tags for tag-based revalidation
	 */
	tags: string[];
}

/**
 * ISR page configuration
 */
export interface ISRPageConfig {
	/**
	 * Revalidation time in seconds
	 */
	revalidate?: number;

	/**
	 * Tags for tag-based revalidation
	 */
	tags?: string[];

	/**
	 * Enable stale-while-revalidate
	 */
	staleWhileRevalidate?: number;
}

/**
 * ISR configuration options
 */
export interface ISRConfig {
	/**
	 * Cache directory for ISR pages
	 * @default '.isr-cache'
	 */
	cacheDir: string;

	/**
	 * Default revalidation time in seconds
	 * @default 3600 (1 hour)
	 */
	defaultRevalidate: number;

	/**
	 * Stale-while-revalidate time in seconds
	 * @default 60
	 */
	staleWhileRevalidate: number;

	/**
	 * Maximum number of pages in cache
	 */
	maxCacheSize: number;

	/**
	 * Redis client for distributed cache
	 */
	redis?: {
		get(key: string): Promise<string | null>;
		set(key: string, value: string, options?: { EX?: number }): Promise<void>;
		del(...keys: string[]): Promise<void>;
		keys(pattern: string): Promise<string[]>;
	};

	/**
	 * Redis key prefix
	 * @default 'bueno:isr:'
	 */
	redisKeyPrefix: string;

	/**
	 * Enable ISR
	 * @default true
	 */
	enabled: boolean;
}

/**
 * Partial ISR configuration
 */
export type PartialISRConfig = Partial<ISRConfig>;

/**
 * ISR revalidation result
 */
export interface ISRRevalidationResult {
	/**
	 * Whether revalidation succeeded
	 */
	success: boolean;

	/**
	 * URL that was revalidated
	 */
	url: string;

	/**
	 * Duration in milliseconds
	 */
	duration: number;

	/**
	 * Timestamp of revalidation
	 */
	timestamp: number;

	/**
	 * Error message if failed
	 */
	error?: string;
}

/**
 * ISR statistics
 */
export interface ISRStats {
	/**
	 * Number of cache hits
	 */
	hits: number;

	/**
	 * Number of cache misses
	 */
	misses: number;

	/**
	 * Number of revalidations
	 */
	revalidations: number;

	/**
	 * Number of stale hits (served stale while revalidating)
	 */
	staleHits: number;

	/**
	 * Current cache size
	 */
	cacheSize: number;

	/**
	 * Number of pending revalidations
	 */
	pendingRevalidations: number;

	/**
	 * Cache hit rate (0-1)
	 */
	hitRate: number;
}
// ============= Island Architecture Types =============

/**
 * Island hydration strategy
 */
export type IslandHydrationStrategy = 'eager' | 'lazy' | 'visible' | 'idle';

/**
 * Island configuration options
 */
export interface IslandConfig {
	/**
	 * Unique island identifier
	 */
	id: string;

	/**
	 * Hydration strategy
	 * - eager: Hydrate immediately on page load
	 * - lazy: Hydrate on user interaction (click, focus, etc.)
	 * - visible: Hydrate when element enters viewport
	 * - idle: Hydrate when browser is idle
	 */
	strategy: IslandHydrationStrategy;

	/**
	 * Placeholder content before hydration
	 */
	placeholder?: string;
}

/**
 * Island definition for registration
 */
export interface IslandDefinition {
	/**
	 * Unique island identifier
	 */
	id: string;

	/**
	 * Component name
	 */
	component: string;

	/**
	 * Entry point for the island component
	 */
	entry: string;

	/**
	 * Hydration strategy
	 */
	strategy: IslandHydrationStrategy;

	/**
	 * CSS selector for the island
	 */
	selector?: string;

	/**
	 * Additional props
	 */
	props?: Record<string, unknown>;
}

/**
 * Island registry type
 */
export type IslandRegistry = Map<string, IslandDefinition>;

/**
 * Island render result
 */
export interface IslandRenderResult {
	/**
	 * Rendered HTML string
	 */
	html: string;

	/**
	 * Island ID
	 */
	id: string;

	/**
	 * Component name
	 */
	component: string;

	/**
	 * Whether the island is hydrated
	 */
	hydrated: boolean;

	/**
	 * Props passed to the island
	 */
	props?: Record<string, unknown>;

	/**
	 * Hydration strategy used
	 */
	strategy?: IslandHydrationStrategy;

	/**
	 * SSR content (if any)
	 */
	ssrContent?: string;
}

/**
 * Island state for client-side tracking
 */
export interface IslandState {
	/**
	 * Island ID
	 */
	id: string;

	/**
	 * Component name
	 */
	component: string;

	/**
	 * Props for the island
	 */
	props: Record<string, unknown>;

	/**
	 * Hydration strategy
	 */
	strategy: IslandHydrationStrategy;

	/**
	 * Whether the island is hydrated
	 */
	hydrated: boolean;
}

/**
 * Island hydration script info
 */
export interface IslandHydrationScript {
	/**
	 * Script content
	 */
	script: string;

	/**
	 * Whether to inline the script
	 */
	inline: boolean;

	/**
	 * Script type
	 */
	type: 'module' | 'text/javascript';
}
// ============= File-based Routing Types =============

/**
 * Route type
 */
export type RouteType = 'page' | 'api' | 'layout';

/**
 * Route definition from file
 */
export interface RouteDefinition {
	/**
	 * Unique route identifier
	 */
	id: string;

	/**
	 * Route path (e.g., /users/:id)
	 */
	path: string;

	/**
	 * Route pattern for matching
	 */
	pattern: string;

	/**
	 * File path to the route module
	 */
	filePath: string;

	/**
	 * Type of route
	 */
	type: RouteType;

	/**
	 * Parameter names extracted from path
	 */
	params: string[];

	/**
	 * Compiled regex for matching
	 */
	regex: RegExp;
}

/**
 * Dynamic route with parameter names
 */
export interface DynamicRoute extends RouteDefinition {
	/**
	 * Names of dynamic parameters
	 */
	paramNames: string[];
}

/**
 * Route match result
 */
export interface RouteMatch {
	/**
	 * Matched route definition
	 */
	route: RouteDefinition;

	/**
	 * Extracted parameters
	 */
	params: Record<string, string>;
}

/**
 * Route handler function
 */
export type RouteHandler = (request: Request) => Response | Promise<Response>;

/**
 * Route middleware function
 */
export type RouteMiddleware = (
	request: Request,
	next: () => Promise<Response>
) => Response | Promise<Response>;

/**
 * File router configuration
 */
export interface FileRouterConfig {
	/**
	 * Pages directory path
	 * @default 'pages'
	 */
	pagesDir: string;

	/**
	 * API routes directory (relative to pagesDir)
	 * @default 'api'
	 */
	apiDir: string;

	/**
	 * Root directory for file scanning
	 */
	rootDir: string;

	/**
	 * Supported file extensions
	 * @default ['.tsx', '.ts', '.jsx', '.js']
	 */
	extensions: string[];

	/**
	 * Enable file watching for hot reload
	 * @default false
	 */
	watch: boolean;

	/**
	 * Patterns to ignore during scanning
	 */
	ignore: string[];
}

/**
 * Partial file router configuration
 */
export type PartialFileRouterConfig = Partial<FileRouterConfig>;

/**
 * File route options
 */
export interface FileRouteOptions {
	/**
	 * Route middleware
	 */
	middleware?: RouteMiddleware[];

	/**
	 * Route metadata
	 */
	meta?: Record<string, unknown>;
}
// ============= Layout Nesting Types =============

/**
 * Layout definition from file
 */
export interface LayoutDefinition {
	/**
	 * Unique layout identifier
	 */
	id: string;

	/**
	 * File path to the layout module
	 */
	filePath: string;

	/**
	 * Layout segment (e.g., "/", "/users")
	 */
	segment: string;

	/**
	 * Depth in the layout tree
	 */
	depth: number;
}

/**
 * Layout tree node
 */
export interface LayoutNode {
	/**
	 * Layout definition
	 */
	layout: LayoutDefinition;

	/**
	 * Parent node
	 */
	parent: LayoutNode | null;

	/**
	 * Child nodes
	 */
	children: LayoutNode[];
}

/**
 * Layout tree structure
 */
export type LayoutTree = LayoutNode;

/**
 * Layout props passed to layout components
 */
export interface LayoutProps {
	/**
	 * Child content (nested layouts or page)
	 */
	children: string;

	/**
	 * Route parameters
	 */
	params: Record<string, string>;

	/**
	 * Query parameters
	 */
	query: URLSearchParams;

	/**
	 * Current pathname
	 */
	pathname: string;
}

/**
 * Layout renderer function
 */
export type LayoutRenderer = (
	props: LayoutProps,
	context: SSRContext
) => Promise<string | LayoutRenderResult> | string | LayoutRenderResult;

/**
 * Layout middleware function
 */
export type LayoutMiddleware = (
	props: LayoutProps,
	context: SSRContext,
	next: () => Promise<string>
) => Promise<string> | string;

/**
 * Layout configuration
 */
export interface LayoutConfig {
	/**
	 * Pages directory path
	 * @default 'pages'
	 */
	pagesDir: string;

	/**
	 * Root directory for file scanning
	 */
	rootDir: string;

	/**
	 * Supported file extensions
	 * @default ['.tsx', '.ts', '.jsx', '.js']
	 */
	extensions: string[];

	/**
	 * Preserve layout state on navigation
	 * @default true
	 */
	preserveState: boolean;
}

/**
 * Partial layout configuration
 */
export type PartialLayoutConfig = Partial<LayoutConfig>;

/**
 * Layout render result
 */
export interface LayoutRenderResult {
	/**
	 * Rendered HTML
	 */
	html: string;

	/**
	 * Head elements
	 */
	head: SSRElement[];

	/**
	 * Body elements
	 */
	body: SSRElement[];

	/**
	 * Layouts that were rendered
	 */
	layouts: string[];
}

/**
 * Layout segment information
 */
export interface LayoutSegment {
	/**
	 * Segment path
	 */
	path: string;

	/**
	 * Route parameters
	 */
	params: Record<string, string>;

	/**
	 * Layout component
	 */
	component: LayoutRenderer | null;
}
// ============= API Routes Types =============

/**
 * HTTP methods supported by API routes
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * API route definition
 */
export interface APIRouteDefinition {
	/**
	 * Unique route identifier
	 */
	id: string;

	/**
	 * Route path (e.g., /api/users/:id)
	 */
	path: string;

	/**
	 * File path to the route module
	 */
	filePath: string;

	/**
	 * Supported HTTP methods
	 */
	methods: HTTPMethod[];

	/**
	 * Parameter names extracted from path
	 */
	params: string[];

	/**
	 * Compiled regex for matching
	 */
	regex: RegExp;
}

/**
 * API route handler function
 */
export type APIRouteHandler = (ctx: APIContext) => APIResponse | Promise<APIResponse>;

/**
 * API response type
 */
export type APIResponse = Response | string | Record<string, unknown> | null;

/**
 * API middleware function
 */
export type APIMiddleware = (
	ctx: APIContext,
	next: () => Promise<Response>
) => Response | Promise<Response>;

/**
 * API context passed to handlers
 */
export interface APIContext {
	/**
	 * Original request object
	 */
	request: Request;

	/**
	 * Request URL
	 */
	url: string;

	/**
	 * URL pathname
	 */
	pathname: string;

	/**
	 * Query parameters
	 */
	query: URLSearchParams;

	/**
	 * Route parameters
	 */
	params: Record<string, string>;

	/**
	 * Request body (parsed)
	 */
	body: unknown;

	/**
	 * Request headers
	 */
	headers: Headers;

	/**
	 * HTTP method
	 */
	method: HTTPMethod;

	/**
	 * Cookies
	 */
	cookies: Record<string, string>;
}

/**
 * API route module interface
 */
export interface APIRouteModule {
	/**
	 * GET handler
	 */
	GET?: APIRouteHandler;

	/**
	 * POST handler
	 */
	POST?: APIRouteHandler;

	/**
	 * PUT handler
	 */
	PUT?: APIRouteHandler;

	/**
	 * PATCH handler
	 */
	PATCH?: APIRouteHandler;

	/**
	 * DELETE handler
	 */
	DELETE?: APIRouteHandler;

	/**
	 * HEAD handler
	 */
	HEAD?: APIRouteHandler;

	/**
	 * OPTIONS handler
	 */
	OPTIONS?: APIRouteHandler;

	/**
	 * Default export (config or handler)
	 */
	default?: APIRouteHandler | { handler: APIRouteHandler; config?: APIRouteConfig };
}

/**
 * API route configuration
 */
export interface APIRouteConfig {
	/**
	 * API routes directory
	 * @default 'pages/api'
	 */
	apiDir: string;

	/**
	 * Root directory for file scanning
	 */
	rootDir: string;

	/**
	 * Supported file extensions
	 * @default ['.ts', '.js']
	 */
	extensions: string[];

	/**
	 * Maximum request body size in bytes
	 * @default 1048576 (1MB)
	 */
	bodyLimit: number;
}

/**
 * Partial API route configuration
 */
export type PartialAPIRouteConfig = Partial<APIRouteConfig>;