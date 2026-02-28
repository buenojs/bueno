/**
 * GraphQL Module Types
 *
 * Core type definitions for the Bueno GraphQL integration layer.
 */

// ============= Constructor Type =============

export type Constructor<T = unknown> = new (...args: unknown[]) => T;

// ============= Scalar Types =============

/**
 * Represents a GraphQL scalar type via its JS constructor.
 * Usage: () => String, () => Number, () => Boolean, () => GraphQLID
 */
export type GraphQLScalar =
	| StringConstructor
	| NumberConstructor
	| BooleanConstructor
	| typeof GraphQLID
	| typeof GraphQLInt
	| typeof GraphQLFloat;

/**
 * A thunk that returns a type constructor or array of constructors.
 * Used to avoid circular reference issues in type definitions.
 *
 * @example
 * () => String        // GraphQL String scalar
 * () => Number        // GraphQL Float scalar
 * () => [User]        // [User!]! list
 * () => User          // User object type
 */
export type TypeFn = () => Constructor | Constructor[] | GraphQLScalar;

// ============= Scalar Sentinels =============

/**
 * Sentinel class representing GraphQL ID scalar.
 * Usage: @Field(() => GraphQLID)
 */
export class GraphQLID {
	static readonly __type = "ID";
}

/**
 * Sentinel class representing GraphQL Int scalar.
 * Usage: @Field(() => GraphQLInt)
 */
export class GraphQLInt {
	static readonly __type = "Int";
}

/**
 * Sentinel class representing GraphQL Float scalar.
 * Usage: @Field(() => GraphQLFloat)
 */
export class GraphQLFloat {
	static readonly __type = "Float";
}

// ============= Metadata Shapes =============

/** Options for @Field decorator */
export interface FieldDecoratorOptions {
	/** Whether the field can be null (default: false → non-null) */
	nullable?: boolean;
	/** Human-readable description */
	description?: string;
	/** Deprecation reason */
	deprecationReason?: string;
	/** Default value for input types */
	defaultValue?: unknown;
}

/** Options for @Query/@Mutation/@Subscription decorators */
export interface FieldOptions extends FieldDecoratorOptions {
	/** GraphQL field name override (default: method name) */
	name?: string;
}

/** Metadata stored per @Field-decorated property */
export interface FieldMetadata {
	propertyKey: string;
	typeFn: TypeFn;
	nullable: boolean;
	description?: string;
	deprecationReason?: string;
	defaultValue?: unknown;
}

/** Metadata for a single resolver method parameter */
export interface ParamMetadata {
	index: number;
	kind: "args" | "argsObject" | "context";
	/** For @Args('name') — the specific argument name */
	argName?: string;
	/** For @Args('name', InputType) — the input object type */
	inputTypeFn?: TypeFn;
}

/** Metadata stored per @Query/@Mutation/@Subscription method */
export interface ResolverFieldMetadata {
	/** Actual method name on the class */
	methodName: string;
	/** GraphQL field name (defaults to methodName) */
	fieldName: string;
	typeFn: TypeFn;
	kind: "query" | "mutation" | "subscription";
	nullable: boolean;
	description?: string;
	deprecationReason?: string;
	paramMetadata: ParamMetadata[];
}

/** Metadata stored per @Resolver-decorated class */
export interface ResolverClassMetadata {
	/** GraphQL type name (default: class name) */
	name: string;
}

/** Metadata stored per @ObjectType / @InputType class */
export interface TypeClassMetadata {
	name: string;
	kind: "object" | "input";
	description?: string;
}

// ============= Schema Representation =============

/** A single resolvable field in the built schema */
export interface ResolvedField {
	resolverInstance: unknown;
	methodName: string;
	paramMetadata: ParamMetadata[];
	typeFn: TypeFn;
	nullable: boolean;
}

/** Internal schema representation consumed by the built-in engine */
export interface ResolvedSchema {
	queryFields: Map<string, ResolvedField>;
	mutationFields: Map<string, ResolvedField>;
	subscriptionFields: Map<string, ResolvedField>;
}

// ============= GraphQL Context =============

/** Context available inside resolver methods */
export interface GraphQLContext {
	/** The original HTTP Request */
	request: Request;
	/** Authenticated user (set by auth guards via context.set('user', ...)) */
	user?: unknown;
	/** Reference to the HTTP Context for advanced use */
	httpContext: unknown;
	/** Allow arbitrary values */
	[key: string]: unknown;
}

// ============= Execution Results =============

