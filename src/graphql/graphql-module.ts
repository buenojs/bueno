/**
 * GraphQL Module
 *
 * Static factory class for setting up GraphQL support in a Bueno application.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createApp } from '@buenojs/bueno';
 * import { GraphQLModule } from '@buenojs/bueno/graphql';
 *
 * const app = createApp(AppModule);
 *
 * GraphQLModule.setup(app, {
 *   resolvers: [UserResolver, PostResolver],
 *   playground: true,
 *   subscriptions: true,
 * });
 *
 * await app.listen(3000);
 * ```
 *
 * ## Resolver Dependencies
 * Resolvers are instantiated after app.init() via deferred initialization.
 * Dependencies registered in @Module({ providers }) are available automatically.
 *
 * ## Guard/Interceptor Compatibility
 * Guards and interceptors receive the HTTP Context enriched with GraphQL metadata:
 * - context.get('graphql:operation') → field name being resolved
 * - context.get('graphql:type')      → 'query' | 'mutation' | 'subscription'
 * Works with: auth guards, API key guards, logging interceptors.
 * May need adaptation: CSRF guards (all GraphQL = POST), route-based guards.
 */

import type { Application } from "../modules";
import type { Constructor } from "./types";
import type { GraphQLModuleOptions, GraphQLEngine } from "./types";
import {
	getInjectTokens,
	resolveForwardRef,
	type Token,
} from "../container";
import { SchemaBuilder, getRegisteredTypeClasses } from "./schema-builder";
import { BuiltinGraphQLEngine } from "./built-in-engine";
import { SubscriptionHandler } from "./subscription-handler";
import { buildGraphQLContext, parseGraphQLRequest } from "./context-builder";
import { executeResolverWithPipeline, GraphQLForbiddenError } from "./execution-pipeline";
import type { GraphQLResult, ResolvedSchema, ResolverFieldsByType } from "./types";
import { Context } from "../context";

// ============= Playground HTML =============

