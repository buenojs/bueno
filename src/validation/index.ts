/**
 * Validation System
 *
 * Multi-validator support using Standard Schema interface.
 * Works with Zod 4, Valibot v1, ArkType, Typia, and any Standard Schema compliant library.
 */

import type { Context } from "../context";
import type {
	Middleware,
	StandardIssue,
	StandardResult,
	StandardSchema,
} from "../types";

// ============= Types =============

export type ValidationResult<T> =
	| { success: true; data: T }
	| { success: false; issues: StandardIssue[] };

export interface ValidatorOptions {
	body?: StandardSchema;
	query?: StandardSchema;
	params?: StandardSchema;
	headers?: StandardSchema;
}

// ============= Core Validation Function =============

/**
 * Validate data against any Standard Schema compliant schema
 *
 * Supports:
 * - Zod 4+ (zod)
 * - Valibot v1+ (valibot)
 * - ArkType (arktype)
 * - Typia 7+ (typia) - use typia.createValidate<T>() for Standard Schema compatibility
 * - Any library implementing Standard Schema
 */
export async function validate<T>(
	schema: StandardSchema<unknown, T>,
	data: unknown,
): Promise<ValidationResult<T>> {
	try {
		const result = await Promise.resolve(schema["~standard"].validate(data));

		if ("value" in result) {
			return { success: true, data: result.value };
		}

		return {
			success: false,
			issues: [...result.issues],
		};
	} catch (error) {
		return {
			success: false,
			issues: [
				{
					message: error instanceof Error ? error.message : "Validation failed",
				},
			],
		};
	}
}

/**
 * Synchronous validation (for sync validators only)
 */
export function validateSync<T>(
	schema: StandardSchema<unknown, T>,
	data: unknown,
): ValidationResult<T> {
	const result = schema["~standard"].validate(data);

	// Check if it's a Promise (async validator)
	if (result instanceof Promise) {
		throw new Error("Schema uses async validation. Use validate() instead.");
	}

	if ("value" in result) {
		return { success: true, data: result.value };
	}

	return { success: false, issues: [...result.issues] };
}

// ============= Request Validation Functions =============

/**
 * Validate request body
 */
export async function validateBody<T>(
	context: Context,
	schema: StandardSchema<unknown, T>,
): Promise<ValidationResult<T>> {
	try {
		const body = await context.body();
		return validate(schema, body);
	} catch (error) {
		return {
			success: false,
			issues: [{ message: "Failed to parse request body" }],
		};
	}
}

/**
 * Validate query parameters
 */
export function validateQuery<T>(
	context: Context,
	schema: StandardSchema<unknown, T>,
): ValidationResult<T> {
	return validateSync(schema, context.query);
}

/**
 * Validate path parameters
 */
export function validateParams<T>(
	context: Context,
	schema: StandardSchema<unknown, T>,
): ValidationResult<T> {
	return validateSync(schema, context.params);
}

/**
 * Validate headers
 */
export function validateHeaders<T>(
	context: Context,
	schema: StandardSchema<unknown, T>,
): ValidationResult<T> {
	const headers: Record<string, string> = {};
	context.req.headers.forEach((value, key) => {
		headers[key] = value;
	});
	return validateSync(schema, headers);
}

// ============= Validation Middleware =============

/**
 * Create validation middleware
 */
export function createValidator(options: ValidatorOptions): Middleware {
	return async (context: Context, next: () => Promise<Response>) => {
		// Validate body
		if (options.body) {
			const result = await validateBody(context, options.body);
			if (!result.success) {
				return context
					.status(400)
					.json({ error: "Validation failed", issues: result.issues });
			}
			context.set("validatedBody", result.data);
		}

		// Validate query
		if (options.query) {
			const result = validateQuery(context, options.query);
			if (!result.success) {
				return context
					.status(400)
					.json({ error: "Validation failed", issues: result.issues });
			}
			context.set("validatedQuery", result.data);
		}

		// Validate params
		if (options.params) {
			const result = validateParams(context, options.params);
			if (!result.success) {
				return context
					.status(400)
					.json({ error: "Validation failed", issues: result.issues });
			}
			context.set("validatedParams", result.data);
		}

		// Validate headers
		if (options.headers) {
			const result = validateHeaders(context, options.headers);
			if (!result.success) {
				return context
					.status(400)
					.json({ error: "Validation failed", issues: result.issues });
			}
			context.set("validatedHeaders", result.data);
		}

		return next();
	};
}

// ============= Decorator Helpers =============

/**
 * Body validation decorator for route handlers
 */
export function WithBody(schema: StandardSchema) {
	return (
		target: unknown,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	) => {
		const original = descriptor.value;
		descriptor.value = async function (context: Context) {
			const result = await validateBody(context, schema);
			if (!result.success) {
				return context
					.status(400)
					.json({ error: "Validation failed", issues: result.issues });
			}
			context.set("body", result.data);
			return original.call(this, context);
		};
		return descriptor;
	};
}

/**
 * Query validation decorator for route handlers
 */
export function WithQuery(schema: StandardSchema) {
	return (
		target: unknown,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	) => {
		const original = descriptor.value;
		descriptor.value = async function (context: Context) {
			const result = validateQuery(context, schema);
			if (!result.success) {
				return context
					.status(400)
					.json({ error: "Validation failed", issues: result.issues });
			}
			context.set("query", result.data);
			return original.call(this, context);
		};
		return descriptor;
	};
}

// ============= Type Guards =============

/**
 * Check if a value is a Standard Schema
 */
export function isStandardSchema(value: unknown): value is StandardSchema {
	return (
		typeof value === "object" &&
		value !== null &&
		"~standard" in value &&
		typeof (value as StandardSchema)["~standard"]?.validate === "function"
	);
}

// ============= Utility: Assert Schema =============

/**
 * Assert that a schema implements Standard Schema
 */
export function assertStandardSchema(
	schema: unknown,
	name = "Schema",
): asserts schema is StandardSchema {
	if (!isStandardSchema(schema)) {
		throw new Error(
				`${name} must implement Standard Schema interface. Supported: Zod 4+, Valibot v1+, ArkType, Typia 7+`,
			);
	}
}
