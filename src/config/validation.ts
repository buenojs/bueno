/**
 * Configuration validation for Bueno Framework
 * Supports Standard Schema validators (Zod, Valibot, ArkType)
 */

import type { StandardSchema, StandardIssue } from "../types";
import type { BuenoConfig, DeepPartial } from "./types";

/**
 * Validation result
 */
export interface ConfigValidationResult {
	/** Whether validation passed */
	valid: boolean;
	/** Validation errors if any */
	errors: ConfigValidationError[];
	/** Warnings (non-critical issues) */
	warnings: ConfigValidationWarning[];
}

/**
 * Validation error
 */
export interface ConfigValidationError {
	/** Error message */
	message: string;
	/** Path to the invalid field */
	path?: string;
	/** Expected type or value */
	expected?: string;
	/** Actual value received */
	received?: unknown;
	/** Original issue from schema validator */
	issue?: StandardIssue;
}

/**
 * Validation warning
 */
export interface ConfigValidationWarning {
	/** Warning message */
	message: string;
	/** Path to the field */
	path?: string;
}

/**
 * Check if a value is a Standard Schema
 */
export function isStandardSchema(value: unknown): value is StandardSchema {
	return (
		typeof value === "object" &&
		value !== null &&
		"~standard" in value &&
		typeof (value as StandardSchema)["~standard"] === "object" &&
		typeof (value as StandardSchema)["~standard"].validate === "function"
	);
}

/**
 * Validate config against a Standard Schema
 */
export async function validateWithSchema<T>(
	config: unknown,
	schema: StandardSchema<T>,
): Promise<ConfigValidationResult> {
	const result = await schema["~standard"].validate(config);

	if (result.issues === undefined) {
		return {
			valid: true,
			errors: [],
			warnings: [],
		};
	}

	const errors: ConfigValidationError[] = result.issues.map((issue) => ({
		message: issue.message,
		path: formatPath(issue.path),
		issue,
	}));

	return {
		valid: false,
		errors,
		warnings: [],
	};
}

/**
 * Format a path from Standard Schema issues
 */
function formatPath(
	path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>,
): string | undefined {
	if (!path || path.length === 0) {
		return undefined;
	}

	return path
		.map((segment) => {
			if (typeof segment === "object" && "key" in segment) {
				return String(segment.key);
			}
			return String(segment);
		})
		.join(".");
}

/**
 * Default validation rules for BuenoConfig
 */
const DEFAULT_RULES: ValidationRule[] = [
	{
		path: "server.port",
		validate: (value) => {
			if (value === undefined) return { valid: true };
			if (typeof value !== "number") {
				return { valid: false, message: "Port must be a number" };
			}
			if (value < 0 || value > 65535) {
				return { valid: false, message: "Port must be between 0 and 65535" };
			}
			return { valid: true };
		},
	},
	{
		path: "database.poolSize",
		validate: (value) => {
			if (value === undefined) return { valid: true };
			if (typeof value !== "number") {
				return { valid: false, message: "Pool size must be a number" };
			}
			if (value < 1) {
				return { valid: false, message: "Pool size must be at least 1" };
			}
			return { valid: true };
		},
	},
	{
		path: "database.slowQueryThreshold",
		validate: (value) => {
			if (value === undefined) return { valid: true };
			if (typeof value !== "number") {
				return { valid: false, message: "Slow query threshold must be a number" };
			}
			if (value < 0) {
				return { valid: false, message: "Slow query threshold must be non-negative" };
			}
			return { valid: true };
		},
	},
	{
		path: "cache.ttl",
		validate: (value) => {
			if (value === undefined) return { valid: true };
			if (typeof value !== "number") {
				return { valid: false, message: "TTL must be a number" };
			}
			if (value < 0) {
				return { valid: false, message: "TTL must be non-negative" };
			}
			return { valid: true };
		},
	},
	{
		path: "cache.driver",
		validate: (value) => {
			if (value === undefined) return { valid: true };
			if (value !== "redis" && value !== "memory") {
				return {
					valid: false,
					message: 'Cache driver must be "redis" or "memory"',
					expected: '"redis" | "memory"',
					received: value,
				};
			}
			return { valid: true };
		},
	},
	{
		path: "logger.level",
		validate: (value) => {
			if (value === undefined) return { valid: true };
			const validLevels = ["debug", "info", "warn", "error", "fatal"];
			if (!validLevels.includes(value as string)) {
				return {
					valid: false,
					message: `Logger level must be one of: ${validLevels.join(", ")}`,
					expected: validLevels.join(" | "),
					received: value,
				};
			}
			return { valid: true };
		},
	},
	{
		path: "telemetry.sampleRate",
		validate: (value) => {
			if (value === undefined) return { valid: true };
			if (typeof value !== "number") {
				return { valid: false, message: "Sample rate must be a number" };
			}
			if (value < 0 || value > 1) {
				return { valid: false, message: "Sample rate must be between 0 and 1" };
			}
			return { valid: true };
		},
	},
	{
		path: "metrics.collectInterval",
		validate: (value) => {
			if (value === undefined) return { valid: true };
			if (typeof value !== "number") {
				return { valid: false, message: "Collect interval must be a number" };
			}
			if (value < 0) {
				return { valid: false, message: "Collect interval must be non-negative" };
			}
			return { valid: true };
		},
	},
];

