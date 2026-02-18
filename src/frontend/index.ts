/**
 * Frontend Integration Module
 *
 * Provides development server, framework detection, bundler, and frontend-related
 * capabilities for the Bueno Framework.
 *
 * @module frontend
 */

// ============= Types =============

export type {
	FrontendFramework,
	FrameworkDetectionMode,
	DevServerConfig,
	PartialDevServerConfig,
	DevServerState,
	RequestInfo,
	FileResolution,
	PackageDependencies,
	FrameworkDetectionResult,
	TransformResult,
	TransformOptions,
	DevServerMiddleware,
	DevServerEvent,
	DevServerEventListener,
	ErrorResponse,
	// HMR Types
	HMRClient,
	HMRUpdateError,
	HMRUpdate,
	HMRConfig,
	HMRDependencyNode,
	HMRModuleUpdate,
	HMRClientMessage,
	HMRServerMessage,
	FileChangeEvent,
	// Console Stream Types
	ConsoleMessageType,
	ConsoleMessage,
	ConsoleStreamConfig,
	PartialConsoleStreamConfig,
	ConsoleStreamClient,
	ConsoleClientMessage,
	ConsoleServerMessage,
	// Bundler Types
	BuildPlugin,
	SourcemapOption,
	BuildTarget,
	OutputFormat,
	BundlerConfig,
	PartialBundlerConfig,
	BuildOutput,
	BuildError,
	BuildWarning,
	BuildResult,
	FrameworkBuildConfig,
	BuildManifest,
	BundleAnalysis,
	BuildWatchCallback,
	BundlerState,
	// SSR Types
	SSRElement,
	SSRContext,
	RenderResult,
	SSRPage,
	SSRConfig,
	PartialSSRConfig,
	FrameworkSSRRenderer,
	SSRHydrationData,
	SSRError,
	SSRRenderOptions,
	PreloadLink,
} from "./types.js";

// ============= Dev Server =============

export { DevServer, createDevServer } from "./dev-server.js";

// ============= HMR =============

export { HMRManager, createHMRManager, isHMRBoundary, parseImports } from "./hmr.js";
export { HMR_CLIENT_SCRIPT, getHMRClientScript, injectHMRScript } from "./hmr-client.js";

// ============= Console Stream =============

export {
	ConsoleStreamManager,
	createConsoleStreamManager,
	injectConsoleScript
} from "./console-stream.js";
export {
	CONSOLE_CLIENT_SCRIPT,
	getConsoleClientScript
} from "./console-client.js";

// ============= Bundler =============

export { Bundler, createBundler, build } from "./bundler.js";

// ============= Framework Configurations =============

export {
	// React
	getReactBuildConfig,
	isReactComponent,
	getReactRefreshPreamble,
	reactFrameworkMeta,
	// Vue
	getVueBuildConfig,
	isVueComponent,
	isVueJsx,
	getVueBlockTypes,
	vueFrameworkMeta,
	// Svelte
	getSvelteBuildConfig,
	isSvelteComponent,
	getSveltePreprocessConfig,
	getSvelteCompilerOptions,
	svelteFrameworkMeta,
	// Solid
	getSolidBuildConfig,
	isSolidComponent,
	getSolidRefreshPreamble,
	getSolidTransformOptions,
	solidFrameworkMeta,
	// Utilities
	getFrameworkConfig,
	getFrameworkMeta,
	detectFrameworkFromExtension,
	getAllSupportedExtensions,
	isSupportedExtension,
} from "./frameworks/index.js";

export type { FrameworkMeta } from "./frameworks/index.js";

// ============= SSR =============

export {
	SSRRenderer,
	createSSRRenderer,
	createSSRContext,
	serializeHydrationData,
	deserializeHydrationData,
	generateHTML,
	createPreloadLink,
	mergeHeadElements,
	// Framework renderers
	createReactSSRRenderer,
	createVueSSRRenderer,
	createSvelteSSRRenderer,
	createSolidSSRRenderer,
} from "./ssr.js";

export type {
	ReactSSRRenderer,
	VueSSRRenderer,
	SvelteSSRRenderer,
	SolidSSRRenderer,
} from "./ssr.js";

