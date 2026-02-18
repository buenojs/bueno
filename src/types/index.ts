/**
 * Core type definitions for Bueno Framework
 */

// ============= HTTP Types =============

export type HTTPMethod =
	| "GET"
	| "POST"
	| "PUT"
	| "PATCH"
	| "DELETE"
	| "HEAD"
	| "OPTIONS";

export type StatusCode =
	| 200
	| 201
	| 202
	| 204
	| 301
	| 302
	| 303
	| 307
	| 308
	| 400
	| 401
	| 403
	| 404
	| 405
	| 409
	| 422
	| 429
	| 500
	| 502
	| 503
	| 504;

// ============= Route Types =============

export type PathParams = Record<string, string>;

export type RouteHandler<T = unknown, C = unknown> = (
	context: C,
) => T | Promise<T>;

export type RoutePath = string;

export interface RouteDefinition {
	method: HTTPMethod;
	path: RoutePath;
	handler: RouteHandler;
	middleware?: MiddlewareHandler[];
}

// ============= Middleware Types =============

export type MiddlewareHandler<T = unknown> = (
	context: unknown,
	next: () => Promise<unknown>,
) => T | Promise<T>;

export type MiddlewareChain = MiddlewareHandler[];

/**
 * Typed middleware function that receives a Context
 */
export type Middleware<T = Response> = (
	context: import("../context").Context,
	next: () => Promise<Response>,
) => T | Promise<T>;

// ============= DI Types =============

export type Token<T = unknown> =
	| string
	| symbol
	| (abstract new (
			...args: unknown[]
	  ) => T);

export interface Provider<T = unknown> {
	token: Token<T>;
	useClass?: abstract new (...args: unknown[]) => T;
	useValue?: T;
	useFactory?: (...args: unknown[]) => T | Promise<T>;
	inject?: Token[];
	scope?: "singleton" | "transient" | "request";
}

export interface ModuleMetadata {
	imports?: Token[];
	providers?: Provider[];
	controllers?: Token[];
	exports?: Token[];
}

// ============= Context Types =============

export interface ContextVariableMap {
	[key: string]: unknown;
}

export interface ContextDefaults {
	status: StatusCode;
	headers: Headers;
}

// ============= Standard Schema Types (v1 spec) =============

/**
 * Standard Schema v1 interface
 * Works with Zod 4, Valibot v1, ArkType, Typia, and any Standard Schema compliant validator
 */
export interface StandardSchema<Input = unknown, Output = Input> {
	readonly "~standard": {
		readonly version: 1;
		readonly vendor: string;
		readonly validate: (
			value: unknown,
			options?: StandardSchemaOptions,
		) => StandardResult<Output> | Promise<StandardResult<Output>>;
		readonly types?: StandardTypes<Input, Output>;
	};
}

export interface StandardSchemaOptions {
	readonly libraryOptions?: Record<string, unknown>;
}

export interface StandardTypes<Input = unknown, Output = Input> {
	readonly input: Input;
	readonly output: Output;
}

export type StandardResult<Output> =
	| StandardSuccessResult<Output>
	| StandardFailureResult;

export interface StandardSuccessResult<Output> {
	readonly value: Output;
	readonly issues?: undefined;
}

export interface StandardFailureResult {
	readonly issues: ReadonlyArray<StandardIssue>;
}

export interface StandardIssue {
	readonly message: string;
	readonly path?: ReadonlyArray<PropertyKey | StandardPathSegment>;
}

export interface StandardPathSegment {
	readonly key: PropertyKey;
}

export type ValidationTarget =
	| "body"
	| "query"
	| "params"
	| "headers"
	| "cookies";

// Type utilities
export type InferInput<Schema extends StandardSchema> = NonNullable<
	Schema["~standard"]["types"]
>["input"];
export type InferOutput<Schema extends StandardSchema> = NonNullable<
	Schema["~standard"]["types"]
>["output"];

// ============= Database Types =============

export type DatabaseDriver = "postgresql" | "mysql" | "sqlite";

export interface DatabaseConfig {
	url: string;
	pool?: {
		min?: number;
		max?: number;
	};
}

// ============= Server Types =============

export interface ServerConfig {
	port?: number;
	hostname?: string;
	development?: {
		hmr?: boolean;
		console?: boolean;
	};
}

export interface AppOptions {
	server?: ServerConfig;
	database?: DatabaseConfig;
}

// ============= RPC Types =============

export interface RPCClientConfig {
	baseUrl: string;
	headers?: Record<string, string>;
}

// ============= Error Types =============

export class BuenoError extends Error {
	constructor(
		message: string,
		public statusCode: StatusCode = 500,
		public code?: string,
	) {
		super(message);
		this.name = "BuenoError";
	}
}

export class ValidationError extends BuenoError {
	constructor(
		message: string,
		public issues: StandardIssue[],
	) {
		super(message, 422, "VALIDATION_ERROR");
		this.name = "ValidationError";
	}
}

export class NotFoundError extends BuenoError {
	constructor(message = "Not Found") {
		super(message, 404, "NOT_FOUND");
		this.name = "NotFoundError";
	}
}