/** A GraphQL error entry in the response */
export interface GraphQLError {
	message: string;
	locations?: Array<{ line: number; column: number }>;
	path?: Array<string | number>;
	extensions?: Record<string, unknown>;
}

/** The GraphQL response envelope */
export interface GraphQLResult {
	data?: Record<string, unknown> | null;
	errors?: GraphQLError[];
}

// ============= Engine Interface =============

/**
 * Pluggable GraphQL execution engine.
 * Implement this interface to use graphql-js, GraphQL Yoga, Mercurius, etc.
 *
 * @example
 * ```typescript
 * import * as graphqlJs from 'graphql';
 * import { GraphQLJsAdapter } from '@buenojs/bueno/graphql';
 *
 * GraphQLModule.setup(app, {
 *   engine: new GraphQLJsAdapter(graphqlJs),
 *   resolvers: [UserResolver],
 * });
 * ```
 */
export interface GraphQLEngine {
	/**
	 * Build the internal schema representation from resolver and type metadata.
	 * Returns an opaque schema object that is passed back to execute().
	 */
	buildSchema(
		resolvers: ResolverFieldsByType,
		types: Map<string, FieldMetadata[]>,
		sdl: string,
	): unknown;

	/**
	 * Execute a GraphQL query or mutation.
	 */
	execute(
		schema: unknown,
		query: string,
		variables: Record<string, unknown>,
		context: GraphQLContext,
		operationName?: string,
	): Promise<GraphQLResult>;

	/**
	 * Execute a GraphQL subscription (optional).
	 * Returns an async generator that yields results.
	 */
	subscribe?(
		schema: unknown,
		query: string,
		variables: Record<string, unknown>,
		context: GraphQLContext,
		operationName?: string,
	): Promise<AsyncGenerator<GraphQLResult>>;

	/**
	 * Whether this engine supports introspection queries.
	 * Used to determine if the GraphQL Playground should be enabled.
	 */
	readonly supportsIntrospection: boolean;

	/**
	 * Whether this engine supports subscriptions.
	 */
	readonly supportsSubscriptions: boolean;
}

/** Resolver fields organized by root type */
export interface ResolverFieldsByType {
	queries: Map<string, ResolvedField>;
	mutations: Map<string, ResolvedField>;
	subscriptions: Map<string, ResolvedField>;
}

// ============= Module Options =============

/**
 * Options passed to GraphQLModule.setup()
 */
export interface GraphQLModuleOptions {
	/**
	 * Resolver classes to register.
	 * Dependencies are resolved from the DI container.
	 */
	resolvers: Constructor[];

	/**
	 * GraphQL engine adapter (default: built-in lightweight engine).
	 * Use GraphQLJsAdapter for full spec compliance.
	 */
	engine?: GraphQLEngine;

	/**
	 * HTTP path for the GraphQL endpoint (default: '/graphql').
	 */
	path?: string;

	/**
	 * Enable GraphiQL playground UI at GET <path>.
	 * Default: true when using an engine with supportsIntrospection,
	 *          false when using the built-in engine.
	 * Set to true to force-enable even with the built-in engine (with warning).
	 */
	playground?: boolean;

	/**
	 * Serve the SDL at GET <path>/schema (default: true).
	 */
	introspection?: boolean;

	/**
	 * Enable WebSocket subscriptions (default: false).
	 * Requires an engine with supportsSubscriptions.
	 */
	subscriptions?: boolean;

	/**
	 * Sync @Field metadata to the OpenAPI property store (default: false).
	 * Enables unified types: one class works for both GraphQL and REST/OpenAPI.
	 * Requires @buenojs/bueno/openapi to be in scope.
	 */
	syncOpenAPI?: boolean;

	/** Maximum query complexity score (default: 1000) */
	complexityLimit?: number;

	/** Maximum query depth (default: 10) */
	maxDepth?: number;
}

// ============= Config Interface =============

/**
 * GraphQL configuration added to BuenoConfig.
 */
export interface GraphQLConfig {
	/** Enable GraphQL support (default: false) */
	enabled?: boolean;
	/** HTTP path (default: '/graphql') */
	path?: string;
	/** Enable playground (default: auto) */
	playground?: boolean;
	/** Enable introspection SDL endpoint (default: true) */
	introspection?: boolean;
	/** Maximum query complexity (default: 1000) */
	complexityLimit?: number;
	/** Maximum query depth (default: 10) */
	maxDepth?: number;
	/** Enable subscriptions (default: false) */
	subscriptions?: boolean;
}
