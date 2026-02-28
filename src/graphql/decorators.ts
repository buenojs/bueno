/**
 * GraphQL Decorators
 *
 * Code-first decorator API for defining GraphQL schemas from TypeScript classes.
 * Follows the same WeakMap metadata pattern as the OpenAPI module.
 *
 * @example
 * ```typescript
 * @ObjectType()
 * class User {
 *   @Field(() => String)  id: string;
 *   @Field(() => String)  name: string;
 * }
 *
 * @Resolver()
 * class UserResolver {
 *   @Query(() => [User])
 *   users(): User[] { return []; }
 * }
 * ```
 */

import type {
	Constructor,
	TypeFn,
	FieldDecoratorOptions,
	FieldOptions,
} from "./types";
import {
	setResolverMetadata,
	setObjectTypeMetadata,
	setInputTypeMetadata,
	addQueryField,
	addMutationField,
	addSubscriptionField,
	getQueryFields,
	getMutationFields,
	getSubscriptionFields,
	setGqlPropertyMetadata,
	setParamMetadata,
	getParamMetadata,
} from "./metadata";
import { registerTypeClass } from "./schema-builder";

// ============= Class Decorators =============

/**
 * Marks a class as a GraphQL resolver.
 * Dependencies are resolved from the DI container via @Inject.
 *
 * @param name - Optional GraphQL type name this resolver is for (e.g. 'User').
 *               Omit for root-level Query/Mutation/Subscription resolvers.
 *
 * @example
 * ```typescript
 * @Resolver()
 * class UserResolver { ... }
 *
 * @Resolver('User')
 * class UserFieldResolver { ... }
 * ```
 */
export function Resolver(name?: string): ClassDecorator {
	return (target: unknown) => {
		const ctor = target as Constructor;
		setResolverMetadata(ctor, {
			name: name ?? ctor.name,
		});
	};
}

/**
 * Marks a class as a GraphQL output type.
 *
 * @example
 * ```typescript
 * @ObjectType()
 * class User {
 *   @Field(() => String) id: string;
 * }
 * ```
 */
export function ObjectType(
	name?: string,
	options?: { description?: string },
): ClassDecorator {
	return (target: unknown) => {
		const ctor = target as Constructor;
		setObjectTypeMetadata(ctor, {
			name: name ?? ctor.name,
			kind: "object",
			description: options?.description,
		});
		registerTypeClass(ctor);
	};
}

/**
 * Marks a class as a GraphQL input type.
 *
 * @example
 * ```typescript
 * @InputType()
 * class CreateUserInput {
 *   @Field(() => String) name: string;
 * }
 * ```
 */
export function InputType(
	name?: string,
	options?: { description?: string },
): ClassDecorator {
	return (target: unknown) => {
		const ctor = target as Constructor;
		setInputTypeMetadata(ctor, {
			name: name ?? ctor.name,
			kind: "input",
			description: options?.description,
		});
		registerTypeClass(ctor);
	};
}

// ============= Method Decorators =============

/**
 * Marks a method as a GraphQL Query field.
 *
 * @param typeFn - Thunk returning the return type constructor
 * @param options - Field options (nullable, description, name override)
 *
 * @example
 * ```typescript
 * @Query(() => [User])
 * async users(): Promise<User[]> { ... }
 *
 * @Query(() => User, { nullable: true })
 * async user(@Args('id') id: string): Promise<User | null> { ... }
 * ```
 */
export function Query(typeFn: TypeFn, options: FieldOptions = {}): MethodDecorator {
	return (
		target: object,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	): PropertyDescriptor => {
		const methodName = String(propertyKey);
		addQueryField(target, {
			methodName,
			fieldName: options.name ?? methodName,
			typeFn,
			kind: "query",
			nullable: options.nullable ?? false,
			description: options.description,
			deprecationReason: options.deprecationReason,
			paramMetadata: getParamMetadata(target, methodName),
		});
		return descriptor;
	};
}

/**
 * Marks a method as a GraphQL Mutation field.
 *
 * @example
 * ```typescript
 * @Mutation(() => User)
 * async createUser(@Args('input', CreateUserInput) input: CreateUserInput): Promise<User> { ... }
 * ```
 */
export function Mutation(typeFn: TypeFn, options: FieldOptions = {}): MethodDecorator {
	return (
		target: object,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	): PropertyDescriptor => {
		const methodName = String(propertyKey);
		addMutationField(target, {
			methodName,
			fieldName: options.name ?? methodName,
			typeFn,
			kind: "mutation",
			nullable: options.nullable ?? false,
			description: options.description,
			deprecationReason: options.deprecationReason,
			paramMetadata: getParamMetadata(target, methodName),
		});
		return descriptor;
	};
}