function generatePlaygroundHTML(path: string): string {
	return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GraphQL Playground</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/graphiql@3/graphiql.min.css" />
  <style>body { margin: 0; }</style>
</head>
<body>
  <div id="graphiql" style="height:100vh;"></div>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/graphiql@3/graphiql.min.js"></script>
  <script>
    const root = ReactDOM.createRoot(document.getElementById('graphiql'));
    root.render(React.createElement(GraphiQL, {
      fetcher: GraphiQL.createFetcher({ url: '${path}' }),
    }));
  </script>
</body>
</html>`;
}

// ============= GraphQL Module Instance =============

export class GraphQLModuleInstance {
	constructor(
		readonly sdl: string,
		readonly resolvedSchema: ResolvedSchema,
		readonly path: string,
	) {}
}

// ============= Deferred Initializer =============

/**
 * Handles deferred resolver initialization.
 * Resolvers can only be instantiated after app.init() completes
 * (all DI providers must be registered and resolved first).
 *
 * The route handler calls ensureInitialized() on first request,
 * which is always after app.init() has completed.
 */
class DeferredInitializer {
	private initialized = false;
	private initPromise: Promise<void> | null = null;
	private initError: Error | null = null;

	resolverInstances = new Map<Constructor, unknown>();
	resolverFields: ResolverFieldsByType | null = null;
	resolvedSchema: ResolvedSchema | null = null;
	sdl = "";
	engineSchema: unknown = null;

	constructor(
		private resolverClasses: Constructor[],
		private app: Application,
		private engine: GraphQLEngine,
	) {}

	async ensureInitialized(): Promise<void> {
		if (this.initialized) {
			if (this.initError) throw this.initError;
			return;
		}
		if (this.initPromise) {
			await this.initPromise;
			if (this.initError) throw this.initError;
			return;
		}
		this.initPromise = this.initialize();
		await this.initPromise;
		if (this.initError) throw this.initError;
	}

	private async initialize(): Promise<void> {
		try {
			// Instantiate resolvers via DI (same pattern as registerController)
			for (const ResolverClass of this.resolverClasses) {
				if (this.resolverInstances.has(ResolverClass)) continue;

				// Register in container if not already present
				const token = ResolverClass as unknown as Token;
				if (!this.app.container.has(token)) {
					this.app.container.register({
						token,
						useClass: ResolverClass,
					});
				}

				// Resolve inject tokens from @Inject decorators
				const injectTokens =
					getInjectTokens<Array<Token>>(ResolverClass, "inject:tokens") ?? [];

				const deps = injectTokens.map((t) => {
					const resolved = resolveForwardRef(t);
					return this.app.container.resolve(resolved as Token);
				});

				const instance = new ResolverClass(...deps);
				this.resolverInstances.set(ResolverClass, instance);
			}

			// Build schema
			const builder = new SchemaBuilder(
				this.resolverClasses,
				this.resolverInstances,
			);
			const { sdl, resolvedSchema, resolverFields, typeFields } = builder.build();

			this.sdl = sdl;
			this.resolvedSchema = resolvedSchema;
			this.resolverFields = resolverFields;
			this.engineSchema = this.engine.buildSchema(resolverFields, typeFields, sdl);
			this.initialized = true;
		} catch (err) {
			this.initError = err instanceof Error ? err : new Error(String(err));
			throw this.initError;
		}
	}
}

// ============= GraphQL Module =============

export class GraphQLModule {
	/**
	 * Set up the GraphQL module on a Bueno application.
	 *
	 * Registers:
	 * - POST <path>    — GraphQL query/mutation endpoint
	 * - GET  <path>    — GraphiQL playground (if enabled)
	 * - GET  <path>/schema — SDL endpoint (if introspection enabled)
	 *
	 * @param app - The Bueno Application instance
	 * @param options - GraphQL configuration
	 * @returns GraphQLModuleInstance (access .sdl after first request)
	 */
	static setup(
		app: Application,
		options: GraphQLModuleOptions,
	): GraphQLModuleInstance {
		const engine: GraphQLEngine = options.engine ?? new BuiltinGraphQLEngine();
		const path = options.path ?? "/graphql";
		const introspection = options.introspection !== false;

		// Determine playground: only auto-enable with engines that support introspection
		const playgroundEnabled =
			options.playground !== undefined
				? options.playground
				: engine.supportsIntrospection;

		if (options.playground === true && !engine.supportsIntrospection) {
			console.warn(
				"[GraphQL] Playground enabled but the built-in engine does not support " +
				"introspection. GraphiQL will not work correctly. " +
				"Use GraphQLJsAdapter for full playground support.",
			);
		}

		// Deferred initializer (resolvers instantiated after app.init())
		const initializer = new DeferredInitializer(options.resolvers, app, engine);

		// ── POST <path> — Query / Mutation handler ──
		app.router.post(path, async (httpContext: Context) => {
			// Parse request body
			const parsed = await parseGraphQLRequest(httpContext.req);
			if (!parsed) {
				return httpContext.json(
					{
						errors: [{ message: "Invalid GraphQL request: expected JSON body with 'query' field" }],
					},
					{ status: 400 },
				);
			}

			// Lazy initialize resolvers (only on first request, after app.init())
			try {
				await initializer.ensureInitialized();
			} catch (err) {
				return httpContext.json({
					errors: [{ message: `GraphQL initialization failed: ${(err as Error).message}` }],
				});
			}

			const gqlContext = buildGraphQLContext(httpContext);
			const schema = initializer.engineSchema;
			const fields = initializer.resolverFields!;

			// Determine operation type from query string
			const trimmed = parsed.query.trim();
			const isMutation = trimmed.startsWith("mutation");
			const operationType = isMutation ? "mutation" : "query";
			const operationFields = isMutation ? fields.mutations : fields.queries;

			// Execute with engine (which calls resolvers via execution pipeline)
			// We wrap the engine execution to run guards/interceptors per field
			let result: GraphQLResult;
			try {
				result = await GraphQLModule.executeWithPipeline(
					engine,
					schema,
					parsed,
					gqlContext,
					httpContext,
					operationFields,
					operationType,
					isMutation ? "mutation" : "query",
					options,
					app,
				);
			} catch (err) {
				result = {
					errors: [{ message: (err as Error).message }],
				};
			}

			return httpContext.json(result);
		});

		// ── GET <path>/schema — SDL endpoint ──
		if (introspection) {
			app.router.get(`${path}/schema`, async (httpContext: Context) => {
				await initializer.ensureInitialized().catch(() => {});
				return httpContext.text(initializer.sdl || "# Schema not yet initialized");
			});
		}

		// ── GET <path> — Playground ──
		if (playgroundEnabled) {
			app.router.get(path, (httpContext: Context) => {
				return httpContext.html(generatePlaygroundHTML(path));
			});
		}

		// ── Subscriptions ──
		if (options.subscriptions) {
			if (!engine.supportsSubscriptions) {
				console.warn(
					"[GraphQL] subscriptions: true but the configured engine does not support " +
					"subscriptions. Use GraphQLJsAdapter for subscription support.",
				);
			} else {
				const subHandler = new SubscriptionHandler(
					engine,
					null, // engineSchema set after init
					path,
					app.container,
					app.getGlobalGuards(),
					app.getGlobalInterceptors(),
				);
				app.setWebSocketHandler(subHandler.getWebSocketConfig());
			}
		}

		// ── Optional OpenAPI sync ──
		if (options.syncOpenAPI) {
			// Deferred: runs after first initialization when type classes are known
			queueMicrotask(async () => {
				try {
					await initializer.ensureInitialized().catch(() => {});
					const typeClasses = getRegisteredTypeClasses();
					const { setApiPropertyMetadata } = await import("../openapi/metadata");
					const { getGqlPropertyKeys, getGqlPropertyMetadata } = await import("./metadata");

					for (const TypeClass of typeClasses) {
						const keys = getGqlPropertyKeys(TypeClass.prototype);
						for (const key of keys) {
							const fieldMeta = getGqlPropertyMetadata(TypeClass.prototype, key);
							if (!fieldMeta) continue;
							const apiOptions = GraphQLModule.fieldToApiProperty(fieldMeta);
							setApiPropertyMetadata(TypeClass.prototype, key, apiOptions);
						}
					}
				} catch {
					console.warn(
						"[GraphQL] syncOpenAPI: failed to sync field metadata to OpenAPI store. " +
						"Ensure @buenojs/bueno/openapi is available.",
					);
				}
			});
		}

		return new GraphQLModuleInstance("", {} as ResolvedSchema, path);
	}

	// ============= Per-field pipeline execution ============

	/**
	 * Executes a GraphQL request by:
	 * 1. Parsing with the engine
	 * 2. Running guards/interceptors per top-level field
	 * 3. Passing execution back to the engine for sub-selection resolution
	 *
	 * For the built-in engine this is simple since it handles everything.
	 * For external engines, we run guards/interceptors on the top-level
	 * operation fields, then delegate full execution to the engine.
	 */
	private static async executeWithPipeline(
		engine: GraphQLEngine,
		schema: unknown,
		parsed: { query: string; variables: Record<string, unknown>; operationName?: string },
		gqlContext: ReturnType<typeof buildGraphQLContext>,
		httpContext: Context,
		operationFields: Map<string, import("./types").ResolvedField>,
		operationType: "query" | "mutation",
		_opTypeStr: string,
		options: GraphQLModuleOptions,
		app: Application,
	): Promise<GraphQLResult> {
		// Run guards for each top-level operation field in the query
		// We do a lightweight parse to find top-level field names
		const topLevelFields = extractTopLevelFields(parsed.query);

		for (const fieldName of topLevelFields) {
			const resolvedField = operationFields.get(fieldName);
			if (!resolvedField) continue;

			// Find which resolver class owns this field
			const resolverClass = findResolverClass(
				options.resolvers,
				fieldName,
				operationType,
			);
			if (!resolverClass) continue;

			// Run guards and interceptors
			const guardsPassed = await runGuardsForField(
				resolverClass,
				fieldName,
				httpContext,
				gqlContext,
				operationType,
				app,
			);
			if (!guardsPassed) {
				return {
					errors: [
						{
							message: `Access denied to field '${fieldName}'`,
							path: [fieldName],
							extensions: { code: "FORBIDDEN" },
						},
					],
				};
			}
		}

		// Execute with engine (handles the actual resolver calls for built-in engine,
		// or full SDL schema execution for external engines)
		return engine.execute(
			schema,
			parsed.query,
			parsed.variables,
			gqlContext,
			parsed.operationName,
		);
	}

	// ============= OpenAPI sync helper ============

	private static fieldToApiProperty(
		fieldMeta: import("./types").FieldMetadata,
	): Record<string, unknown> {
		const type = fieldMeta.typeFn();
		const isArray = Array.isArray(type);
		const inner = isArray ? (type as Constructor[])[0] : (type as Constructor);

		let apiType: unknown;
		if (inner === String) apiType = "string";
		else if (inner === Number) apiType = "number";
		else if (inner === Boolean) apiType = "boolean";
		else if ((inner as Constructor).name === "GraphQLID") apiType = "string";
		else if ((inner as Constructor).name === "GraphQLInt") apiType = "integer";
		else if ((inner as Constructor).name === "GraphQLFloat") apiType = "number";
		else apiType = inner; // class reference — OpenAPI SchemaGenerator will handle

		const options: Record<string, unknown> = {
			required: !fieldMeta.nullable,
		};

		if (isArray) {
			options.type = "array";
			options.items =
				typeof apiType === "string"
					? { type: apiType }
					: { $ref: `#/components/schemas/${(inner as Constructor).name}` };
		} else {
			options.type = apiType;
		}

		if (fieldMeta.description) {
			options.description = fieldMeta.description;
		}

		return options;
	}
}

