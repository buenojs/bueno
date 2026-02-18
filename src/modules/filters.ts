/**
 * Exception Filters System
 *
 * Filters catch exceptions thrown during request processing and transform
 * them into appropriate responses. They act as error boundaries in the
 * request pipeline.
 *
 * Execution Order:
 * Incoming Request → Guards → Pipes → Handler → Filters (if error) → Error Response
 */

import type { Context } from "../context";
import type { Token } from "../types";
import { BuenoError, ValidationError, NotFoundError } from "../types";

// ============= Types =============

/**
 * Exception filter interface
 * Filters implement this interface to handle specific exception types
 */
export interface ExceptionFilter<T = Error> {
	catch(exception: T, context: Context): Response | Promise<Response>;
}

/**
 * Filter function type for functional filters
 */
export type FilterFn<T = Error> = (
	exception: T,
	context: Context,
) => Response | Promise<Response>;

/**
 * Filter type - can be a token, instance, or function
 */
export type Filter<T = Error> =
	| Token<ExceptionFilter<T>>
	| ExceptionFilter<T>
	| FilterFn<T>;

/**
 * Metadata stored for caught exception types
 */
interface CatchMetadata {
	exceptionType: new (...args: unknown[]) => Error;
}

// ============= Metadata Storage =============

// Type alias for class constructors
type Constructor = new (...args: unknown[]) => unknown;

// Metadata storage for filters
const filterMetadataStore = new WeakMap<Constructor, Map<string, unknown>>();
const catchMetadataStore = new WeakMap<Constructor, CatchMetadata>();

// Prototype metadata for method decorators
const filterPrototypeStore = new WeakMap<object, Map<string, unknown>>();

function setFilterMetadata(
	target: Constructor,
	key: string,
	value: unknown,
): void {
	if (!filterMetadataStore.has(target)) {
		filterMetadataStore.set(target, new Map());
	}
	filterMetadataStore.get(target)?.set(key, value);
}

function getFilterMetadata<T>(
	target: Constructor,
	key: string,
): T | undefined {
	return filterMetadataStore.get(target)?.get(key) as T | undefined;
}

function setFilterPrototypeMetadata(
	target: object,
	key: string,
	value: unknown,
): void {
	if (!filterPrototypeStore.has(target)) {
		filterPrototypeStore.set(target, new Map());
	}
	filterPrototypeStore.get(target)?.set(key, value);
}

function getFilterPrototypeMetadata<T>(
	target: object,
	key: string,
): T | undefined {
	return filterPrototypeStore.get(target)?.get(key) as T | undefined;
}

// ============= Decorators =============

/**
 * Decorator to apply filters to a controller class or method
 * Filters are executed in order: global → class → method
 *
 * @param filters - Filters to apply
 * @returns ClassDecorator & MethodDecorator
 *
 * @example
 * ```typescript
 * @Controller('users')
 * @UseFilters(CustomExceptionFilter)  // Applied to all methods
 * class UsersController {
 *   @Get(':id')
 *   @UseFilters(NotFoundExceptionFilter)  // Additional filter for this method
 *   getUser() {}
 * }
 * ```
 */
export function UseFilters(...filters: Filter[]): MethodDecorator & ClassDecorator {
	const decorator = (
		target: unknown,
		propertyKey?: string | symbol,
		descriptor?: PropertyDescriptor,
	): PropertyDescriptor | void => {
		if (descriptor && propertyKey !== undefined) {
			// Method decorator
			const targetObj = target as object;
			const existingFilters =
				getFilterPrototypeMetadata<Filter[]>(targetObj, "filters:method") ?? [];
			setFilterPrototypeMetadata(targetObj, "filters:method", [
				...existingFilters,
				...filters,
			]);
			return descriptor;
		} else {
			// Class decorator
			const targetClass = target as Constructor;
			const existingFilters =
				getFilterMetadata<Filter[]>(targetClass, "filters:class") ?? [];
			setFilterMetadata(targetClass, "filters:class", [
				...existingFilters,
				...filters,
			]);
		}
	};
	return decorator as MethodDecorator & ClassDecorator;
}

