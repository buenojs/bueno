/**
 * GraphQL Execution Pipeline
 *
 * Applies the same guard/interceptor pipeline used for HTTP controllers
 * to GraphQL resolver methods.
 *
 * Guards and interceptors receive the real HTTP Context, enriched with
 * GraphQL-specific metadata:
 * - context.get('graphql:operation') → resolver field name (e.g. 'users')
 * - context.get('graphql:type')      → 'query' | 'mutation' | 'subscription'
 * - context.get('graphql:resolver')  → resolver class constructor
 *
 * ## Guard Compatibility
 * - ✅ Auth guards reading Authorization/Cookie headers
 * - ✅ API key guards
 * - ✅ Custom guards reading any header/cookie
 * - ⚠️  Route-based guards (reading context.path) — see /graphql for all ops
 * - ⚠️  CSRF guards (may block all POSTs) — need graphql-aware adaptation
 */

import type { Context } from "../context";
import type { Container, Token } from "../container";
import type { Guard, CanActivate, GuardFn } from "../modules/guards";
import type { Interceptor, NestInterceptor, InterceptorFn } from "../modules/interceptors";
import type { GraphQLContext, ResolvedField, GraphQLError } from "./types";
import {
	executeGuards,
	getClassGuards,
	getMethodGuards,
} from "../modules/guards";
import {
	executeInterceptors,
	getClassInterceptors,
	getMethodInterceptors,
	isNestInterceptor,
	isInterceptorFn,
} from "../modules/interceptors";
import { enrichContextForGraphQL } from "./context-builder";

export type { Guard, Interceptor };

// ============= Pipeline Options =============

export interface ResolverPipelineOptions {
	/** The resolver class constructor (for reading class-level guard metadata) */
	resolverClass: new (...args: unknown[]) => unknown;
	/** Field name (for reading method-level guard metadata) */
	fieldName: string;
	/** The resolved field descriptor */
	resolvedField: ResolvedField;
	/** GraphQL arguments extracted from the query */
	args: Record<string, unknown>;
	/** Built GraphQL context */
	graphqlContext: GraphQLContext;
	/** HTTP Context from the current request */
	httpContext: Context;
	/** DI container for resolving guard/interceptor instances */
	container: Container;
	/** Global guards from app.getGlobalGuards() */
	globalGuards: Guard[];
	/** Global interceptors from app.getGlobalInterceptors() */
	globalInterceptors: Interceptor[];
	/** Operation type for enriching context */
	operationType: "query" | "mutation" | "subscription";
}

// ============= Pipeline Executor =============

/**
 * Execute a resolver method through the full guard → interceptor pipeline.
 *
 * Returns the resolver method's return value, or throws if a guard blocks.
 * GraphQL errors should be caught by the caller and placed into the errors array.
 */
export async function executeResolverWithPipeline(
	options: ResolverPipelineOptions,
): Promise<unknown> {
	const {
		resolverClass,
		fieldName,
		resolvedField,
		args,
		graphqlContext,
		httpContext,
		container,
		globalGuards,
		globalInterceptors,
		operationType,
	} = options;

	// Enrich HTTP context with GraphQL metadata for guard inspection
	enrichContextForGraphQL(
		httpContext,
		fieldName,
		operationType,
		resolverClass,
	);

	// Read class-level and method-level guards/interceptors
	const classGuards = getClassGuards(resolverClass) ?? [];
	const methodGuards = getMethodGuards(resolverClass.prototype as object, fieldName) ?? [];
	const classInterceptors = getClassInterceptors(resolverClass) ?? [];
	const methodInterceptors =
		getMethodInterceptors(resolverClass.prototype as object, fieldName) ?? [];

	// Guard resolver helper
	const resolveGuard = (guard: Guard): CanActivate | GuardFn | null => {
		if (
			typeof guard === "object" &&
			guard !== null &&
			!("canActivate" in guard)
		) {
			try {
				return container.resolve(guard as Token) as CanActivate;
			} catch {
				return null;
			}
		}
		return null;
	};

	// Interceptor resolver helper
	const resolveInterceptor = (
		interceptor: Interceptor,
	): NestInterceptor | InterceptorFn | null => {
		if (!isNestInterceptor(interceptor) && !isInterceptorFn(interceptor)) {
			try {
				return container.resolve(
					interceptor as Token,
				) as NestInterceptor;
			} catch {
				return null;
			}
		}
		return null;
	};

	// Step 1: Execute guards
	const guardsPassed = await executeGuards(httpContext, {
		globalGuards,
		classGuards,
		methodGuards,
		resolveGuard,
	});

	if (!guardsPassed) {
		throw new GraphQLForbiddenError(
			`Access denied to field '${fieldName}'`,
		);
	}

	// Step 2: Execute interceptors wrapping the resolver call
	return executeInterceptors(
		httpContext,
		async () => {
			return callResolver(resolvedField, args, graphqlContext);
		},
		{
			globalInterceptors,
			classInterceptors,
			methodInterceptors,
			resolveInterceptor,
		},
	);
}

// ============= Resolver Caller =============

/**
 * Calls the actual resolver method with the correct argument list.
 * Resolves @Args and @GqlContext parameters at their declared positions.
 */
export async function callResolver(
	field: ResolvedField,
	args: Record<string, unknown>,
	gqlContext: GraphQLContext,
): Promise<unknown> {
	const instance = field.resolverInstance as Record<
		string,
		(...a: unknown[]) => unknown
	>;
	const methodArgs = buildMethodArgs(field, args, gqlContext);
	const result = instance[field.methodName](...methodArgs);
	return result instanceof Promise ? await result : result;
}

function buildMethodArgs(
	field: ResolvedField,
	args: Record<string, unknown>,
	gqlContext: GraphQLContext,
): unknown[] {
	const methodArgs: unknown[] = [];

	for (const param of field.paramMetadata) {
		switch (param.kind) {
			case "context":
				methodArgs[param.index] = gqlContext;
				break;
			case "args":
				methodArgs[param.index] = param.argName ? args[param.argName] : args;
				break;
			case "argsObject":
				methodArgs[param.index] = param.argName ? args[param.argName] : args;
				break;
		}
	}

	return methodArgs;
}

// ============= Custom Error =============

export class GraphQLForbiddenError extends Error {
	readonly extensions = { code: "FORBIDDEN" };

	constructor(message = "Forbidden") {
		super(message);
		this.name = "GraphQLForbiddenError";
	}

	toGraphQLError(): GraphQLError {
		return {
			message: this.message,
			extensions: this.extensions,
		};
	}
}
