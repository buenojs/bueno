/**
 * Bueno ORM
 *
 * Eloquent-inspired ORM for the Bueno framework.
 * Provides Model, QueryBuilder, relationships, and lifecycle management.
 */

// ============= Query Builder =============
export { OrmQueryBuilder, query } from "./builder";
export type { PaginationResult } from "./builder";

// ============= Model =============
export {
	Model,
	ModelNotFoundError,
	ModelOperationAbortedError,
	ModelQueryBuilder,
} from "./model";

// ============= Registry =============
export {
	setDefaultDatabase,
	getDefaultDatabase,
	registerModelDatabase,
	getModelDatabase,
	clearModelDatabaseRegistry,
	clearDefaultDatabase,
} from "./model-registry";

// ============= Relationships =============
export {
	Relationship,
	HasOne,
	HasMany,
	BelongsTo,
	BelongsToMany,
} from "./relationships";
export type { RelationshipOptions } from "./relationships/base";

// ============= Casts =============
export { CastRegistry } from "./casts";
export type { CastDefinition, CastObject, BuiltInCastName } from "./casts";

// ============= Scopes =============
export { ScopeRegistry, SoftDeleteScope } from "./scopes";
export type { ScopeDefinition } from "./scopes";

// ============= Hooks =============
export { HookRunner } from "./hooks";
export type { ModelHookName, ModelHookCallback } from "./hooks";

// ============= Compiler (advanced usage) =============
export { QueryCompiler } from "./compiler";
export type {
	SqlDialect,
	CompiledQuery,
	WhereClause,
	OrderClause,
	JoinClause,
	QueryState,
} from "./compiler";
