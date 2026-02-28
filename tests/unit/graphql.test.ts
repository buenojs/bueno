/**
 * GraphQL Module Unit Tests
 *
 * Tests for decorators, metadata, schema builder, built-in engine,
 * execution pipeline, context builder, and GraphQL module setup.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Context } from "../../src/context";

// ============= Imports =============

import {
	Resolver,
	ObjectType,
	InputType,
	Field,
	Query,
	Mutation,
	Subscription,
	Args,
	GqlContext,
} from "../../src/graphql/decorators";
import {
	getResolverMetadata,
	getTypeMetadata,
	getQueryFields,
	getMutationFields,
	getSubscriptionFields,
	getParamMetadata,
	getAllGqlPropertyMetadata,
	getGqlPropertyMetadata,
	getGqlPropertyKeys,
} from "../../src/graphql/metadata";
import { GraphQLID, GraphQLInt, GraphQLFloat } from "../../src/graphql/types";
import {
	SchemaBuilder,
	typeFnToScalarName,
	typeFnToSDL,
} from "../../src/graphql/schema-builder";
import { BuiltinGraphQLEngine } from "../../src/graphql/built-in-engine";
import {
	buildGraphQLContext,
	enrichContextForGraphQL,
	parseGraphQLRequest,
} from "../../src/graphql/context-builder";
import {
	callResolver,
	GraphQLForbiddenError,
} from "../../src/graphql/execution-pipeline";
import type { GraphQLContext, ResolvedField } from "../../src/graphql/types";

// ============= Test Helpers =============

function makeHttpContext(
	path = "/graphql",
	method = "POST",
	headers: Record<string, string> = {},
	body?: string,
): Context {
	const req = new Request(`http://localhost${path}`, {
		method,
		headers: { "content-type": "application/json", ...headers },
		body,
	});
	return new Context(req);
}

function makeGqlContext(httpCtx?: Context): GraphQLContext {
	const ctx = httpCtx ?? makeHttpContext();
	return buildGraphQLContext(ctx);
}

// ============= 1. Decorators =============

describe("GraphQL Decorators", () => {
	test("@Resolver stores resolver metadata with default name", () => {
		@Resolver()
		class UserResolver {}

		const meta = getResolverMetadata(UserResolver);
		expect(meta).toBeDefined();
		expect(meta!.name).toBe("UserResolver");
	});

	test("@Resolver stores resolver metadata with explicit name", () => {
		@Resolver("User")
		class UserFieldResolver {}

		const meta = getResolverMetadata(UserFieldResolver);
		expect(meta!.name).toBe("User");
	});

	test("@ObjectType stores type metadata", () => {
		@ObjectType()
		class Product {}

		const meta = getTypeMetadata(Product);
		expect(meta).toBeDefined();
		expect(meta!.name).toBe("Product");
		expect(meta!.kind).toBe("object");
	});

	test("@ObjectType accepts name and description", () => {
		@ObjectType("ProductType", { description: "A product" })
		class ProductV2 {}

		const meta = getTypeMetadata(ProductV2);
		expect(meta!.name).toBe("ProductType");
		expect(meta!.description).toBe("A product");
	});

	test("@InputType stores input type metadata", () => {
		@InputType()
		class CreateInput {}

		const meta = getTypeMetadata(CreateInput);
		expect(meta!.kind).toBe("input");
	});

	test("@Field stores field metadata with defaults", () => {
		class ItemType {
			@Field(() => String)
			declare title: string;
		}

		const meta = getGqlPropertyMetadata(ItemType.prototype, "title");
		expect(meta).toBeDefined();
		expect(meta!.nullable).toBe(false);
		expect(meta!.propertyKey).toBe("title");
	});

	test("@Field stores nullable + description", () => {
		class ItemB {
			@Field(() => String, { nullable: true, description: "bio" })
			declare bio: string | null;
		}

		const meta = getGqlPropertyMetadata(ItemB.prototype, "bio");
		expect(meta!.nullable).toBe(true);
		expect(meta!.description).toBe("bio");
	});

	test("@Query registers query field metadata", () => {
		class QResolver {
			@Query(() => String)
			hello(): string {
				return "hello";
			}
		}

		const fields = getQueryFields(QResolver.prototype);
		expect(fields).toHaveLength(1);
		expect(fields[0].fieldName).toBe("hello");
		expect(fields[0].kind).toBe("query");
	});

	test("@Mutation registers mutation field metadata", () => {
		class MResolver {
			@Mutation(() => String)
			doSomething(): string {
				return "done";
			}
		}

		const fields = getMutationFields(MResolver.prototype);
		expect(fields).toHaveLength(1);
		expect(fields[0].fieldName).toBe("doSomething");
		expect(fields[0].kind).toBe("mutation");
	});

	test("@Subscription registers subscription field metadata", () => {
		class SResolver {
			@Subscription(() => String)
			async *onMessage(): AsyncGenerator<string> {
				yield "msg";
			}
		}

		const fields = getSubscriptionFields(SResolver.prototype);
		expect(fields).toHaveLength(1);
		expect(fields[0].kind).toBe("subscription");
	});

	test("@Args stores param metadata at correct index", () => {
		class ArgResolver {
			@Query(() => String)
			greet(@Args("name") name: string): string {
				return `hi ${name}`;
			}
		}

		const params = getParamMetadata(ArgResolver.prototype, "greet");
		expect(params[0]).toBeDefined();
		expect(params[0].kind).toBe("args");
		expect(params[0].argName).toBe("name");
		expect(params[0].index).toBe(0);
	});

	test("@GqlContext stores context param metadata", () => {
		class CtxResolver {
			@Query(() => String)
			me(@GqlContext() ctx: GraphQLContext): string {
				return String(ctx.user);
			}
		}

		const params = getParamMetadata(CtxResolver.prototype, "me");
		expect(params[0].kind).toBe("context");
	});

	test("@Query with name override uses custom field name", () => {
		class NamedResolver {
			@Query(() => String, { name: "listUsers", nullable: true })
			getUsers(): string[] {
				return [];
			}
		}

		const fields = getQueryFields(NamedResolver.prototype);
		expect(fields[0].fieldName).toBe("listUsers");
		expect(fields[0].methodName).toBe("getUsers");
		expect(fields[0].nullable).toBe(true);
	});
});

// ============= 2. Schema Builder =============

describe("SchemaBuilder", () => {
	test("typeFnToScalarName maps primitives correctly", () => {
		expect(typeFnToScalarName(() => String)).toBe("String");
		expect(typeFnToScalarName(() => Number)).toBe("Float");
		expect(typeFnToScalarName(() => Boolean)).toBe("Boolean");
		expect(typeFnToScalarName(() => GraphQLID)).toBe("ID");
		expect(typeFnToScalarName(() => GraphQLInt)).toBe("Int");
		expect(typeFnToScalarName(() => GraphQLFloat)).toBe("Float");
	});

	test("typeFnToScalarName returns null for object types", () => {
		class Post {}
		expect(typeFnToScalarName(() => Post)).toBeNull();
	});

	test("typeFnToSDL generates correct non-null scalar", () => {
		expect(typeFnToSDL(() => String, false)).toBe("String!");
		expect(typeFnToSDL(() => Boolean, false)).toBe("Boolean!");
	});

	test("typeFnToSDL generates nullable scalar", () => {
		expect(typeFnToSDL(() => String, true)).toBe("String");
	});

	test("typeFnToSDL generates list type", () => {
		class Tag {}
		expect(typeFnToSDL(() => [Tag], false)).toBe("[Tag!]!");
		expect(typeFnToSDL(() => [Tag], true)).toBe("[Tag!]");
	});

	test("SchemaBuilder generates Query SDL from resolver", () => {
		@ObjectType()
		class Article {
			@Field(() => String)
			declare title: string;
		}

		class ArticleResolver {
			@Query(() => [Article])
			articles(): Article[] {
				return [];
			}
		}

		const instances = new Map<new (...args: unknown[]) => unknown, unknown>();
		instances.set(ArticleResolver, new ArticleResolver());

		const builder = new SchemaBuilder([ArticleResolver], instances);
		const { sdl } = builder.build();

		expect(sdl).toContain("type Query");
		expect(sdl).toContain("articles:");
	});

	test("SchemaBuilder generates Mutation SDL", () => {
		class CreateArticleInput {
			@Field(() => String)
			declare title: string;
		}

		@InputType()
		class CreateArticleInputType extends CreateArticleInput {}

		class CreateArticleResolver {
			@Mutation(() => String)
			createArticle(@Args("title") title: string): string {
				return title;
			}
		}

		const instances = new Map<new (...args: unknown[]) => unknown, unknown>();
		instances.set(CreateArticleResolver, new CreateArticleResolver());

		const builder = new SchemaBuilder([CreateArticleResolver], instances);
		const { sdl } = builder.build();

		expect(sdl).toContain("type Mutation");
		expect(sdl).toContain("createArticle");
	});

	test("SchemaBuilder generates type definitions for @ObjectType", () => {
		@ObjectType()
		class BlogPost {
			@Field(() => String)
			declare id: string;

			@Field(() => String, { nullable: true })
			declare excerpt: string | null;
		}

		class BlogResolver {
			@Query(() => [BlogPost])
			posts(): BlogPost[] {
				return [];
			}
		}

		const instances = new Map<new (...args: unknown[]) => unknown, unknown>();
		instances.set(BlogResolver, new BlogResolver());

		const builder = new SchemaBuilder([BlogResolver], instances);
		const { sdl } = builder.build();

		expect(sdl).toContain("type BlogPost");
		expect(sdl).toContain("id: String!");
		expect(sdl).toContain("excerpt: String");
	});

	test("SchemaBuilder resolvedSchema has correct maps", () => {
		class SimpleResolver {
			@Query(() => String)
			hello(): string {
				return "hi";
			}
		}

		const instance = new SimpleResolver();
		const instances = new Map<new (...args: unknown[]) => unknown, unknown>();
		instances.set(SimpleResolver, instance);

		const builder = new SchemaBuilder([SimpleResolver], instances);
		const { resolvedSchema } = builder.build();

		expect(resolvedSchema.queryFields.has("hello")).toBe(true);
		expect(resolvedSchema.mutationFields.size).toBe(0);
	});
});

// ============= 3. Built-in Engine =============

describe("BuiltinGraphQLEngine", () => {
	const engine = new BuiltinGraphQLEngine();

	test("supportsIntrospection is false", () => {
		expect(engine.supportsIntrospection).toBe(false);
	});

	test("supportsSubscriptions is false", () => {
		expect(engine.supportsSubscriptions).toBe(false);
	});

	test("executes a simple query", async () => {
		const instance = {
			hello: () => "world",
		};
		const field: ResolvedField = {
			resolverInstance: instance,
			methodName: "hello",
			paramMetadata: [],
			typeFn: () => String,
			nullable: false,
		};

		const queries = new Map([["hello", field]]);
		const schema = engine.buildSchema(
			{ queries, mutations: new Map(), subscriptions: new Map() },
			new Map(),
			"",
		);

		const ctx = makeGqlContext();
		const result = await engine.execute(
			schema,
			"{ hello }",
			{},
			ctx,
		);

		expect(result.data?.hello).toBe("world");
		expect(result.errors).toBeUndefined();
	});

	test("executes a mutation", async () => {
		const instance = { createNote: (_title: string) => ({ id: "1", title: "Test" }) };
		const field: ResolvedField = {
			resolverInstance: instance,
			methodName: "createNote",
			paramMetadata: [{ index: 0, kind: "args", argName: "title" }],
			typeFn: () => String,
			nullable: false,
		};

		const mutations = new Map([["createNote", field]]);
		const schema = engine.buildSchema(
			{ queries: new Map(), mutations, subscriptions: new Map() },
			new Map(),
			"",
		);

		const ctx = makeGqlContext();
		const result = await engine.execute(
			schema,
			'mutation { createNote(title: "Test") { id title } }',
			{},
			ctx,
		);

		expect(result.data?.createNote).toEqual({ id: "1", title: "Test" });
	});

	test("passes arguments to resolver", async () => {
		const instance = {
			user: (id: string) => ({ id, name: "Alice" }),
		};
		const field: ResolvedField = {
			resolverInstance: instance,
			methodName: "user",
			paramMetadata: [{ index: 0, kind: "args", argName: "id" }],
			typeFn: () => String,
			nullable: true,
		};

		const queries = new Map([["user", field]]);
		const schema = engine.buildSchema(
			{ queries, mutations: new Map(), subscriptions: new Map() },
			new Map(),
			"",
		);

		const ctx = makeGqlContext();
		const result = await engine.execute(
			schema,
			'{ user(id: "abc") { id name } }',
			{},
			ctx,
		);

		expect(result.data?.user).toEqual({ id: "abc", name: "Alice" });
	});

	test("substitutes variables from variables map", async () => {
		const instance = {
			item: (name: string) => name,
		};
		const field: ResolvedField = {
			resolverInstance: instance,
			methodName: "item",
			paramMetadata: [{ index: 0, kind: "args", argName: "name" }],
			typeFn: () => String,
			nullable: false,
		};

		const queries = new Map([["item", field]]);
		const schema = engine.buildSchema(
			{ queries, mutations: new Map(), subscriptions: new Map() },
			new Map(),
			"",
		);

		const ctx = makeGqlContext();
		const result = await engine.execute(
			schema,
			"query GetItem($name: String!) { item(name: $name) }",
			{ name: "widget" },
			ctx,
		);

		expect(result.data?.item).toBe("widget");
	});

	test("returns error for unknown field", async () => {
		const queries = new Map<string, ResolvedField>();
		const schema = engine.buildSchema(
			{ queries, mutations: new Map(), subscriptions: new Map() },
			new Map(),
			"",
		);

		const ctx = makeGqlContext();
		const result = await engine.execute(
			schema,
			"{ nonExistent }",
			{},
			ctx,
		);

		expect(result.data?.nonExistent).toBeNull();
		expect(result.errors?.[0].message).toContain("nonExistent");
	});

	test("returns error for fragment spread", async () => {
		const queries = new Map<string, ResolvedField>();
		const schema = engine.buildSchema(
			{ queries, mutations: new Map(), subscriptions: new Map() },
			new Map(),
			"",
		);

		const ctx = makeGqlContext();
		const result = await engine.execute(
			schema,
			"{ ...UserFields }",
			{},
			ctx,
		);

		expect(result.errors).toBeDefined();
		expect(result.errors![0].message).toContain("Fragment spreads are not supported");
	});

	test("returns error for introspection field", async () => {
		const queries = new Map<string, ResolvedField>();
		const schema = engine.buildSchema(
			{ queries, mutations: new Map(), subscriptions: new Map() },
			new Map(),
			"",
		);

		const ctx = makeGqlContext();
		const result = await engine.execute(
			schema,
			"{ __schema { queryType { name } } }",
			{},
			ctx,
		);

		expect(result.errors).toBeDefined();
		expect(result.errors![0].message).toContain("Introspection");
	});

	test("handles resolver throwing an error", async () => {
		const instance = {
			fail: () => {
				throw new Error("Resolver failed");
			},
		};
		const field: ResolvedField = {
			resolverInstance: instance,
			methodName: "fail",
			paramMetadata: [],
			typeFn: () => String,
			nullable: true,
		};

		const queries = new Map([["fail", field]]);
		const schema = engine.buildSchema(
			{ queries, mutations: new Map(), subscriptions: new Map() },
			new Map(),
			"",
		);

		const ctx = makeGqlContext();
		const result = await engine.execute(schema, "{ fail }", {}, ctx);

		expect(result.data?.fail).toBeNull();
		expect(result.errors?.[0].message).toBe("Resolver failed");
		expect(result.errors?.[0].path).toEqual(["fail"]);
	});

	test("resolves nested sub-selections", async () => {
		const instance = {
			me: () => ({ id: "u1", profile: { bio: "hello" } }),
		};
		const field: ResolvedField = {
			resolverInstance: instance,
			methodName: "me",
			paramMetadata: [],
			typeFn: () => String,
			nullable: true,
		};

		const queries = new Map([["me", field]]);
		const schema = engine.buildSchema(
			{ queries, mutations: new Map(), subscriptions: new Map() },
			new Map(),
			"",
		);

		const ctx = makeGqlContext();
		const result = await engine.execute(
			schema,
			"{ me { id profile { bio } } }",
			{},
			ctx,
		);

		expect((result.data?.me as { id: string; profile: { bio: string } }).profile.bio).toBe("hello");
	});
});

// ============= 4. Context Builder =============

describe("Context Builder", () => {
	test("buildGraphQLContext extracts request and httpContext", () => {
		const httpCtx = makeHttpContext("/graphql");
		const gqlCtx = buildGraphQLContext(httpCtx);

		expect(gqlCtx.request).toBe(httpCtx.req);
		expect(gqlCtx.httpContext).toBe(httpCtx);
	});

	test("buildGraphQLContext extracts user from context store", () => {
		const httpCtx = makeHttpContext("/graphql");
		const mockUser = { id: "u1", email: "test@example.com" };
		httpCtx.set("user", mockUser);

		const gqlCtx = buildGraphQLContext(httpCtx);
		expect(gqlCtx.user).toEqual(mockUser);
	});

	test("buildGraphQLContext user is undefined when not set", () => {
		const httpCtx = makeHttpContext("/graphql");
		const gqlCtx = buildGraphQLContext(httpCtx);
		expect(gqlCtx.user).toBeUndefined();
	});

	test("enrichContextForGraphQL sets metadata on HTTP context", () => {
		const httpCtx = makeHttpContext("/graphql");

		class SomeResolver {}
		enrichContextForGraphQL(httpCtx, "users", "query", SomeResolver);

		expect(httpCtx.get("graphql:operation")).toBe("users");
		expect(httpCtx.get("graphql:type")).toBe("query");
		expect(httpCtx.get("graphql:resolverClass")).toBe(SomeResolver);
	});

	test("parseGraphQLRequest parses POST JSON body", async () => {
		const body = JSON.stringify({ query: "{ hello }", variables: { x: 1 } });
		const req = new Request("http://localhost/graphql", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body,
		});

		const result = await parseGraphQLRequest(req);
		expect(result).not.toBeNull();
		expect(result!.query).toBe("{ hello }");
		expect(result!.variables).toEqual({ x: 1 });
	});

	test("parseGraphQLRequest returns null for invalid body", async () => {
		const req = new Request("http://localhost/graphql", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "not-json",
		});

		const result = await parseGraphQLRequest(req);
		expect(result).toBeNull();
	});

	test("parseGraphQLRequest parses GET query string", async () => {
		const req = new Request(
			"http://localhost/graphql?query=%7B+hello+%7D",
			{ method: "GET" },
		);

		const result = await parseGraphQLRequest(req);
		expect(result).not.toBeNull();
		expect(result!.query).toBe("{ hello }");
	});
});

// ============= 5. Execution Pipeline (callResolver) =============

describe("Execution Pipeline - callResolver", () => {
	test("calls resolver method with no params", async () => {
		const instance = { getData: () => [1, 2, 3] };
		const field: ResolvedField = {
			resolverInstance: instance,
			methodName: "getData",
			paramMetadata: [],
			typeFn: () => Number,
			nullable: false,
		};
		const ctx = makeGqlContext();
		const result = await callResolver(field, {}, ctx);
		expect(result).toEqual([1, 2, 3]);
	});

	test("callResolver injects @Args param at correct index", async () => {
		let received: unknown;
		const instance = {
			find: (id: string) => {
				received = id;
				return { id };
			},
		};
		const field: ResolvedField = {
			resolverInstance: instance,
			methodName: "find",
			paramMetadata: [{ index: 0, kind: "args", argName: "id" }],
			typeFn: () => String,
			nullable: true,
		};
		const ctx = makeGqlContext();
		await callResolver(field, { id: "abc" }, ctx);
		expect(received).toBe("abc");
	});

	test("callResolver injects @GqlContext at correct index", async () => {
		let receivedCtx: unknown;
		const instance = {
			me: (ctx: GraphQLContext) => {
				receivedCtx = ctx;
				return ctx.user;
			},
		};
		const field: ResolvedField = {
			resolverInstance: instance,
			methodName: "me",
			paramMetadata: [{ index: 0, kind: "context" }],
			typeFn: () => String,
			nullable: true,
		};
		const httpCtx = makeHttpContext();
		httpCtx.set("user", { id: "u1" });
		const ctx = buildGraphQLContext(httpCtx);

		await callResolver(field, {}, ctx);
		expect((receivedCtx as GraphQLContext).user).toEqual({ id: "u1" });
	});

	test("callResolver handles mixed @Args and @GqlContext params", async () => {
		let receivedId: unknown;
		let receivedCtx: unknown;

		const instance = {
			deleteUser: (id: string, ctx: GraphQLContext) => {
				receivedId = id;
				receivedCtx = ctx;
				return true;
			},
		};
		const field: ResolvedField = {
			resolverInstance: instance,
			methodName: "deleteUser",
			paramMetadata: [
				{ index: 0, kind: "args", argName: "id" },
				{ index: 1, kind: "context" },
			],
			typeFn: () => Boolean,
			nullable: false,
		};

		const ctx = makeGqlContext();
		await callResolver(field, { id: "u99" }, ctx);

		expect(receivedId).toBe("u99");
		expect(receivedCtx).toBe(ctx);
	});

	test("callResolver awaits async resolver", async () => {
		const instance = {
			asyncOp: async () => {
				return new Promise<string>((resolve) =>
					setTimeout(() => resolve("async-result"), 1),
				);
			},
		};
		const field: ResolvedField = {
			resolverInstance: instance,
			methodName: "asyncOp",
			paramMetadata: [],
			typeFn: () => String,
			nullable: false,
		};
		const ctx = makeGqlContext();
		const result = await callResolver(field, {}, ctx);
		expect(result).toBe("async-result");
	});
});

// ============= 6. GraphQLForbiddenError =============

describe("GraphQLForbiddenError", () => {
	test("has correct name and extensions", () => {
		const err = new GraphQLForbiddenError("Access denied");
		expect(err.name).toBe("GraphQLForbiddenError");
		expect(err.message).toBe("Access denied");
		expect(err.extensions).toEqual({ code: "FORBIDDEN" });
	});

	test("toGraphQLError returns correct shape", () => {
		const err = new GraphQLForbiddenError("Forbidden field");
		const gqlErr = err.toGraphQLError();
		expect(gqlErr.message).toBe("Forbidden field");
		expect(gqlErr.extensions?.code).toBe("FORBIDDEN");
	});

	test("uses default message when none provided", () => {
		const err = new GraphQLForbiddenError();
		expect(err.message).toBe("Forbidden");
	});
});

// ============= 7. @Field + getGqlPropertyKeys =============

describe("@Field property metadata helpers", () => {
	test("getGqlPropertyKeys returns all field keys", () => {
		class ArticleObj {
			@Field(() => String) declare id: string;
			@Field(() => String) declare title: string;
			@Field(() => Number, { nullable: true }) declare score: number | null;
		}

		const keys = getGqlPropertyKeys(ArticleObj.prototype);
		expect(keys).toContain("id");
		expect(keys).toContain("title");
		expect(keys).toContain("score");
	});

	test("getAllGqlPropertyMetadata returns all field metadata", () => {
		class ReviewObj {
			@Field(() => String) declare content: string;
			@Field(() => GraphQLInt) declare rating: number;
		}

		const fields = getAllGqlPropertyMetadata(ReviewObj.prototype);
		expect(fields).toHaveLength(2);
		const names = fields.map((f) => f.propertyKey);
		expect(names).toContain("content");
		expect(names).toContain("rating");
	});

	test("@Field stores defaultValue for input types", () => {
		class SettingsInput {
			@Field(() => Boolean, { defaultValue: true })
			declare notifications: boolean;
		}

		const meta = getGqlPropertyMetadata(
			SettingsInput.prototype,
			"notifications",
		);
		expect(meta!.defaultValue).toBe(true);
	});

	test("@Field stores deprecationReason", () => {
		class LegacyType {
			@Field(() => String, { deprecationReason: "Use newField instead" })
			declare oldField: string;
		}

		const meta = getGqlPropertyMetadata(
			LegacyType.prototype,
			"oldField",
		);
		expect(meta!.deprecationReason).toBe("Use newField instead");
	});
});

// ============= 8. End-to-End: Engine with full resolver lifecycle =============

describe("Engine integration: query lifecycle", () => {
	test("query returns list result", async () => {
		const engine = new BuiltinGraphQLEngine();
		const instance = {
			tags: () => [{ name: "tech" }, { name: "science" }],
		};
		const field: ResolvedField = {
			resolverInstance: instance,
			methodName: "tags",
			paramMetadata: [],
			typeFn: () => String,
			nullable: false,
		};

		const schema = engine.buildSchema(
			{ queries: new Map([["tags", field]]), mutations: new Map(), subscriptions: new Map() },
			new Map(),
			"",
		);

		const ctx = makeGqlContext();
		const result = await engine.execute(schema, "{ tags { name } }", {}, ctx);

		expect(Array.isArray(result.data?.tags)).toBe(true);
		expect((result.data?.tags as { name: string }[])[0].name).toBe("tech");
	});

	test("alias in query maps to aliased key in response", async () => {
		const engine = new BuiltinGraphQLEngine();
		const instance = {
			hello: () => "world",
		};
		const field: ResolvedField = {
			resolverInstance: instance,
			methodName: "hello",
			paramMetadata: [],
			typeFn: () => String,
			nullable: false,
		};

		const schema = engine.buildSchema(
			{ queries: new Map([["hello", field]]), mutations: new Map(), subscriptions: new Map() },
			new Map(),
			"",
		);

		const ctx = makeGqlContext();
		const result = await engine.execute(schema, "{ greeting: hello }", {}, ctx);

		expect(result.data?.greeting).toBe("world");
		expect(result.data?.hello).toBeUndefined();
	});

	test("null result returns null without error", async () => {
		const engine = new BuiltinGraphQLEngine();
		const instance = { getUser: () => null };
		const field: ResolvedField = {
			resolverInstance: instance,
			methodName: "getUser",
			paramMetadata: [],
			typeFn: () => String,
			nullable: true,
		};

		const schema = engine.buildSchema(
			{ queries: new Map([["getUser", field]]), mutations: new Map(), subscriptions: new Map() },
			new Map(),
			"",
		);

		const ctx = makeGqlContext();
		const result = await engine.execute(schema, "{ getUser }", {}, ctx);

		expect(result.data?.getUser).toBeNull();
		expect(result.errors).toBeUndefined();
	});

	test("multiple fields in one query resolve independently", async () => {
		const engine = new BuiltinGraphQLEngine();
		const instance1 = { hello: () => "hi" };
		const instance2 = { version: () => "1.0" };

		const fields = new Map<string, ResolvedField>([
			[
				"hello",
				{
					resolverInstance: instance1,
					methodName: "hello",
					paramMetadata: [],
					typeFn: () => String,
					nullable: false,
				},
			],
			[
				"version",
				{
					resolverInstance: instance2,
					methodName: "version",
					paramMetadata: [],
					typeFn: () => String,
					nullable: false,
				},
			],
		]);

		const schema = engine.buildSchema(
			{ queries: fields, mutations: new Map(), subscriptions: new Map() },
			new Map(),
			"",
		);

		const ctx = makeGqlContext();
		const result = await engine.execute(schema, "{ hello version }", {}, ctx);

		expect(result.data?.hello).toBe("hi");
		expect(result.data?.version).toBe("1.0");
	});
});
