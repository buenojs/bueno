/**
 * GraphQL Context Builder
 *
 * Builds the GraphQL context from an HTTP Context and enriches
 * the HTTP context with GraphQL-specific metadata for guards/interceptors.
 */

import type { Context } from "../context";
import type { GraphQLContext } from "./types";

/**
 * Builds a GraphQL context from an HTTP Context.
 * Extracts user, request, and exposes the raw httpContext.
 */
export function buildGraphQLContext(httpContext: Context): GraphQLContext {
	return {
		request: httpContext.req,
		user: httpContext.get("user"),
		httpContext,
	};
}

/**
 * Enriches the HTTP context with GraphQL-specific metadata.
 * This allows guards and interceptors to inspect GraphQL operation details.
 *
 * Guards that read context.get('graphql:operation') can make operation-specific decisions.
 * Guards that read context.get('graphql:type') can differentiate queries vs mutations.
 *
 * @example Guard usage:
 * ```typescript
 * class MyGuard implements CanActivate {
 *   canActivate(context: Context): boolean {
 *     const op = context.get('graphql:type');
 *     if (op === 'mutation') {
 *       return !!context.req.headers.get('Authorization');
 *     }
 *     return true; // Queries are public
 *   }
 * }
 * ```
 */
export function enrichContextForGraphQL(
	httpContext: Context,
	operationName: string,
	operationType: "query" | "mutation" | "subscription",
	resolverClass: new (...args: unknown[]) => unknown,
): void {
	httpContext.set("graphql:operation", operationName);
	httpContext.set("graphql:type", operationType);
	httpContext.set("graphql:resolverClass", resolverClass);
}

/**
 * Extracts the parsed request body for GraphQL.
 * Handles both JSON body and GET query string (for playground requests).
 */
export async function parseGraphQLRequest(request: Request): Promise<{
	query: string;
	variables: Record<string, unknown>;
	operationName?: string;
} | null> {
	if (request.method === "POST") {
		try {
			const body = await request.clone().json() as {
				query?: unknown;
				variables?: unknown;
				operationName?: unknown;
			};
			if (typeof body.query !== "string") {
				return null;
			}
			return {
				query: body.query,
				variables:
					typeof body.variables === "object" && body.variables !== null
						? (body.variables as Record<string, unknown>)
						: {},
				operationName:
					typeof body.operationName === "string"
						? body.operationName
						: undefined,
			};
		} catch {
			return null;
		}
	}

	if (request.method === "GET") {
		const url = new URL(request.url);
		const query = url.searchParams.get("query");
		if (!query) return null;
		const varsStr = url.searchParams.get("variables");
		let variables: Record<string, unknown> = {};
		if (varsStr) {
			try {
				variables = JSON.parse(varsStr) as Record<string, unknown>;
			} catch {
				// ignore parse error
			}
		}
		return {
			query,
			variables,
			operationName: url.searchParams.get("operationName") ?? undefined,
		};
	}

	return null;
}
