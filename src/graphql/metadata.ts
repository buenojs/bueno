/**
 * GraphQL Metadata Storage
 *
 * Isolated metadata storage using WeakMap, following the same pattern
 * as src/openapi/metadata.ts and src/modules/metadata.ts.
 * Fully self-contained — no imports from openapi/ or modules/.
 */

import type {
	Constructor,
	FieldMetadata,
	ResolverFieldMetadata,
	ResolverClassMetadata,
	TypeClassMetadata,
	ParamMetadata,
} from "./types";

// ============= Class-Level Metadata =============
// Stores @Resolver, @ObjectType, @InputType metadata keyed by class constructor

const classMetadataStore = new WeakMap<Constructor, Map<string, unknown>>();

export function setGqlClassMetadata(
	target: Constructor,
	key: string,
	value: unknown,
): void {
	if (!classMetadataStore.has(target)) {
		classMetadataStore.set(target, new Map());
	}
	classMetadataStore.get(target)?.set(key, value);
}

export function getGqlClassMetadata<T>(
	target: Constructor,
	key: string,
): T | undefined {
	return classMetadataStore.get(target)?.get(key) as T | undefined;
}

// ============= Prototype-Level Metadata =============
// Stores @Query, @Mutation, @Subscription, @Args metadata keyed by class prototype

const prototypeMetadataStore = new WeakMap<object, Map<string, unknown>>();

export function setGqlPrototypeMetadata(
	target: object,
	key: string,
	value: unknown,
): void {
	if (!prototypeMetadataStore.has(target)) {
		prototypeMetadataStore.set(target, new Map());
	}
	prototypeMetadataStore.get(target)?.set(key, value);
}

export function getGqlPrototypeMetadata<T>(
	target: object,
	key: string,
): T | undefined {
	return prototypeMetadataStore.get(target)?.get(key) as T | undefined;
}

// ============= Property-Level Metadata =============
// Stores @Field metadata keyed by class prototype + property name

const propertyMetadataStore = new WeakMap<object, Map<string, FieldMetadata>>();

export function setGqlPropertyMetadata(
	target: object,
	propertyKey: string | symbol,
	value: FieldMetadata,
): void {
	if (!propertyMetadataStore.has(target)) {
		propertyMetadataStore.set(target, new Map());
	}
	const key =
		typeof propertyKey === "symbol" ? propertyKey.toString() : propertyKey;
	propertyMetadataStore.get(target)?.set(key, value);
}

export function getGqlPropertyMetadata(
	target: object,
	propertyKey: string | symbol,
): FieldMetadata | undefined {
	const key =
		typeof propertyKey === "symbol" ? propertyKey.toString() : propertyKey;
	return propertyMetadataStore.get(target)?.get(key);
}

export function getGqlPropertyKeys(target: object): string[] {
	const map = propertyMetadataStore.get(target);
	if (!map) return [];
	return Array.from(map.keys());
}

export function getAllGqlPropertyMetadata(
	target: object,
): FieldMetadata[] {
	const map = propertyMetadataStore.get(target);
	if (!map) return [];
	return Array.from(map.values());
}

// ============= Typed Helpers =============

// Metadata keys
export const GQL_RESOLVER_KEY = "gql:resolver";
export const GQL_OBJECTTYPE_KEY = "gql:objecttype";
export const GQL_INPUTTYPE_KEY = "gql:inputtype";
export const GQL_QUERIES_KEY = "gql:queries";
export const GQL_MUTATIONS_KEY = "gql:mutations";
export const GQL_SUBSCRIPTIONS_KEY = "gql:subscriptions";
export const GQL_PARAMS_PREFIX = "gql:params:";

// ============= Resolver metadata helpers =============

export function getResolverMetadata(
	target: Constructor,
): ResolverClassMetadata | undefined {
	return getGqlClassMetadata<ResolverClassMetadata>(target, GQL_RESOLVER_KEY);
}

export function setResolverMetadata(
	target: Constructor,
	metadata: ResolverClassMetadata,
): void {
	setGqlClassMetadata(target, GQL_RESOLVER_KEY, metadata);
}

// ============= Object/Input type metadata helpers =============

export function getTypeMetadata(
	target: Constructor,
): TypeClassMetadata | undefined {
	return (
		getGqlClassMetadata<TypeClassMetadata>(target, GQL_OBJECTTYPE_KEY) ??
		getGqlClassMetadata<TypeClassMetadata>(target, GQL_INPUTTYPE_KEY)
	);
}

export function setObjectTypeMetadata(
	target: Constructor,
	metadata: TypeClassMetadata,
): void {
	setGqlClassMetadata(target, GQL_OBJECTTYPE_KEY, metadata);
}

export function setInputTypeMetadata(
	target: Constructor,
	metadata: TypeClassMetadata,
): void {
	setGqlClassMetadata(target, GQL_INPUTTYPE_KEY, metadata);
}

// ============= Resolver field metadata helpers =============

function getResolverFields(
	prototype: object,
	key: string,
): ResolverFieldMetadata[] {
	return getGqlPrototypeMetadata<ResolverFieldMetadata[]>(prototype, key) ?? [];
}

function addResolverField(
	prototype: object,
	key: string,
	field: ResolverFieldMetadata,
): void {
	const existing = getResolverFields(prototype, key);
	// Replace if methodName already exists (decorator applied multiple times)
	const idx = existing.findIndex((f) => f.methodName === field.methodName);
	if (idx >= 0) {
		existing[idx] = field;
	} else {
		existing.push(field);
	}
	setGqlPrototypeMetadata(prototype, key, existing);
}

export function addQueryField(
	prototype: object,
	field: ResolverFieldMetadata,
): void {
	addResolverField(prototype, GQL_QUERIES_KEY, field);
}

export function addMutationField(
	prototype: object,
	field: ResolverFieldMetadata,
): void {
	addResolverField(prototype, GQL_MUTATIONS_KEY, field);
}

export function addSubscriptionField(
	prototype: object,
	field: ResolverFieldMetadata,
): void {
	addResolverField(prototype, GQL_SUBSCRIPTIONS_KEY, field);
}

export function getQueryFields(prototype: object): ResolverFieldMetadata[] {
	return getResolverFields(prototype, GQL_QUERIES_KEY);
}

export function getMutationFields(prototype: object): ResolverFieldMetadata[] {
	return getResolverFields(prototype, GQL_MUTATIONS_KEY);
}

export function getSubscriptionFields(
	prototype: object,
): ResolverFieldMetadata[] {
	return getResolverFields(prototype, GQL_SUBSCRIPTIONS_KEY);
}

// ============= Parameter metadata helpers =============

export function setParamMetadata(
	prototype: object,
	methodName: string,
	paramIndex: number,
	meta: ParamMetadata,
): void {
	const key = `${GQL_PARAMS_PREFIX}${methodName}`;
	const existing =
		getGqlPrototypeMetadata<ParamMetadata[]>(prototype, key) ?? [];
	existing[paramIndex] = meta;
	setGqlPrototypeMetadata(prototype, key, existing);
}

export function getParamMetadata(
	prototype: object,
	methodName: string,
): ParamMetadata[] {
	const key = `${GQL_PARAMS_PREFIX}${methodName}`;
	return getGqlPrototypeMetadata<ParamMetadata[]>(prototype, key) ?? [];
}