/**
 * Decorator to mark a filter as catching a specific exception type
 *
 * @param exceptionType - The exception class to catch
 * @returns ClassDecorator
 *
 * @example
 * ```typescript
 * @Catch(ValidationError)
 * @Injectable()
 * class CustomValidationFilter implements ExceptionFilter<ValidationError> {
 *   catch(exception: ValidationError, context: Context): Response {
 *     return context.status(422).json({
 *       error: 'Validation Failed',
 *       issues: exception.issues
 *     });
 *   }
 * }
 * ```
 */
export function Catch<T extends Error>(
	exceptionType: new (...args: never[]) => T,
): ClassDecorator {
	const decorator = (target: Constructor): void => {
		catchMetadataStore.set(target, { exceptionType: exceptionType as unknown as new (...args: unknown[]) => Error });
	};
	return decorator as ClassDecorator;
}

// ============= Helper Functions =============

/**
 * Get class-level filters from a controller
 */
export function getClassFilters(target: Constructor): Filter[] | undefined {
	return getFilterMetadata<Filter[]>(target, "filters:class");
}

/**
 * Get method-level filters from a controller method
 */
export function getMethodFilters(
	target: object,
	propertyKey: string | symbol,
): Filter[] | undefined {
	// First check method-specific filters
	const methodFilters = getFilterPrototypeMetadata<Filter[]>(
		target,
		`filters:method:${String(propertyKey)}`,
	);
	if (methodFilters) {
		return methodFilters;
	}
	// Fall back to general method filters
	return getFilterPrototypeMetadata<Filter[]>(target, "filters:method");
}

/**
 * Get the exception type that a filter catches
 */
export function getCatchType(
	filter: Filter,
): (new (...args: unknown[]) => Error) | undefined {
	// If it's a class constructor, check the catch metadata
	if (typeof filter === "function" && filter.prototype !== undefined) {
		const metadata = catchMetadataStore.get(filter as Constructor);
		return metadata?.exceptionType;
	}
	// If it's an instance, check its constructor
	if (typeof filter === "object" && filter !== null && "catch" in filter) {
		const constructor = (filter as object).constructor as Constructor;
		const metadata = catchMetadataStore.get(constructor);
		return metadata?.exceptionType;
	}
	return undefined;
}

/**
 * Check if a filter can handle a specific exception
 */
export function canHandleException(
	filter: Filter,
	exception: Error,
): boolean {
	const catchType = getCatchType(filter);
	if (!catchType) {
		// No specific catch type means it handles all exceptions
		return true;
	}
	return exception instanceof catchType;
}

/**
 * Type guard to check if a value is an ExceptionFilter instance
 */
export function isExceptionFilter(value: unknown): value is ExceptionFilter {
	return (
		typeof value === "object" &&
		value !== null &&
		"catch" in value &&
		typeof (value as ExceptionFilter).catch === "function"
	);
}

/**
 * Type guard to check if a value is a FilterFn
 */
export function isFilterFn(value: unknown): value is FilterFn {
	return typeof value === "function" && value.length === 2;
}

/**
 * Execute a filter and return the response
 */
export async function executeFilter(
	filter: Filter,
	exception: Error,
	context: Context,
	resolveFilter?: (filter: Filter) => ExceptionFilter | null,
): Promise<Response> {
	let filterInstance: ExceptionFilter | null = null;

	if (isExceptionFilter(filter)) {
		filterInstance = filter;
	} else if (isFilterFn(filter)) {
		// Convert filter function to response
		return filter(exception, context);
	} else if (typeof filter === "function") {
		// It's a class constructor - try to resolve from container or instantiate
		if (resolveFilter) {
			filterInstance = resolveFilter(filter);
		}
		if (!filterInstance) {
			// Try to instantiate directly (for simple filters without dependencies)
			try {
				const Constructor = filter as new () => ExceptionFilter;
				filterInstance = new Constructor();
			} catch {
				// Cannot instantiate - will fall through to default handling
			}
		}
	} else if (
		typeof filter === "object" &&
		filter !== null &&
		!isExceptionFilter(filter)
	) {
		// It's a token - try to resolve
		if (resolveFilter) {
			filterInstance = resolveFilter(filter);
		}
	}

	if (filterInstance && isExceptionFilter(filterInstance)) {
		return filterInstance.catch(exception, context);
	}

	// Fallback - should not reach here if a catch-all filter is configured
	return createInternalErrorResponse(exception);
}