// React SSR utilities
export {
	resetHead as resetReactHead,
	getHeadElements as getReactHeadElements,
	addHeadElement as addReactHeadElement,
	title as reactTitle,
	meta as reactMeta,
	link as reactLink,
	script as reactScript,
	style as reactStyle,
	ReactHelmet,
	helmet,
	ssrElementToString as reactSsrElementToString,
} from "./ssr/react.js";

// Vue SSR utilities
export {
	resetHead as resetVueHead,
	getHeadElements as getVueHeadElements,
	addHeadElement as addVueHeadElement,
	VueMeta,
	vueMeta,
	ssrElementToString as vueSsrElementToString,
	useHead as useVueHead,
	createVueSSRContext,
} from "./ssr/vue.js";

// Svelte SSR utilities
export {
	resetHead as resetSvelteHead,
	getHeadElements as getSvelteHeadElements,
	addHeadElement as addSvelteHeadElement,
	getHeadString as getSvelteHeadString,
	SvelteHead,
	svelteHead,
	ssrElementToString as svelteSsrElementToString,
	loadSvelteComponent,
	createSvelteSSRContext,
	SveltePageStore,
	getPageStore,
} from "./ssr/svelte.js";

// Solid SSR utilities
export {
	resetHead as resetSolidHead,
	getHeadElements as getSolidHeadElements,
	addHeadElement as addSolidHeadElement,
	SolidMeta,
	solidMeta,
	ssrElementToString as solidSsrElementToString,
	createSolidSSRContext,
	createRouteData,
	SolidResource,
	createSolidResource,
	NO_HYDRATE,
	noHydrate,
} from "./ssr/solid.js";
// ============= ISR Types =============
export type {
	ISRCacheEntry,
	ISRPageConfig,
	ISRConfig,
	PartialISRConfig,
	ISRRevalidationResult,
	ISRStats,
} from "./types.js";

// ============= ISR =============
export {
	ISRManager,
	createISRManager,
	parseRevalidateHeader,
	generateCacheControlHeader,
	shouldRegenerate,
} from "./isr.js";
// ============= Island Types =============
export type {
	IslandHydrationStrategy,
	IslandConfig,
	IslandDefinition,
	IslandRegistry,
	IslandRenderResult,
	IslandState,
	IslandHydrationScript,
} from "./types.js";

// ============= Islands =============
export {
	IslandManager,
	createIslandManager,
	defineIsland,
	isIslandElement,
	getIslandData,
	getIslandAttributes,
	createIslandElement,
	parseIslandsFromHTML,
	getHydrationPriority,
	sortIslandsByPriority,
} from "./islands.js";
// ============= File Router Types =============
export type {
	RouteType,
	RouteDefinition,
	DynamicRoute,
	RouteMatch,
	RouteHandler,
	RouteMiddleware,
	FileRouterConfig,
	PartialFileRouterConfig,
	FileRouteOptions,
} from "./types.js";

// ============= File Router =============
export {
	FileRouter,
	createFileRouter,
	isDynamicRoute,
	isCatchAllRoute,
	getRouteParams,
	normalizeRoutePath,
	compareRouteSpecificity,
} from "./file-router.js";
// ============= Layout Types =============
export type {
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

// ============= Layout =============
export {
	LayoutManager,
	createLayoutManager,
	isLayoutFile,
	getLayoutSegmentFromPath,
	buildLayoutProps,
	createLayoutSegment,
	mergeLayoutHead,
	layoutTreeToString,
} from "./layout.js";
// ============= API Routes Types =============
export type {
	HTTPMethod,
	APIRouteDefinition,
	APIRouteHandler,
	APIResponse,
	APIMiddleware,
	APIContext,
	APIRouteModule,
	APIRouteConfig,
	PartialAPIRouteConfig,
} from "./types.js";

// ============= API Routes =============
export {
	APIRouteManager,
	createAPIRouteManager,
	// Response helpers
	json,
	text,
	html,
	redirect,
	error,
	notFound,
	unauthorized,
	forbidden,
	badRequest,
	created,
	noContent,
	// Utility functions
	isAPIRouteFile,
	isMiddlewareFile,
	getModuleMethods,
} from "./api-routes.js";