/**
 * Marks a method as a GraphQL Subscription field.
 * The method must return an AsyncGenerator.
 *
 * Requires an engine with supportsSubscriptions = true (e.g. GraphQLJsAdapter).
 * Requires subscriptions: true in GraphQLModule.setup().
 *
 * @example
 * ```typescript
 * @Subscription(() => Message)
 * async *messageAdded(): AsyncGenerator<Message> {
 *   yield* pubSub.subscribe('message:added');
 * }
 * ```
 */
export function Subscription(typeFn: TypeFn, options: FieldOptions = {}): MethodDecorator {
	return (
		target: object,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	): PropertyDescriptor => {
		const methodName = String(propertyKey);
		addSubscriptionField(target, {
			methodName,
			fieldName: options.name ?? methodName,
			typeFn,
			kind: "subscription",
			nullable: options.nullable ?? false,
			description: options.description,
			deprecationReason: options.deprecationReason,
			paramMetadata: getParamMetadata(target, methodName),
		});
		return descriptor;
	};
}

// ============= Property Decorator =============

/**
 * Marks a property as a GraphQL field.
 * Used on @ObjectType and @InputType classes.
 *
 * @param typeFn - Thunk returning the field type
 * @param options - Field options
 *
 * @example
 * ```typescript
 * @ObjectType()
 * class User {
 *   @Field(() => String)                    id: string;
 *   @Field(() => String, { nullable: true }) bio?: string;
 *   @Field(() => [Post])                    posts: Post[];
 * }
 * ```
 */
export function Field(
	typeFn: TypeFn,
	options: FieldDecoratorOptions = {},
): PropertyDecorator {
	return (target: object, propertyKey: string | symbol): void => {
		const key =
			typeof propertyKey === "symbol" ? propertyKey.toString() : propertyKey;
		setGqlPropertyMetadata(target, propertyKey, {
			propertyKey: key,
			typeFn,
			nullable: options.nullable ?? false,
			description: options.description,
			deprecationReason: options.deprecationReason,
			defaultValue: options.defaultValue,
		});
	};
}

// ============= Parameter Decorators =============

/**
 * Extracts a specific GraphQL argument by name into a method parameter.
 *
 * @param name - The argument name as it appears in the GraphQL query
 * @param inputTypeFn - Optional: type thunk for object input types (validates shape)
 *
 * @example
 * ```typescript
 * @Query(() => User)
 * async user(@Args('id') id: string): Promise<User> { ... }
 *
 * @Mutation(() => User)
 * async createUser(@Args('input', CreateUserInput) input: CreateUserInput): Promise<User> { ... }
 * ```
 */
export function Args(name: string, inputType?: Constructor): ParameterDecorator {
	return (
		target: object,
		propertyKey: string | symbol | undefined,
		parameterIndex: number,
	): void => {
		if (!propertyKey) return;
		const methodName = String(propertyKey);
		setParamMetadata(target, methodName, parameterIndex, {
			index: parameterIndex,
			kind: inputType ? "argsObject" : "args",
			argName: name,
			inputTypeFn: inputType ? () => inputType : undefined,
		});
		// Re-sync param metadata into existing resolver field metadata
		syncParamMetadata(target, methodName);
	};
}

/**
 * Injects the GraphQL context object into a resolver method parameter.
 *
 * Named @GqlContext to avoid collision with the HTTP Context class.
 *
 * @example
 * ```typescript
 * @Mutation(() => Post)
 * async createPost(
 *   @Args('title') title: string,
 *   @GqlContext() ctx: GraphQLContext,
 * ): Promise<Post> {
 *   const userId = (ctx.user as User).id;
 *   ...
 * }
 * ```
 */
export function GqlContext(): ParameterDecorator {
	return (
		target: object,
		propertyKey: string | symbol | undefined,
		parameterIndex: number,
	): void => {
		if (!propertyKey) return;
		const methodName = String(propertyKey);
		setParamMetadata(target, methodName, parameterIndex, {
			index: parameterIndex,
			kind: "context",
		});
		syncParamMetadata(target, methodName);
	};
}

// ============= Internal Helper =============

/**
 * Re-syncs param metadata into already-registered resolver field entries.
 * Decorators are applied bottom-up in TypeScript, so @Args/@GqlContext may run
 * before @Query/@Mutation. This helper updates the field entry with the latest
 * param metadata after each parameter decorator runs.
 */
function syncParamMetadata(prototype: object, methodName: string): void {
	const params = getParamMetadata(prototype, methodName);

	const syncFields = (
		fields: ReturnType<typeof getQueryFields>,
		addFn: typeof addQueryField,
	): void => {
		const field = fields.find((f) => f.methodName === methodName);
		if (field) {
			addFn(prototype, { ...field, paramMetadata: params });
		}
	};

	syncFields(getQueryFields(prototype), addQueryField);
	syncFields(getMutationFields(prototype), addMutationField);
	syncFields(getSubscriptionFields(prototype), addSubscriptionField);
}
