/**
 * OpenAPI Decorators
 *
 * Decorators for documenting controllers, methods, parameters, and DTOs with OpenAPI metadata.
 */

import type {
	ApiBodyOptions,
	ApiHeaderOptions,
	ApiKeySecurityOptions,
	ApiOperationOptions,
	ApiParamOptions,
	ApiPropertyOptions,
	ApiQueryOptions,
	ApiResponseOptions,
	Constructor,
	OpenAPISecurity,
	SecuritySchemeOptions,
} from './types';
import {
	getApiMetadata,
	getApiMethodMetadata,
	getApiPropertyMetadata,
	setApiMetadata,
	setApiMethodMetadata,
	setApiPropertyMetadata,
} from './metadata';

// ============= Class-Level Decorators =============

/**
 * Mark one or more tags that apply to all operations in this controller
 *
 * @example
 * ```typescript
 * @Controller('/users')
 * @ApiTags('users', 'accounts')
 * class UserController { ... }
 * ```
 */
export function ApiTags(...tags: string[]): ClassDecorator {
	return <TFunction extends Function>(target: TFunction): TFunction => {
		const existingTags = getApiMetadata<string[]>(target as unknown as Constructor, 'api:tags') ?? [];
		const combined = [...new Set([...existingTags, ...tags])];
		setApiMetadata(target as unknown as Constructor, 'api:tags', combined);
		return target;
	};
}

/**
 * Mark this controller with Bearer token authentication
 *
 * @example
 * ```typescript
 * @Controller('/api')
 * @ApiBearerAuth()
 * class ApiController { ... }
 * ```
 */
export function ApiBearerAuth(name = 'bearer', options?: SecuritySchemeOptions): ClassDecorator | MethodDecorator {
	return function (target: unknown, propertyKey?: string | symbol) {
		const security: OpenAPISecurity[] = [{ [name]: [] }];
		const targetObj = propertyKey
			? (target as object) // Method decorator
			: (target as unknown as Constructor); // Class decorator

		const store = propertyKey ? getApiMethodMetadata : getApiMetadata;
		const setSt = propertyKey ? setApiMethodMetadata : setApiMetadata;
		const existingSecurity = store<OpenAPISecurity[]>(
			targetObj,
			'api:security',
		) ?? [];

		setSt(targetObj, 'api:security', [...existingSecurity, ...security]);
		return propertyKey ? descriptor : target;
	} as any;
}

/**
 * Mark this controller with Basic authentication
 *
 * @example
 * ```typescript
 * @Controller('/api')
 * @ApiBasicAuth()
 * class ApiController { ... }
 * ```
 */
export function ApiBasicAuth(name = 'basic'): ClassDecorator | MethodDecorator {
	return function (target: unknown, propertyKey?: string | symbol) {
		const security: OpenAPISecurity[] = [{ [name]: [] }];
		const targetObj = propertyKey
			? (target as object) // Method decorator
			: (target as unknown as Constructor); // Class decorator

		const store = propertyKey ? getApiMethodMetadata : getApiMetadata;
		const setSt = propertyKey ? setApiMethodMetadata : setApiMetadata;
		const existingSecurity = store<OpenAPISecurity[]>(
			targetObj,
			'api:security',
		) ?? [];

		setSt(targetObj, 'api:security', [...existingSecurity, ...security]);
		return propertyKey ? descriptor : target;
	} as any;
}

/**
 * Mark this controller with API Key authentication
 *
 * @example
 * ```typescript
 * @Controller('/api')
 * @ApiApiKey({ in: 'header', name: 'X-API-Key' })
 * class ApiController { ... }
 * ```
 */
export function ApiApiKey(options: ApiKeySecurityOptions, name = 'api_key'): ClassDecorator | MethodDecorator {
	return function (target: unknown, propertyKey?: string | symbol) {
		const security: OpenAPISecurity[] = [{ [name]: [] }];
		const targetObj = propertyKey
			? (target as object) // Method decorator
			: (target as unknown as Constructor); // Class decorator

		const store = propertyKey ? getApiMethodMetadata : getApiMetadata;
		const setSt = propertyKey ? setApiMethodMetadata : setApiMetadata;
		const existingSecurity = store<OpenAPISecurity[]>(
			targetObj,
			'api:security',
		) ?? [];

		// Store security scheme metadata for document builder
		setSt(targetObj, `api:security:scheme:${name}`, options);
		setSt(targetObj, 'api:security', [...existingSecurity, ...security]);
		return propertyKey ? descriptor : target;
	} as any;
}

/**
 * Exclude this entire controller from OpenAPI documentation
 *
 * @example
 * ```typescript
 * @Controller('/internal')
 * @ApiExcludeController()
 * class InternalController { ... }
 * ```
 */
export function ApiExcludeController(): ClassDecorator {
	return <TFunction extends Function>(target: TFunction): TFunction => {
		setApiMetadata(target as unknown as Constructor, 'api:exclude', true);
		return target;
	};
}

// ============= Method-Level Decorators =============

/**
 * Document the operation (HTTP method) with summary, description, and other metadata
 *
 * @example
 * ```typescript
 * @Get('/:id')
 * @ApiOperation({ summary: 'Get user by ID', description: 'Retrieve a single user' })
 * getUser(@Param('id') id: string) { ... }
 * ```
 */
