/**
 * Route Scanner
 *
 * Scans controllers and extracts OpenAPI operation metadata from decorators.
 * Combines HTTP method decorators, parameter documentation, and responses
 * into OpenAPI operation objects.
 */

import type {
	Constructor,
	OpenAPIMediaType,
	OpenAPIOperation,
	OpenAPIPaths,
	OpenAPIResponse,
	OpenAPISchema,
} from './types';
import { getApiMetadata, getApiMethodMetadata } from './metadata';
// Read controller path and route list from the modules metadata stores
import { getMetadata, getPrototypeMetadata } from '../modules/metadata';
import { SchemaGenerator } from './schema-generator';

interface RouteInfo {
	method: string;
	path: string;
	handler: string | symbol;
}

/**
 * RouteScanner - Scans controllers and extracts OpenAPI operations
 */
export class RouteScanner {
	constructor(private schemaGenerator: SchemaGenerator) {}

	/**
	 * Scan all controllers and generate OpenAPI paths
	 */
	scanControllers(controllers: Constructor[]): OpenAPIPaths {
		const paths: OpenAPIPaths = {};

		for (const controller of controllers) {
			// Skip controllers marked with @ApiExcludeController
			if (getApiMetadata<boolean>(controller, 'api:exclude')) {
				continue;
			}

			// Get controller base path from @Controller decorator (stored in modules metadata)
			const basePath = getMetadata<string>(controller, 'path') ?? '';

			// Get routes from prototype metadata (stored by @Get, @Post, etc. in modules metadata)
			const routes =
				getPrototypeMetadata<RouteInfo[]>(controller.prototype, 'routes') ?? [];

			// Get class-level tags and security from OpenAPI metadata
			const classLevelTags = getApiMetadata<string[]>(controller, 'api:tags') ?? [];
			const classLevelSecurity =
				getApiMetadata<Record<string, string[]>[]>(controller, 'api:security') ?? [];

			// Process each route in the controller
			for (const route of routes) {
				const prototype = controller.prototype;
				const handlerKey = route.handler;

				// Skip endpoints marked with @ApiExcludeEndpoint (per-method metadata)
				if (getApiMethodMetadata<boolean>(prototype, `api:exclude:${String(handlerKey)}`)) {
					continue;
				}

				const fullPath = this.convertPathToOpenAPI(basePath + route.path);

				// Ensure path exists in paths object
				if (!paths[fullPath]) {
					paths[fullPath] = {};
				}

				// Generate the operation
				const operation = this.generateOperation(
					controller,
					route,
					classLevelTags,
					classLevelSecurity,
					basePath,
				);

				// Add operation to the path (always write — overwrite if duplicate method)
				(paths[fullPath] as Record<string, OpenAPIOperation>)[
					route.method.toLowerCase()
				] = operation;
			}
		}

		return paths;
	}

