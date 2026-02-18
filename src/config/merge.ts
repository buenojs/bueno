/**
 * Deep merge utilities for configuration
 */

import type { BuenoConfig, DeepPartial } from "./types";

/**
 * Check if a value is a plain object (not an array, not null, not a class instance)
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object") {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === null || proto === Object.prototype;
}

/**
 * Check if a value is an object (alias for isPlainObject)
 */
export function isObject(value: unknown): value is Record<string, unknown> {
	return isPlainObject(value);
}

/**
 * Deep merge two values
 * - Objects are merged recursively
 * - Arrays are concatenated (not merged element-wise)
 * - Primitive values from source override target
 */
export function deepMerge<T>(target: T, source: DeepPartial<T>): T {
	// Handle null/undefined source
	if (source === null || source === undefined) {
		return target;
	}

	// Handle null/undefined target
	if (target === null || target === undefined) {
		return source as T;
	}

	// If source is not an object, return source (override)
	if (!isPlainObject(source)) {
		return source as T;
	}

	// If target is not an object but source is, return source
	if (!isPlainObject(target)) {
		return source as T;
	}

	// Both are objects, merge them
	const result = { ...target } as Record<string, unknown>;
	const sourceRecord = source as Record<string, unknown>;
	const targetRecord = target as Record<string, unknown>;

	for (const key of Object.keys(source)) {
		const sourceValue = sourceRecord[key];
		const targetValue = targetRecord[key];

		if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
			// Both are objects, merge recursively
			result[key] = deepMerge(targetValue, sourceValue as DeepPartial<typeof targetValue>);
		} else if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
			// Both are arrays, concatenate them
			result[key] = [...targetValue, ...sourceValue];
		} else {
			// Override with source value
			result[key] = sourceValue;
		}
	}

	return result as T;
}

/**
 * Merge multiple configuration objects
 * Later configs have higher priority
 */
export function mergeConfigs<T extends BuenoConfig = BuenoConfig>(
	...configs: (DeepPartial<T> | undefined | null)[]
): DeepPartial<T> {
	return configs.reduce<DeepPartial<T>>((acc, config) => {
		if (config === undefined || config === null) {
			return acc;
		}
		// Use unknown as intermediate type to avoid recursive type issues
		return deepMerge(acc as unknown as T, config as unknown as DeepPartial<T>) as unknown as DeepPartial<T>;
	}, {} as DeepPartial<T>);
}

/**
 * Deep clone a configuration object
 */
export function deepClone<T>(obj: T): T {
	if (obj === null || typeof obj !== "object") {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => deepClone(item)) as T;
	}

	if (isPlainObject(obj)) {
		const result: Record<string, unknown> = {};
		for (const key of Object.keys(obj)) {
			result[key] = deepClone(obj[key]);
		}
		return result as T;
	}

	// For other types (Date, Map, Set, etc.), return as-is
	return obj;
}

/**
 * Get a value from an object using dot notation
 * @example getNestedValue({ a: { b: { c: 1 } } }, 'a.b.c') // returns 1
 */
export function getNestedValue<T = unknown>(
	obj: Record<string, unknown>,
	path: string,
): T | undefined {
	const keys = path.split(".");
	let current: unknown = obj;

	for (const key of keys) {
		if (current === null || current === undefined) {
			return undefined;
		}
		if (isPlainObject(current)) {
			current = current[key];
		} else {
			return undefined;
		}
	}

	return current as T;
}

/**
 * Set a value in an object using dot notation
 * @example setNestedValue({}, 'a.b.c', 1) // returns { a: { b: { c: 1 } } }
 */
export function setNestedValue(
	obj: Record<string, unknown>,
	path: string,
	value: unknown,
): Record<string, unknown> {
	const keys = path.split(".");
	const result = deepClone(obj);
	let current: Record<string, unknown> = result;

	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		if (!isPlainObject(current[key])) {
			current[key] = {};
		}
		current = current[key] as Record<string, unknown>;
	}

	current[keys[keys.length - 1]] = value;
	return result;
}

/**
 * Delete a value from an object using dot notation
 * @example deleteNestedValue({ a: { b: { c: 1 } } }, 'a.b.c') // returns { a: { b: {} } }
 */
export function deleteNestedValue(
	obj: Record<string, unknown>,
	path: string,
): Record<string, unknown> {
	const keys = path.split(".");
	const result = deepClone(obj);
	let current: Record<string, unknown> = result;

	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		if (!isPlainObject(current[key])) {
			return result; // Path doesn't exist, nothing to delete
		}
		current = current[key] as Record<string, unknown>;
	}

	delete current[keys[keys.length - 1]];
	return result;
}

/**
 * Check if a path exists in an object
 */
export function hasNestedValue(
	obj: Record<string, unknown>,
	path: string,
): boolean {
	return getNestedValue(obj, path) !== undefined;
}

/**
 * Flatten a nested object to dot notation keys
 * @example flattenObject({ a: { b: { c: 1 } } }) // returns { 'a.b.c': 1 }
 */
export function flattenObject(
	obj: Record<string, unknown>,
	prefix = "",
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const key of Object.keys(obj)) {
		const newKey = prefix ? `${prefix}.${key}` : key;
		const value = obj[key];

		if (isPlainObject(value)) {
			Object.assign(result, flattenObject(value, newKey));
		} else {
			result[newKey] = value;
		}
	}

	return result;
}

/**
 * Unflatten a dot notation object to nested object
 * @example unflattenObject({ 'a.b.c': 1 }) // returns { a: { b: { c: 1 } } }
 */
export function unflattenObject(
	obj: Record<string, unknown>,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const key of Object.keys(obj)) {
		const keys = key.split(".");
		let current: Record<string, unknown> = result;

		for (let i = 0; i < keys.length - 1; i++) {
			const k = keys[i];
			if (!isPlainObject(current[k])) {
				current[k] = {};
			}
			current = current[k] as Record<string, unknown>;
		}

		current[keys[keys.length - 1]] = obj[key];
	}

	return result;
}

/**
 * Compare two configurations and return the differences
 */
export function diffConfigs(
	target: BuenoConfig,
	source: BuenoConfig,
): { added: string[]; removed: string[]; changed: string[] } {
	const flatTarget = flattenObject(target as Record<string, unknown>);
	const flatSource = flattenObject(source as Record<string, unknown>);

	const targetKeys = new Set(Object.keys(flatTarget));
	const sourceKeys = new Set(Object.keys(flatSource));

	const added: string[] = [];
	const removed: string[] = [];
	const changed: string[] = [];

	// Find added keys
	for (const key of sourceKeys) {
		if (!targetKeys.has(key)) {
			added.push(key);
		} else if (flatTarget[key] !== flatSource[key]) {
			changed.push(key);
		}
	}

	// Find removed keys
	for (const key of targetKeys) {
		if (!sourceKeys.has(key)) {
			removed.push(key);
		}
	}

	return { added, removed, changed };
}