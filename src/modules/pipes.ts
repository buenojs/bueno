/**
 * Pipes System
 *
 * Pipes run after guards in the request pipeline and can transform/validate
 * data before it reaches the handler.
 *
 * Execution Order:
 * Incoming Request → Guards → Pipes → Handler
 *
 * Pipes can:
 * - Transform data (e.g., string to number)
 * - Validate data (e.g., using Standard Schema)
 * - Provide default values
 */

import type { Context } from "../context";
import type { Token } from "../container";
import type { StandardSchema } from "../types";
import { validate, isStandardSchema, type ValidationResult } from "../validation";

// ============= Types =============

/**
 * Parameter metadata available to pipes
 */
export interface ParameterMetadata {
	/** Parameter index */
	index: number;
	/** Parameter name if available */
	name?: string;
	/** Decorator type (body, query, param, etc.) */
	decorator?: string;
}

/**
 * Context available to pipes during transformation
 */
export interface PipeContext {
	/** The request context */
	context: Context;
	/** Parameter metadata */
	metadata?: ParameterMetadata;
	/** Target type information */
	type?: unknown;
}

/**
 * Pipe interface for data transformation
 *
 * @example
 * ```typescript
 * class ParseIntPipe implements PipeTransform<string, number> {
 *   transform(value: string, context: PipeContext): number {
 *     const parsed = parseInt(value, 10);
 *     if (isNaN(parsed)) {
 *       throw new Error('Validation failed');
 *     }
 *     return parsed;
 *   }
 * }
 * ```
 */
export interface PipeTransform<T = unknown, R = unknown> {
	transform(value: T, context: PipeContext): R | Promise<R>;
}

/**
 * Pipe function type (for functional pipes)
 *
 * @example
 * ```typescript
 * const trimPipe: PipeFn<string, string> = (value) => value.trim();
 * ```
 */
export type PipeFn<T = unknown, R = unknown> = (
	value: T,
	context: PipeContext
) => R | Promise<R>;

/**
 * Pipe type - can be:
 * - A token for a pipe class registered in the container
 * - A pipe class instance
 * - A pipe function
 */
export type Pipe<T = unknown, R = unknown> =
	| Token<PipeTransform<T, R>>
	| PipeTransform<T, R>
	| PipeFn<T, R>;

// ============= Metadata Storage =============

// Type alias for class constructors
type Constructor = new (...args: unknown[]) => unknown;

// WeakMap for storing pipes metadata on method prototypes
const pipesMethodMetadata = new WeakMap<object, Map<string | symbol, ParameterPipeMetadata[]>>();

/**
 * Metadata for a parameter with pipes
 */
export interface ParameterPipeMetadata {
	/** Parameter index */
	index: number;
	/** Parameter decorator type */
	decorator: 'body' | 'query' | 'param' | 'custom';
	/** Key for query/param decorators */
	key?: string;
	/** Schema for validation */
	schema?: StandardSchema;
	/** Pipes to apply */
	pipes: Pipe[];
}

/**
 * Set pipes metadata on a method
 */
function setMethodPipes(
	target: object,
	propertyKey: string | symbol,
	metadata: ParameterPipeMetadata[]
): void {
	if (!pipesMethodMetadata.has(target)) {
		pipesMethodMetadata.set(target, new Map());
	}
	pipesMethodMetadata.get(target)?.set(propertyKey, metadata);
}

/**
 * Get pipes metadata from a method
 */
export function getMethodPipes(
	target: object,
	propertyKey: string | symbol
): ParameterPipeMetadata[] | undefined {
	return pipesMethodMetadata.get(target)?.get(propertyKey);
}

// ============= Pipe Decorator =============

/**
 * Decorator to apply pipes to a parameter.
 * Pipes are executed in the order they are provided.
 *
 * @param pipes - Pipes to apply
 * @returns ParameterDecorator
 *
 * @example
 * ```typescript
 * @Get(':id')
 * getUser(@Param('id', ParseIntPipe) id: number) {}
 * ```
 */
