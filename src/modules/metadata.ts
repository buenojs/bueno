/**
 * Metadata Storage
 *
 * Isolated metadata storage and decorators to avoid circular dependencies.
 * This module has no dependencies on other module files.
 */

import type { Token, Provider } from "../container";

// Type alias for class constructors
type Constructor = new (...args: unknown[]) => unknown;

// ============= Types =============

export interface ModuleMetadata {
	imports?: Constructor[];
	providers?: Provider[];
	controllers?: Constructor[];
	exports?: Token[];
}

// ============= Metadata Storage =============

// Simple metadata storage without Reflect.metadata
const metadataStore = new WeakMap<Constructor, Map<string, unknown>>();

export function setMetadata(target: Constructor, key: string, value: unknown): void {
	if (!metadataStore.has(target)) {
		metadataStore.set(target, new Map());
	}
	metadataStore.get(target)?.set(key, value);
}

export function getMetadata<T>(target: Constructor, key: string): T | undefined {
	return metadataStore.get(target)?.get(key) as T | undefined;
}

// Prototype metadata for method decorators
const prototypeMetadataStore = new WeakMap<object, Map<string, unknown>>();

export function setPrototypeMetadata(
	target: object,
	key: string,
	value: unknown,
): void {
	if (!prototypeMetadataStore.has(target)) {
		prototypeMetadataStore.set(target, new Map());
	}
	prototypeMetadataStore.get(target)?.set(key, value);
}

export function getPrototypeMetadata<T>(target: object, key: string): T | undefined {
	return prototypeMetadataStore.get(target)?.get(key) as T | undefined;
}

// ============= Decorators =============

/**
 * Mark a class as injectable
 */
export function Injectable(): ClassDecorator {
	return <TFunction extends Function>(target: TFunction): TFunction => {
		setMetadata(target as unknown as Constructor, "injectable", true);
		return target;
	};
}

/**
 * Mark a class as a controller with a base path
 */
export function Controller(path = ""): ClassDecorator {
	return <TFunction extends Function>(target: TFunction): TFunction => {
		setMetadata(target as unknown as Constructor, "controller", true);
		setMetadata(target as unknown as Constructor, "path", path);
		return target;
	};
}

/**
 * Define a module with metadata
 */
export function Module(metadata: ModuleMetadata): ClassDecorator {
	return <TFunction extends Function>(target: TFunction): TFunction => {
		setMetadata(target as unknown as Constructor, "module", metadata);
		return target;
	};
}

// Export the Constructor type for use in other modules
export type { Constructor };