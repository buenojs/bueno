/**
 * GraphQL Module for Bueno Framework
 *
 * Code-first GraphQL support with:
 * - Decorator-based schema definition (@Resolver, @Query, @Mutation, @ObjectType, @Field, etc.)
 * - Full DI integration (guards, interceptors work on resolvers)
 * - Pluggable engine (built-in lightweight engine or graphql-js/Yoga via adapter)
 * - Subscriptions via WebSocket (graphql-transport-ws protocol)
 * - GraphiQL playground
 * - Unified types: one class for both GraphQL and REST/OpenAPI (opt-in)
 *
 * @example
 * ```typescript
 * import { createApp } from '@buenojs/bueno';
 * import {
 *   GraphQLModule,
 *   Resolver, Query, Mutation,
 *   ObjectType, InputType, Field,
 *   Args, GqlContext,
 * } from '@buenojs/bueno/graphql';
 *
 * @ObjectType()
 * class User {
 *   @Field(() => String) id: string;
 *   @Field(() => String) name: string;
 * }
 *
 * @Resolver()
 * class UserResolver {
 *   @Query(() => [User])
 *   users(): User[] { return []; }
 * }
 *
 * const app = createApp(AppModule);
 * GraphQLModule.setup(app, { resolvers: [UserResolver] });
 * await app.listen(3000);
 * ```
 */

// ============= Module Setup =============

export { GraphQLModule, GraphQLModuleInstance } from "./graphql-module";

// ============= Engines =============

export { BuiltinGraphQLEngine } from "./built-in-engine";

// ============= Decorators =============

export {
	Resolver,
	ObjectType,
	InputType,
	Field,
	Query,
	Mutation,
	Subscription,
	Args,
	GqlContext,
} from "./decorators";

// ============= Scalar Sentinels =============

export { GraphQLID, GraphQLInt, GraphQLFloat } from "./types";

// ============= Types =============

export type {
	GraphQLEngine,
	GraphQLContext,
	GraphQLResult,
	GraphQLError,
	GraphQLModuleOptions,
	GraphQLConfig,
	TypeFn,
	FieldDecoratorOptions,
	FieldOptions,
	FieldMetadata,
	ResolverFieldMetadata,
	ParamMetadata,
	ResolvedField,
	ResolvedSchema,
	ResolverFieldsByType,
	Constructor,
} from "./types";

// ============= Schema =============

export { SchemaBuilder } from "./schema-builder";

// ============= Context =============

export { buildGraphQLContext } from "./context-builder";

// ============= Pipeline =============

export { GraphQLForbiddenError } from "./execution-pipeline";

// ============= Subscriptions =============

export { SubscriptionHandler } from "./subscription-handler";