export function UsePipes(...pipes: Pipe[]): ParameterDecorator {
	return (
		target: unknown,
		propertyKey: string | symbol | undefined,
		parameterIndex: number
	) => {
		if (propertyKey === undefined) {
			throw new Error("UsePipes can only be used on method parameters");
		}

		const targetObj = target as object;
		const existing = getMethodPipes(targetObj, propertyKey) ?? [];
		
		// Find existing metadata for this parameter or create new
		const existingParam = existing.find(p => p.index === parameterIndex);
		if (existingParam) {
			existingParam.pipes.push(...pipes);
		} else {
			existing.push({
				index: parameterIndex,
				decorator: 'custom',
				pipes: [...pipes]
			});
		}
		
		setMethodPipes(targetObj, propertyKey, existing);
	};
}

// ============= Parameter Decorators =============

/**
 * Extract and optionally validate request body.
 *
 * @param schema - Optional Standard Schema for validation
 * @returns ParameterDecorator
 *
 * @example
 * ```typescript
 * @Post()
 * createUser(@Body(userSchema) body: User) {}
 * ```
 */
export function Body(schema?: StandardSchema): ParameterDecorator {
	return (
		target: unknown,
		propertyKey: string | symbol | undefined,
		parameterIndex: number
	) => {
		if (propertyKey === undefined) {
			throw new Error("Body can only be used on method parameters");
		}

		const targetObj = target as object;
		const existing = getMethodPipes(targetObj, propertyKey) ?? [];
		
		existing.push({
			index: parameterIndex,
			decorator: 'body',
			schema,
			pipes: schema ? [new ValidationPipe(schema)] : []
		});
		
		setMethodPipes(targetObj, propertyKey, existing);
	};
}

/**
 * Extract and optionally validate query parameter.
 *
 * @param key - Query parameter key (optional, if omitted returns all query params)
 * @param schema - Optional Standard Schema for validation
 * @returns ParameterDecorator
 *
 * @example
 * ```typescript
 * @Get()
 * search(@Query('q') query: string) {}
 *
 * @Get()
 * search(@Query('limit', limitSchema) limit: number) {}
 * ```
 */
export function Query(key?: string, schema?: StandardSchema): ParameterDecorator {
	return (
		target: unknown,
		propertyKey: string | symbol | undefined,
		parameterIndex: number
	) => {
		if (propertyKey === undefined) {
			throw new Error("Query can only be used on method parameters");
		}

		const targetObj = target as object;
		const existing = getMethodPipes(targetObj, propertyKey) ?? [];
		
		existing.push({
			index: parameterIndex,
			decorator: 'query',
			key,
			schema,
			pipes: schema ? [new ValidationPipe(schema)] : []
		});
		
		setMethodPipes(targetObj, propertyKey, existing);
	};
}

/**
 * Extract and transform route parameter.
 *
 * @param key - Route parameter key (optional, if omitted returns all params)
 * @param pipes - Pipes to apply for transformation
 * @returns ParameterDecorator
 *
 * @example
 * ```typescript
 * @Get(':id')
 * getUser(@Param('id', ParseIntPipe) id: number) {}
 * ```
 */
export function Param(key?: string, ...pipes: Pipe[]): ParameterDecorator {
	return (
		target: unknown,
		propertyKey: string | symbol | undefined,
		parameterIndex: number
	) => {
		if (propertyKey === undefined) {
			throw new Error("Param can only be used on method parameters");
		}

		const targetObj = target as object;
		const existing = getMethodPipes(targetObj, propertyKey) ?? [];
		
		existing.push({
			index: parameterIndex,
			decorator: 'param',
			key,
			pipes: [...pipes]
		});
		
		setMethodPipes(targetObj, propertyKey, existing);
	};
}

// ============= Built-in Pipes =============

/**
 * ValidationPipe - Validates using Standard Schema
 *
 * @example
 * ```typescript
 * @Body(userSchema) body: User
 * // or explicitly
 * @UsePipes(new ValidationPipe(userSchema))
 * ```
 */
export class ValidationPipe<T = unknown> implements PipeTransform<unknown, T> {
	constructor(private schema: StandardSchema<unknown, T>) {}

