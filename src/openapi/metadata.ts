/**
 * OpenAPI Metadata Storage
 *
 * Isolated metadata storage using WeakMap, following the same pattern as src/modules/metadata.ts
 * This avoids circular dependencies and keeps metadata separate from the core module system.
 */

import type { Constructor } from './types';

// ============= Class-Level Metadata =============

/**
 * Stores metadata on class constructors (e.g., @ApiTags, @ApiBearerAuth, @ApiExcludeController)
 */
const classMetadataStore = new WeakMap<Constructor, Map<string, unknown>>();

/**
 * Set metadata on a class constructor
 */
export function setApiMetadata(
	target: Constructor,
	key: string,
	value: unknown,
): void {
	if (!classMetadataStore.has(target)) {
		classMetadataStore.set(target, new Map());
	}
	classMetadataStore.get(target)?.set(key, value);
}

/**
 * Get metadata from a class constructor
 */
export function getApiMetadata<T>(
	target: Constructor,
	key: string,
): T | undefined {
	return classMetadataStore.get(target)?.get(key) as T | undefined;
}

// ============= Method/Prototype-Level Metadata =============

/**
 * Stores metadata on method prototypes (e.g., @ApiOperation, @ApiResponse, @ApiParam)
 */
const methodMetadataStore = new WeakMap<object, Map<string, unknown>>();

/**
 * Set metadata on a method prototype
 */
export function setApiMethodMetadata(
	target: object,
	key: string,
	value: unknown,
): void {
	if (!methodMetadataStore.has(target)) {
		methodMetadataStore.set(target, new Map());
	}
	methodMetadataStore.get(target)?.set(key, value);
}

/**
 * Get metadata from a method prototype
 */
export function getApiMethodMetadata<T>(
	target: object,
	key: string,
): T | undefined {
	return methodMetadataStore.get(target)?.get(key) as T | undefined;
}

// ============= Property-Level Metadata =============

/**
 * Stores metadata on class properties (e.g., @ApiProperty decorators on DTO properties)
 */
const propertyMetadataStore = new WeakMap<object, Map<string, unknown>>();

/**
 * Set metadata on a property of a class prototype
 */
export function setApiPropertyMetadata(
	target: object,
	propertyKey: string | symbol,
	value: unknown,
): void {
	if (!propertyMetadataStore.has(target)) {
		propertyMetadataStore.set(target, new Map());
	}
	const key = typeof propertyKey === 'symbol' ? propertyKey.toString() : propertyKey;
	propertyMetadataStore.get(target)?.set(key, value);
}

/**
 * Get metadata from a property of a class prototype
 */
export function getApiPropertyMetadata<T>(
	target: object,
	propertyKey: string | symbol,
): T | undefined {
	const key = typeof propertyKey === 'symbol' ? propertyKey.toString() : propertyKey;
	return propertyMetadataStore.get(target)?.get(key) as T | undefined;
}

/**
 * Get all property metadata keys from a class prototype
 */
export function getApiPropertyKeys(target: object): (string | symbol)[] {
	const metaMap = propertyMetadataStore.get(target);
	if (!metaMap) return [];
	return Array.from(metaMap.keys()) as (string | symbol)[];
}