	/**
	 * Generate an OpenAPI operation for a single route
	 */
	private generateOperation(
		controller: Constructor,
		route: RouteInfo,
		classLevelTags: string[],
		classLevelSecurity: Record<string, string[]>[],
		basePath: string,
	): OpenAPIOperation {
		const prototype = controller.prototype;
		const handlerKey = String(route.handler);

		// Helper to read per-method OpenAPI metadata — stored under "api:<key>:<handler>"
		const getMethodMeta = <T>(key: string): T | undefined =>
			getApiMethodMetadata<T>(prototype, `${key}:${handlerKey}`);

		// Get operation metadata from decorators
		const operationMeta = getMethodMeta<{
			summary?: string;
			description?: string;
			operationId?: string;
			deprecated?: boolean;
		}>('api:operation');

		const responseMeta =
			getMethodMeta<
				Array<{
					status: number | 'default';
					description: string;
					type?: Constructor | Constructor[];
					schema?: OpenAPISchema;
				}>
			>('api:responses') ?? [];

		const paramMeta =
			getMethodMeta<
				Array<{
					name: string;
					type?: string;
					description?: string;
					required?: boolean;
					example?: unknown;
					schema?: OpenAPISchema;
				}>
			>('api:params') ?? [];

		const queryMeta =
			getMethodMeta<
				Array<{
					name: string;
					type?: string;
					description?: string;
					required?: boolean;
					example?: unknown;
					schema?: OpenAPISchema;
				}>
			>('api:query') ?? [];

		const headerMeta =
			getMethodMeta<
				Array<{
					name: string;
					description?: string;
					required?: boolean;
					schema?: OpenAPISchema;
				}>
			>('api:headers') ?? [];

		const bodyMeta = getMethodMeta<{
			type?: Constructor;
			description?: string;
			required?: boolean;
			schema?: OpenAPISchema;
		}>('api:body');

		const methodLevelTags = getMethodMeta<string[]>('api:tags') ?? [];

		const methodLevelSecurity =
			getMethodMeta<Record<string, string[]>[]>('api:security') ?? [];

		// Build parameters array
		const parameters = [
			...paramMeta.map((p) => ({
				name: p.name,
				in: 'path' as const,
				description: p.description,
				required: p.required ?? true,
				example: p.example,
				schema: p.schema,
			})),
			...queryMeta.map((q) => ({
				name: q.name,
				in: 'query' as const,
				description: q.description,
				required: q.required ?? false,
				example: q.example,
				schema: q.schema,
			})),
			...headerMeta.map((h) => ({
				name: h.name,
				in: 'header' as const,
				description: h.description,
				required: h.required,
				schema: h.schema,
			})),
		];

		// Build responses object (properly typed)
		const responses: Record<string, OpenAPIResponse> = {};

		for (const resp of responseMeta) {
			const statusCode = String(resp.status);
			const response: OpenAPIResponse = { description: resp.description };

			// Add schema if provided
			if (resp.type || resp.schema) {
				let schema: OpenAPISchema = resp.schema ?? {};

				if (resp.type) {
					if (Array.isArray(resp.type)) {
						const itemSchema = this.schemaGenerator.generateSchema(resp.type[0]);
						schema = { type: 'array', items: itemSchema };
					} else {
						schema = this.schemaGenerator.generateSchema(resp.type);
					}
				}

				const mediaType: OpenAPIMediaType = { schema };
				response.content = { 'application/json': mediaType };
			}

			responses[statusCode] = response;
		}

		// If no responses documented, add a default 200
		if (Object.keys(responses).length === 0) {
			responses['200'] = { description: 'Success' };
		}

		// Build request body if present
		const requestBody = bodyMeta
			? {
					description: bodyMeta.description,
					required: bodyMeta.required ?? true,
					content: {
						'application/json': {
							schema:
								bodyMeta.schema ??
								(bodyMeta.type
									? this.schemaGenerator.generateSchema(bodyMeta.type)
									: { type: 'object' as const }),
						} satisfies OpenAPIMediaType,
					},
				}
			: undefined;

		// Combine tags (class-level + method-level, deduplicated)
		const tags = [...new Set([...classLevelTags, ...methodLevelTags])];

		// Combine security
		const security = [...classLevelSecurity, ...methodLevelSecurity];

		// Build the operation
		const operation: OpenAPIOperation = {
			operationId:
				operationMeta?.operationId ??
				`${route.method.toLowerCase()}_${basePath.replace(/\//g, '_')}_${handlerKey}`,
			summary: operationMeta?.summary,
			description: operationMeta?.description,
			tags: tags.length > 0 ? tags : undefined,
			parameters: parameters.length > 0 ? parameters : undefined,
			requestBody,
			responses,
			deprecated: operationMeta?.deprecated,
			security: security.length > 0 ? security : undefined,
		};

		return operation;
	}

	/**
	 * Convert a route pattern from :param format to {param} format (OpenAPI style)
	 * Handles optional params (:param?) and regex params (:param<regex>)
	 */
	private convertPathToOpenAPI(pattern: string): string {
		return pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\??(?:<[^>]+>)?/g, '{$1}');
	}

	/**
	 * Get the schema generator instance
	 */
	getSchemaGenerator(): SchemaGenerator {
		return this.schemaGenerator;
	}
}
