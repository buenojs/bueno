/**
 * Bueno Framework
 *
 * A Bun-Native Full-Stack Framework
 */

// Version
export const VERSION = "0.1.0";

// Core
export {
	Container,
	createToken,
	Injectable,
	Inject,
} from "./container";
export type { Provider, Token } from "./container";
export { Router, generateUrl } from "./router";
export { Context, createContext } from "./context";
export {
	compose,
	createPipeline,
	type Middleware,
	type Handler,
} from "./middleware";

// Built-in Middleware
export {
	logger,
	cors,
	requestId,
	timing,
	securityHeaders,
	rateLimit,
	compression,
} from "./middleware/built-in";

// Modules
export {
	Module,
	Controller,
	Injectable as ModuleInjectable,
	Inject as ModuleInject,
	Get,
	Post,
	Put,
	Patch,
	Delete,
	Head,
	Options,
	AppModule,
	Application,
	createApp,
} from "./modules";

// Database
export {
	Database,
	createConnection,
	detectDriver,
	QueryBuilder,
	table,
	ReservedConnection,
	type DatabaseConfig as DatabaseConfigType,
	type DatabaseDriver,
	type QueryResult,
	type Transaction,
	// Schema
	SchemaBuilder,
	createSchema,
	defineTable,
	generateCreateTable,
	generateDropTable,
	generateCreateIndex,
	type ColumnType,
	type ColumnOptions,
	type TableSchema,
	type IndexDefinition,
	type ConstraintDefinition,
	type TypeScriptType,
	type InferType,
	type InferInsertType,
	// Migrations
	MigrationRunner,
	MigrationBuilder,
	createMigration,
	createMigrationRunner,
	generateMigrationId,
	type Migration,
	type MigrationRecord,
	type MigrationOptions,
} from "./database";

// Validation
export {
	validate,
	validateSync,
	validateBody,
	validateQuery,
	validateParams,
	validateHeaders,
	createValidator,
	WithBody,
	WithQuery,
	isStandardSchema,
	assertStandardSchema,
	type ValidationResult,
	type ValidatorOptions,
} from "./validation";

// Security
export {
	Password,
	JWT,
	CSRF,
	createAuthMiddleware,
	createRBACMiddleware,
	createAPIKeyMiddleware,
} from "./security";

// RPC
export {
	RPCClient,
	createRPClient,
	bc,
	extractRouteTypes,
	parseJSON,
	parseText,
	isOK,
	isStatus,
	throwIfNotOK,
} from "./rpc";

// Cache
export {
	Cache,
	SessionStore,
	createCache,
	createSessionStore,
} from "./cache";

// Distributed Lock
export {
	DistributedLock,
	LockAcquireError,
	LockTimeoutError,
	createDistributedLock,
	createRedisLock,
	createMemoryLock,
	getDefaultLock,
	setDefaultLock,
	lock,
	type LockConfig,
	type LockOptions,
	type Lock,
	type LockHandle,
} from "./lock";

// SSG
export {
	SSG,
	createSSG,
	parseMarkdown,
	parseFrontmatter,
	type Frontmatter,
	type Page,
	type SSGConfig,
	type LayoutContext,
	type SiteConfig,
} from "./ssg";

// Storage
export {
	Storage,
	createStorage,
	Secrets,
	type StorageConfig,
	type UploadOptions,
	type DownloadOptions,
	type FileInfo,
	type ListOptions,
	type ListResult,
	type PresignedURLOptions,
	type SecretOptions,
	type SetSecretOptions,
} from "./storage";

// Testing
export {
	AppTester,
	createTester,
	createTestRequest,
	createTestResponse,
	createMockContext,
	createMockContextWithParams,
	assertStatus,
	assertOK,
	assertJSON,
	assertBody,
	assertHeader,
	assertRedirect,
	snapshotResponse,
	FixtureFactory,
	createFixtureFactory,
	waitFor,
	sleep,
	type TestRequestOptions,
	type TestResponse,
} from "./testing";