	async transform(value: unknown, context: PipeContext): Promise<T> {
		const result: ValidationResult<T> = await validate(this.schema, value);
		
		if (result.success) {
			return result.data;
		}
		
		// Validation failed
		const failedResult = result as Extract<ValidationResult<T>, { success: false }>;
		const error = new Error("Validation failed");
		(error as Error & { issues: unknown[] }).issues = [...failedResult.issues];
		throw error;
	}
}

/**
 * ParseIntPipe - Transforms string to integer
 *
 * @example
 * ```typescript
 * @Param('id', ParseIntPipe) id: number
 * ```
 */
export class ParseIntPipe implements PipeTransform<string, number> {
	transform(value: string, context: PipeContext): number {
		const parsed = parseInt(value, 10);
		
		if (isNaN(parsed)) {
			throw new Error(`Validation failed: "${value}" is not a valid integer`);
		}
		
		return parsed;
	}
}

/**
 * ParseFloatPipe - Transforms string to float
 *
 * @example
 * ```typescript
 * @Param('price', ParseFloatPipe) price: number
 * ```
 */
export class ParseFloatPipe implements PipeTransform<string, number> {
	transform(value: string, context: PipeContext): number {
		const parsed = parseFloat(value);
		
		if (isNaN(parsed)) {
			throw new Error(`Validation failed: "${value}" is not a valid number`);
		}
		
		return parsed;
	}
}

/**
 * ParseBoolPipe - Transforms string to boolean
 *
 * @example
 * ```typescript
 * @Query('active', ParseBoolPipe) active: boolean
 * ```
 */
export class ParseBoolPipe implements PipeTransform<string, boolean> {
	private readonly truthyValues = ['true', '1', 'yes', 'on'];
	private readonly falsyValues = ['false', '0', 'no', 'off'];

	transform(value: string, context: PipeContext): boolean {
		const lower = value.toLowerCase();
		
		if (this.truthyValues.includes(lower)) {
			return true;
		}
		
		if (this.falsyValues.includes(lower)) {
			return false;
		}
		
		throw new Error(`Validation failed: "${value}" is not a valid boolean`);
	}
}

/**
 * DefaultValuePipe - Provides default value when input is undefined or null
 *
 * @example
 * ```typescript
 * @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
 * ```
 */
export class DefaultValuePipe<T> implements PipeTransform<unknown, T> {
	constructor(private defaultValue: T) {}

	transform(value: unknown, context: PipeContext): T {
		if (value === undefined || value === null) {
			return this.defaultValue;
		}
		return value as T;
	}
}

/**
 * TrimPipe - Trims string whitespace
 *
 * @example
 * ```typescript
 * @Query('name', TrimPipe) name: string
 * ```
 */
export class TrimPipe implements PipeTransform<string, string> {
	transform(value: string, context: PipeContext): string {
		if (typeof value !== 'string') {
			throw new Error('Value must be a string');
		}
		return value.trim();
	}
}

/**
 * ParseJsonPipe - Parses JSON string to object
 *
 * @example
 * ```typescript
 * @Query('data', ParseJsonPipe) data: MyObject
 * ```
 */
export class ParseJsonPipe<T = unknown> implements PipeTransform<string, T> {
	transform(value: string, context: PipeContext): T {
		try {
			return JSON.parse(value) as T;
		} catch {
			throw new Error(`Validation failed: "${value}" is not valid JSON`);
		}
	}
}

/**
 * ParseArrayPipe - Transforms comma-separated string to array
 *
 * @example
 * ```typescript
 * @Query('tags', ParseArrayPipe) tags: string[]
 * ```
 */
export class ParseArrayPipe implements PipeTransform<string, string[]> {
	constructor(private separator: string = ',') {}

	transform(value: string, context: PipeContext): string[] {
		if (typeof value !== 'string') {
			throw new Error('Value must be a string');
		}
		return value.split(this.separator).map(s => s.trim()).filter(s => s.length > 0);
	}
}

// ============= Pipe Executor =============

/**
 * Pipe executor options
 */