export function ApiOperation(options: ApiOperationOptions): MethodDecorator {
	return (target: unknown, propertyKey: string | symbol) => {
		setApiMethodMetadata(target as object, `api:operation:${String(propertyKey)}`, options);
	};
}

/**
 * Document an HTTP response from this operation
 * Can be used multiple times for different status codes
 *
 * @example
 * ```typescript
 * @ApiResponse({ status: 200, description: 'Success', type: UserDto })
 * @ApiResponse({ status: 404, description: 'Not found' })
 * getUser() { ... }
 * ```
 */
export function ApiResponse(options: ApiResponseOptions): MethodDecorator {
	return (target: unknown, propertyKey: string | symbol) => {
		const key = `api:responses:${String(propertyKey)}`;
		const existing = getApiMethodMetadata<ApiResponseOptions[]>(target as object, key) ?? [];
		existing.push(options);
		setApiMethodMetadata(target as object, key, existing);
	};
}

/**
 * Document a path parameter
 * Can be used multiple times for different parameters
 *
 * @example
 * ```typescript
 * @Get('/:userId/posts/:postId')
 * @ApiParam({ name: 'userId', type: 'string', description: 'User ID' })
 * @ApiParam({ name: 'postId', type: 'string', description: 'Post ID' })
 * getPost(@Param('userId') userId: string, @Param('postId') postId: string) { ... }
 * ```
 */
export function ApiParam(options: ApiParamOptions): MethodDecorator {
	return (target: unknown, propertyKey: string | symbol) => {
		const key = `api:params:${String(propertyKey)}`;
		const existing = getApiMethodMetadata<ApiParamOptions[]>(target as object, key) ?? [];
		existing.push(options);
		setApiMethodMetadata(target as object, key, existing);
	};
}

/**
 * Document a query parameter
 * Can be used multiple times for different parameters
 *
 * @example
 * ```typescript
 * @Get()
 * @ApiQuery({ name: 'page', type: 'number', description: 'Page number', required: false })
 * @ApiQuery({ name: 'limit', type: 'number', description: 'Items per page', required: false })
 * getUsers(@Query('page') page?: number, @Query('limit') limit?: number) { ... }
 * ```
 */
export function ApiQuery(options: ApiQueryOptions): MethodDecorator {
	return (target: unknown, propertyKey: string | symbol) => {
		const key = `api:query:${String(propertyKey)}`;
		const existing = getApiMethodMetadata<ApiQueryOptions[]>(target as object, key) ?? [];
		existing.push(options);
		setApiMethodMetadata(target as object, key, existing);
	};
}

/**
 * Document an HTTP header
 * Can be used multiple times for different headers
 *
 * @example
 * ```typescript
 * @Post()
 * @ApiHeader({ name: 'X-Request-ID', description: 'Request ID', required: true })
 * create() { ... }
 * ```
 */
export function ApiHeader(options: ApiHeaderOptions): MethodDecorator {
	return (target: unknown, propertyKey: string | symbol) => {
		const key = `api:headers:${String(propertyKey)}`;
		const existing = getApiMethodMetadata<ApiHeaderOptions[]>(target as object, key) ?? [];
		existing.push(options);
		setApiMethodMetadata(target as object, key, existing);
	};
}

/**
 * Document the request body
 *
 * @example
 * ```typescript
 * @Post()
 * @ApiBody({ type: CreateUserDto, description: 'User data to create' })
 * create(@Body() dto: CreateUserDto) { ... }
 * ```
 */
export function ApiBody(options: ApiBodyOptions): MethodDecorator {
	return (target: unknown, propertyKey: string | symbol) => {
		setApiMethodMetadata(target as object, `api:body:${String(propertyKey)}`, options);
	};
}

/**
 * Exclude this endpoint from OpenAPI documentation
 *
 * @example
 * ```typescript
 * @Get()
 * @ApiExcludeEndpoint()
 * internalOnly() { ... }
 * ```
 */
export function ApiExcludeEndpoint(): MethodDecorator {
	return (target: unknown, propertyKey: string | symbol) => {
		setApiMethodMetadata(target as object, `api:exclude:${String(propertyKey)}`, true);
	};
}

// ============= Property-Level Decorators (for DTOs) =============

/**
 * Document a DTO property with type, description, validation rules, etc.
 *
 * @example
 * ```typescript
 * class CreateUserDto {
 *   @ApiProperty({ description: 'Email address', example: 'user@example.com' })
 *   email: string;
 *
 *   @ApiProperty({ minLength: 2, maxLength: 50, description: 'Full name' })
 *   name: string;
 * }
 * ```
 */
export function ApiProperty(options?: ApiPropertyOptions): PropertyDecorator {
	return (target: object, propertyKey: string | symbol) => {
		const opts: ApiPropertyOptions = { ...options, required: options?.required !== false };
		setApiPropertyMetadata(target, propertyKey, opts);
	};
}

/**
 * Document an optional DTO property
 * Equivalent to ApiProperty with required: false
 *
 * @example
 * ```typescript
 * class UserFilterDto {
 *   @ApiPropertyOptional({ description: 'Filter by name', example: 'John' })
 *   name?: string;
 * }
 * ```
 */
export function ApiPropertyOptional(options?: Omit<ApiPropertyOptions, 'required'>): PropertyDecorator {
	return (target: object, propertyKey: string | symbol) => {
		const opts: ApiPropertyOptions = { ...options, required: false };
		setApiPropertyMetadata(target, propertyKey, opts);
	};
}
