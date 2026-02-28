/**
 * OpenAPI Module
 *
 * Auto-generate OpenAPI 3.1 specifications from Bueno controllers and decorators.
 * Provides decorators for documenting API endpoints and a SwaggerModule for setup.
 *
 * @example
 * ```typescript
 * import {
 *   DocumentBuilder,
 *   SwaggerModule,
 *   ApiOperation,
 *   ApiResponse,
 *   ApiTags,
 * } from '@buenojs/bueno/openapi';
 *
 * // 1. Document your controller
 * @Controller('/users')
 * @ApiTags('users')
 * class UsersController {
 *   @Get()
 *   @ApiOperation({ summary: 'List all users' })
 *   @ApiResponse({ status: 200, description: 'Success', type: [User] })
 *   async getAll() { ... }
 * }
 *
 * // 2. Create OpenAPI document
 * const config = new DocumentBuilder()
 *   .setTitle('My API')
 *   .setVersion('1.0.0')
 *   .addBearerAuth()
 *   .build();
 *
 * const document = SwaggerModule.createDocument(app, config, [UsersController]);
 *
 * // 3. Setup Swagger UI
 * SwaggerModule.setup('/api-docs', app, document);
 * ```
 */

// ============= Type Exports =============

export type {
	OpenAPIDocument,
	OpenAPIInfo,
	OpenAPIContact,
	OpenAPILicense,
	OpenAPIServer,
	OpenAPIPaths,
	OpenAPIPath,
	OpenAPIOperation,
	OpenAPIExternalDocs,
	OpenAPIParameter,
	OpenAPIRequestBody,
	OpenAPIMediaType,
	OpenAPIExample,
	OpenAPIResponse,
	OpenAPIHeader,
	OpenAPIResponses,
	OpenAPISchema,
	OpenAPIDiscriminator,
	OpenAPIXML,
	OpenAPIComponents,
	OpenAPISecurityScheme,
	OpenAPIOAuthFlows,
	OpenAPIOAuthFlow,
	OpenAPISecurity,
	OpenAPITag,
	SwaggerOptions,
	ApiOperationOptions,
	ApiResponseOptions,
	ApiParamOptions,
	ApiQueryOptions,
	ApiHeaderOptions,
	ApiBodyOptions,
	ApiPropertyOptions,
	SecuritySchemeOptions,
	ApiKeySecurityOptions,
	Constructor,
} from './types';

// ============= Class Exports =============

export { DocumentBuilder } from './document-builder';
export { SchemaGenerator } from './schema-generator';
export { RouteScanner } from './route-scanner';
export { SwaggerModule } from './swagger-module';

// ============= Decorator Exports =============

// Class-level decorators
export {
	ApiTags,
	ApiBearerAuth,
	ApiBasicAuth,
	ApiApiKey,
	ApiExcludeController,
} from './decorators';

// Method-level decorators
export {
	ApiOperation,
	ApiResponse,
	ApiParam,
	ApiQuery,
	ApiHeader,
	ApiBody,
	ApiExcludeEndpoint,
} from './decorators';

// Property-level decorators (for DTOs)
export { ApiProperty, ApiPropertyOptional } from './decorators';