// ============= Helpers ============

/** Quick regex-based top-level field name extractor — avoids full parse overhead */
function extractTopLevelFields(query: string): string[] {
	// Strip operation keyword + optional name + optional variables
	const stripped = query
		.trim()
		.replace(/^(query|mutation)\s*\w*\s*(\([^)]*\))?\s*/, "");

	// Extract the outermost { ... } and find immediate field names
	const match = stripped.match(/^\{([\s\S]*)\}$/);
	if (!match) return [];

	const body = match[1];
	const fields: string[] = [];

	// Simple state machine — extract names at depth 0
	let depth = 0;
	let nameStart = -1;

	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (ch === "{") {
			depth++;
		} else if (ch === "}") {
			depth--;
		} else if (depth === 0 && /[A-Za-z_]/.test(ch) && nameStart < 0) {
			nameStart = i;
		} else if (depth === 0 && nameStart >= 0 && !/[\w]/.test(ch)) {
			const name = body.slice(nameStart, i);
			// Skip alias separator
			if (body[i] === ":") {
				// This was an alias — next identifier is the real name
				nameStart = -1;
				continue;
			}
			if (name !== "on") fields.push(name);
			nameStart = -1;
		}
	}
	if (nameStart >= 0) {
		fields.push(body.slice(nameStart));
	}

	return [...new Set(fields)]; // deduplicate
}