export interface PipeExecutorOptions {
	/** Global pipes applied to all parameters */
	globalPipes?: Pipe[];
	/** Pipes from parameter decorator */
	parameterPipes?: Pipe[];
	/** Container for resolving pipe instances */
	resolvePipe?: (pipe: Pipe) => PipeTransform | PipeFn | null;
}

/**
 * Execute pipes in order and return the transformed value
 *
 * @param value - Initial value to transform
 * @param context - Pipe context
 * @param options - Pipe executor options
 * @returns Transformed value
 * @throws Error if any pipe fails
 */
export async function executePipes<T = unknown>(
	value: unknown,
	context: PipeContext,
	options: PipeExecutorOptions
): Promise<T> {
	const { globalPipes = [], parameterPipes = [], resolvePipe } = options;

	// Combine all pipes in execution order
	const allPipes = [...globalPipes, ...parameterPipes];

	let currentValue: unknown = value;

	// Execute each pipe in order
	for (const pipe of allPipes) {
		let pipeInstance: PipeTransform | PipeFn | null = null;

		// Resolve the pipe
		if (typeof pipe === "function") {
			// Check if it's a pipe function or a class constructor
			const funcPipe = pipe as { prototype?: unknown; transform?: unknown };
			if (funcPipe.prototype && typeof funcPipe.prototype === "object" &&
				"transform" in (funcPipe.prototype as object)) {
				// It's a class constructor - try to resolve from container or create instance
				pipeInstance = resolvePipe ? resolvePipe(pipe) : null;
				if (!pipeInstance) {
					// Create a new instance if not in container
					const PipeClass = pipe as unknown as new () => PipeTransform;
					pipeInstance = new PipeClass();
				}
			} else {
				// It's a pipe function
				pipeInstance = pipe as PipeFn;
			}
		} else if (typeof pipe === "object" && pipe !== null) {
			// It's a token or already an instance
			const objPipe = pipe as { transform?: unknown };
			if ("transform" in objPipe && typeof objPipe.transform === "function") {
				// It's already a PipeTransform instance
				pipeInstance = pipe as PipeTransform;
			} else {
				// It's a token - try to resolve
				pipeInstance = resolvePipe ? resolvePipe(pipe) : null;
			}
		}

		if (!pipeInstance) {
			console.warn("Pipe could not be resolved:", pipe);
			continue;
		}

		// Execute the pipe
		if (typeof pipeInstance === "function") {
			// Pipe function
			currentValue = await pipeInstance(currentValue, context);
		} else {
			// PipeTransform instance
			currentValue = await pipeInstance.transform(currentValue, context);
		}
	}

	return currentValue as T;
}

// ============= Parameter Value Extractor =============

/**
 * Extract parameter value from context based on decorator type
 */
export async function extractParameterValue(
	context: Context,
	metadata: ParameterPipeMetadata
): Promise<unknown> {
	switch (metadata.decorator) {
		case 'body':
			return await context.body();
		
		case 'query':
			if (metadata.key) {
				return context.query[metadata.key];
			}
			return context.query;
		
		case 'param':
			if (metadata.key) {
				return context.params[metadata.key];
			}
			return context.params;
		
		case 'custom':
		default:
			return undefined;
	}
}

// ============= Error Response =============

/**
 * Create a 400 Bad Request response for pipe errors
 */
export function createBadRequestResponse(error: Error): Response {
	const issues = (error as Error & { issues?: unknown[] }).issues;
	
	return new Response(JSON.stringify({
		statusCode: 400,
		error: "Bad Request",
		message: error.message,
		...(issues && { issues })
	}), {
		status: 400,
		headers: {
			"Content-Type": "application/json",
		},
	});
}

// ============= Type Guards =============

/**
 * Check if a value is a PipeTransform instance
 */
export function isPipeTransform(value: unknown): value is PipeTransform {
	return (
		typeof value === "object" &&
		value !== null &&
		"transform" in value &&
		typeof (value as PipeTransform).transform === "function"
	);
}

/**
 * Check if a value is a pipe function
 */
export function isPipeFn(value: unknown): value is PipeFn {
	return typeof value === "function" && !isPipeTransform(value);
}