// WebSocket
export {
	WebSocketServer,
	WebSocketClient,
	PubSub,
	createWebSocketServer,
	createWebSocketClient,
	createPubSub,
	createRedisPubSub,
	createMemoryPubSub,
	isWebSocketRequest,
	generateConnectionId,
	createWebSocketData,
	type WebSocketData,
	type WebSocketMessage,
	type WebSocketOptions,
	type WebSocketHandler,
	type OpenHandler,
	type CloseHandler,
	type ErrorHandler,
	type WebSocketServerOptions,
	type WebSocketClientOptions,
	type PubSubConfig,
	type PubSubMessage,
	type PubSubCallback,
} from "./websocket";

// Logger
export {
	Logger,
	PerformanceLogger,
	createLogger,
	createRequestLogger,
	getLogger,
	setLogger,
	type LogLevel,
	type LogEntry,
	type LoggerConfig as LoggerConfigType,
	type LoggerContext,
} from "./logger";

// Health Check
export {
	HealthCheckManager,
	createHealthMiddleware,
	createHealthManager,
	createDatabaseCheck,
	createCacheCheck,
	createCustomCheck,
	createTCPCheck,
	createHTTPCheck,
	type HealthStatus,
	type CheckResult,
	type HealthCheckResult,
	type HealthCheckFn,
	type CheckOptions,
	type HealthMiddlewareOptions,
	type DatabaseLike,
	type CacheLike,
} from "./health";

// Types
export type {
	HTTPMethod,
	StatusCode,
	PathParams,
	RouteHandler,
	MiddlewareHandler,
	RouteDefinition,
	ModuleMetadata,
	ContextVariableMap,
	StandardSchema,
	StandardIssue,
	ServerConfig,
	AppOptions,
	BuenoError,
	ValidationError,
	NotFoundError,
	StandardResult,
	StandardTypes,
	InferInput,
	InferOutput,
} from "./types";

// Configuration
export {
	ConfigManager,
	defineConfig,
	defineConfigFn,
	createConfigManager,
	createConfigManagerSync,
	loadConfigDirect,
	getConfigManager,
	setConfigManager,
	type ConfigManagerOptions,
	type ConfigChangeCallback,
} from "./config";
export {
	loadConfig,
	loadConfigFile,
	loadConfigFiles,
	findConfigFile,
	clearConfigCache,
	getCachedConfig,
	watchConfig,
	validateConfigStructure,
	getConfigPathFromArgs,
	getConfigPathFromEnv,
	type LoadedConfig,
} from "./config";
export {
	loadEnv,
	getEnvConfig,
	getEnvValue,
	setEnvValue,
	envConfigMapping,
	type EnvConfigMapping,
} from "./config";
export {
	validateConfig,
	validateConfigSync,
	validateConfigDefaults,
	validateWithSchema,
	assertValidConfig,
	formatValidationErrors,
	createConfigError,
	createCustomValidator,
	isStandardSchema as isConfigStandardSchema,
	type ConfigValidationResult,
	type ConfigValidationError,
	type ConfigValidationWarning,
} from "./config";
export {
	deepMerge,
	mergeConfigs,
	isObject,
} from "./config";
export type {
	BuenoConfig,
	ServerConfig as BuenoServerConfig,
	DatabaseConfig,
	CacheConfig,
	LoggerConfig,
	HealthConfig,
	MetricsConfig,
	TelemetryConfig,
	FrontendConfig,
	DeepPartial,
	UserConfig,
	UserConfigFn,
	InferConfig,
} from "./config";

import { Context } from "./context";
import { type Middleware, compose } from "./middleware";
// Quick Start Helper
import { Router } from "./router";

export function createServer(options?: {
	port?: number;
	hostname?: string;
}) {
	const router = new Router();

	return {
		router,
		async listen(
			port = options?.port ?? 3000,
			hostname = options?.hostname ?? "localhost",
		) {
			const server = Bun.serve({
				port,
				hostname,
				fetch: async (request: Request): Promise<Response> => {
					const url = new URL(request.url);
					const match = router.match(request.method as "GET", url.pathname);

					if (!match) {
						return new Response("Not Found", { status: 404 });
					}

					const context = new Context(request, match.params);

					if (match.middleware && match.middleware.length > 0) {
						const pipeline = compose(match.middleware as Middleware[]);
						return pipeline(
							context,
							async () => match.handler(context) as Response,
						);
					}

					return match.handler(context) as Response;
				},
			});

			console.log(`Bueno server running at http://${hostname}:${port}`);
			return server;
		},
	};
}