/**
 * Validation rule
 */
interface ValidationRule {
	/** Path to the field to validate */
	path: string;
	/** Validation function */
	validate: (
		value: unknown,
		config: DeepPartial<BuenoConfig>,
	) => ValidationResult;
}

/**
 * Validation result from a rule
 */
interface ValidationResult {
	valid: boolean;
	message?: string;
	expected?: string;
	received?: unknown;
}

/**
 * Get a value from an object using dot notation path
 */
function getValueByPath(obj: unknown, path: string): unknown {
	const parts = path.split(".");
	let current: unknown = obj;

	for (const part of parts) {
		if (current === null || current === undefined) {
			return undefined;
		}
		if (typeof current !== "object") {
			return undefined;
		}
		current = (current as Record<string, unknown>)[part];
	}

	return current;
}

/**
 * Validate config using default rules
 */
export function validateConfigDefaults(
	config: DeepPartial<BuenoConfig>,
): ConfigValidationResult {
	const errors: ConfigValidationError[] = [];
	const warnings: ConfigValidationWarning[] = [];

	for (const rule of DEFAULT_RULES) {
		const value = getValueByPath(config, rule.path);
		const result = rule.validate(value, config);

		if (!result.valid) {
			errors.push({
				message: result.message || "Validation failed",
				path: rule.path,
				expected: result.expected,
				received: result.received,
			});
		}
	}

	// Add warnings for potentially missing critical config
	if (!config.database?.url && !process.env.DATABASE_URL) {
		warnings.push({
			message: "No database URL configured",
			path: "database.url",
		});
	}

	if (config.cache?.driver === "redis" && !config.cache.url && !process.env.REDIS_URL) {
		warnings.push({
			message: "Redis cache driver selected but no Redis URL configured",
			path: "cache.url",
		});
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

/**
 * Validate configuration
 * Supports both Standard Schema and default validation rules
 */
export async function validateConfig<T extends BuenoConfig = BuenoConfig>(
	config: unknown,
	schema?: StandardSchema<T>,
): Promise<ConfigValidationResult> {
	// If a schema is provided, use it
	if (schema && isStandardSchema(schema)) {
		return validateWithSchema(config, schema);
	}

	// Otherwise, use default validation
	return validateConfigDefaults(config as DeepPartial<BuenoConfig>);
}

/**
 * Validate configuration synchronously
 * Note: Standard Schema validation may be async, so this only works with default rules
 */
export function validateConfigSync(
	config: DeepPartial<BuenoConfig>,
): ConfigValidationResult {
	return validateConfigDefaults(config);
}

/**
 * Create a validation error with helpful message
 */
export function createConfigError(
	result: ConfigValidationResult,
): ConfigValidationError {
	if (result.errors.length === 0) {
		return {
			message: "Unknown validation error",
		};
	}

	// Return the first error with context
	const firstError = result.errors[0];
	return {
		message: firstError.message,
		path: firstError.path,
		expected: firstError.expected,
		received: firstError.received,
	};
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(
	errors: ConfigValidationError[],
): string {
	if (errors.length === 0) {
		return "No errors";
	}

	const lines = errors.map((error, index) => {
		let line = `${index + 1}. ${error.message}`;
		if (error.path) {
			line += ` (at ${error.path})`;
		}
		if (error.expected) {
			line += `\n   Expected: ${error.expected}`;
		}
		if (error.received !== undefined) {
			line += `\n   Received: ${JSON.stringify(error.received)}`;
		}
		return line;
	});

	return `Configuration validation failed:\n${lines.join("\n")}`;
}

/**
 * Assert that configuration is valid
 * Throws an error if validation fails
 */
export async function assertValidConfig<T extends BuenoConfig = BuenoConfig>(
	config: unknown,
	schema?: StandardSchema<T>,
): Promise<void> {
	const result = await validateConfig(config, schema);

	if (!result.valid) {
		const errorMessage = formatValidationErrors(result.errors);
		throw new Error(errorMessage);
	}

	// Log warnings
	if (result.warnings.length > 0) {
		for (const warning of result.warnings) {
			console.warn(`Config warning: ${warning.message}${warning.path ? ` (at ${warning.path})` : ""}`);
		}
	}
}

/**
 * Add custom validation rules
 */
export function createCustomValidator(
	rules: ValidationRule[],
): (config: DeepPartial<BuenoConfig>) => ConfigValidationResult {
	return (config) => {
		const errors: ConfigValidationError[] = [];

		for (const rule of rules) {
			const value = getValueByPath(config, rule.path);
			const result = rule.validate(value, config);

			if (!result.valid) {
				errors.push({
					message: result.message || "Validation failed",
					path: rule.path,
					expected: result.expected,
					received: result.received,
				});
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings: [],
		};
	};
}