/**
 * Options for executing filters
 */
export interface ExecuteFiltersOptions {
	globalFilters: Filter[];
	classFilters: Filter[];
	methodFilters: Filter[];
	resolveFilter?: (filter: Filter) => ExceptionFilter | null;
}

/**
 * Find and execute the appropriate filter for an exception
 * Filters are checked in order: method → class → global
 * The first filter that can handle the exception is used
 */
export async function findAndExecuteFilter(
	exception: Error,
	context: Context,
	options: ExecuteFiltersOptions,
): Promise<Response> {
	const { globalFilters, classFilters, methodFilters, resolveFilter } = options;

	// Combine all filters in execution order (method first, then class, then global)
	const allFilters = [
		...methodFilters,
		...classFilters,
		...globalFilters,
	];

	// Find the first filter that can handle this exception type
	for (const filter of allFilters) {
		if (canHandleException(filter, exception)) {
			return executeFilter(filter, exception, context, resolveFilter);
		}
	}

	// No specific filter found - use default error response
	return createDefaultErrorResponse(exception, context);
}

// ============= Built-in Filters =============

/**
 * HttpExceptionFilter - Handles BuenoError exceptions
 * Returns appropriate HTTP status codes and error details
 */
@Catch(BuenoError)
export class HttpExceptionFilter implements ExceptionFilter<BuenoError> {
	catch(exception: BuenoError, context: Context): Response {
		return context.status(exception.statusCode).json({
			error: exception.name,
			message: exception.message,
			code: exception.code,
			statusCode: exception.statusCode,
		});
	}
}

/**
 * ValidationFilter - Handles ValidationError exceptions
 * Returns validation error details with issues list
 */
@Catch(ValidationError)
export class ValidationFilter implements ExceptionFilter<ValidationError> {
	catch(exception: ValidationError, context: Context): Response {
		return context.status(422).json({
			error: "Validation Failed",
			message: exception.message,
			code: "VALIDATION_ERROR",
			issues: exception.issues,
		});
	}
}

/**
 * NotFoundFilter - Handles NotFoundError exceptions
 * Returns 404 response with resource not found message
 */
@Catch(NotFoundError)
export class NotFoundFilter implements ExceptionFilter<NotFoundError> {
	catch(exception: NotFoundError, context: Context): Response {
		return context.status(404).json({
			error: "Not Found",
			message: exception.message,
			code: "NOT_FOUND",
		});
	}
}

/**
 * AllExceptionsFilter - Catch-all filter for any Error
 * This filter handles all unhandled exceptions
 */
export class AllExceptionsFilter implements ExceptionFilter<Error> {
	catch(exception: Error, context: Context): Response {
		// Log the error for debugging
		console.error("Unhandled exception:", exception);

		// Check if it's a known error type
		if (exception instanceof BuenoError) {
			return context.status(exception.statusCode).json({
				error: exception.name,
				message: exception.message,
				code: exception.code,
			});
		}

		// Generic error response
		return context.status(500).json({
			error: "Internal Server Error",
			message: exception.message || "An unexpected error occurred",
		});
	}
}

// ============= Helper Response Functions =============

/**
 * Create a default error response when no filter matches
 */
export function createDefaultErrorResponse(
	exception: Error,
	context: Context,
): Response {
	// Log the unhandled exception
	console.error("Unhandled exception (no filter matched):", exception);

	return context.status(500).json({
		error: "Internal Server Error",
		message: exception.message || "An unexpected error occurred",
	});
}

/**
 * Create an internal error response
 */
export function createInternalErrorResponse(exception: Error): Response {
	console.error("Internal server error:", exception);

	return new Response(
		JSON.stringify({
			error: "Internal Server Error",
			message: "An unexpected error occurred",
		}),
		{
			status: 500,
			headers: {
				"Content-Type": "application/json",
			},
		},
	);
}