import {
	getQueryFields,
	getMutationFields,
} from "./metadata";

function findResolverClass(
	resolverClasses: Constructor[],
	fieldName: string,
	operationType: "query" | "mutation",
): Constructor | undefined {
	for (const ResolverClass of resolverClasses) {
		const fields =
			operationType === "mutation"
				? getMutationFields(ResolverClass.prototype)
				: getQueryFields(ResolverClass.prototype);

		if (fields.some((f) => f.fieldName === fieldName)) {
			return ResolverClass;
		}
	}
	return undefined;
}

async function runGuardsForField(
	resolverClass: Constructor,
	fieldName: string,
	httpContext: Context,
	gqlContext: ReturnType<typeof buildGraphQLContext>,
	operationType: "query" | "mutation",
	app: Application,
): Promise<boolean> {
	const { executeGuards, getClassGuards, getMethodGuards } = await import("../modules/guards");
	const { resolveForwardRef } = await import("../container");

	const classGuards = getClassGuards(resolverClass) ?? [];
	const methodGuards = getMethodGuards(resolverClass.prototype as object, fieldName) ?? [];
	const globalGuards = app.getGlobalGuards();

	// Enrich context
	const { enrichContextForGraphQL } = await import("./context-builder");
	enrichContextForGraphQL(httpContext, fieldName, operationType, resolverClass);

	return executeGuards(httpContext, {
		globalGuards,
		classGuards,
		methodGuards,
		resolveGuard: (guard) => {
			if (
				typeof guard === "object" &&
				guard !== null &&
				!("canActivate" in guard)
			) {
				try {
					return app.container.resolve(
						guard as import("../container").Token,
					) as import("../modules/guards").CanActivate;
				} catch {
					return null;
				}
			}
			return null;
		},
	});
}
