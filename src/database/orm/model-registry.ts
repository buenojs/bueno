/**
 * Model Registry
 *
 * Global registry mapping model names to their Database instances.
 * Allows per-model connection selection and a default connection fallback.
 */

import type { Database } from "../index";

const registry = new Map<string, Database>();
let defaultDb: Database | null = null;

/**
 * Set the default database for all models
 */
export function setDefaultDatabase(db: Database): void {
	defaultDb = db;
}

/**
 * Get the default database
 */
export function getDefaultDatabase(): Database {
	if (!defaultDb) {
		throw new Error(
			"No default database configured. Call setDefaultDatabase() before using models.",
		);
	}
	return defaultDb;
}

/**
 * Register a database connection for a specific model by name
 */
export function registerModelDatabase(modelName: string, db: Database): void {
	registry.set(modelName, db);
}

/**
 * Get the database for a model by name
 * Falls back to default database if model-specific one not registered
 */
export function getModelDatabase(modelName: string): Database {
	return registry.get(modelName) ?? getDefaultDatabase();
}

/**
 * Clear all model database registrations (mainly for testing)
 */
export function clearModelDatabaseRegistry(): void {
	registry.clear();
}

/**
 * Clear the default database (mainly for testing)
 */
export function clearDefaultDatabase(): void {
	defaultDb = null;
}
