/**
 * OpenAPI 3.1 Type Definitions
 *
 * Comprehensive type definitions for generating OpenAPI 3.1 specifications.
 */

// Type alias for class constructors
export type Constructor = new (...args: unknown[]) => unknown;

/**
 * OpenAPI Document - Root object containing the entire API specification
 */
export interface OpenAPIDocument {
	openapi: '3.1.0';
	info: OpenAPIInfo;
	servers?: OpenAPIServer[];
	paths: OpenAPIPaths;
	components?: OpenAPIComponents;
	security?: OpenAPISecurity[];
	tags?: OpenAPITag[];
}

/**
 * OpenAPI Info - Metadata about the API
 */
export interface OpenAPIInfo {
	title: string;
	version: string;
	description?: string;
	contact?: OpenAPIContact;
	license?: OpenAPILicense;
	termsOfService?: string;
}

export interface OpenAPIContact {
	name?: string;
	url?: string;
	email?: string;
}

export interface OpenAPILicense {
	name: string;
	url?: string;
}

/**
 * OpenAPI Server - Server information
 */
export interface OpenAPIServer {
	url: string;
	description?: string;
}

/**
 * OpenAPI Paths - Map of path patterns to path items
 */
export type OpenAPIPaths = Record<string, OpenAPIPath>;

/**
 * OpenAPI Path Item - HTTP operations for a path
 */
export interface OpenAPIPath {
	summary?: string;
	description?: string;
	get?: OpenAPIOperation;
	post?: OpenAPIOperation;
	put?: OpenAPIOperation;
	patch?: OpenAPIOperation;
	delete?: OpenAPIOperation;
	head?: OpenAPIOperation;
	options?: OpenAPIOperation;
	parameters?: OpenAPIParameter[];
}

/**
 * OpenAPI Operation - Single HTTP operation
 */
export interface OpenAPIOperation {
	operationId?: string;
	summary?: string;
	description?: string;
	tags?: string[];
	externalDocs?: OpenAPIExternalDocs;
	parameters?: OpenAPIParameter[];
	requestBody?: OpenAPIRequestBody;
	responses: OpenAPIResponses;
	callbacks?: Record<string, unknown>;
	deprecated?: boolean;
	security?: OpenAPISecurity[];
	servers?: OpenAPIServer[];
}

export interface OpenAPIExternalDocs {
	url: string;
	description?: string;
}

/**
 * OpenAPI Parameter - Request parameter (path, query, header, cookie)
 */
export interface OpenAPIParameter {
	name: string;
	in: 'path' | 'query' | 'header' | 'cookie';
	description?: string;
	required?: boolean;
	deprecated?: boolean;
	allowEmptyValue?: boolean;
	style?: string;
	explode?: boolean;
	allowReserved?: boolean;
	schema?: OpenAPISchema;
	example?: unknown;
	examples?: Record<string, OpenAPIExample>;
	content?: Record<string, OpenAPIMediaType>;
}

/**
 * OpenAPI Request Body
 */
export interface OpenAPIRequestBody {
	description?: string;
	content: Record<string, OpenAPIMediaType>;
	required?: boolean;
}

/**
 * OpenAPI Media Type
 */
export interface OpenAPIMediaType {
	schema?: OpenAPISchema;
	example?: unknown;
	examples?: Record<string, OpenAPIExample>;
	encoding?: Record<string, unknown>;
}

/**
 * OpenAPI Example
 */
export interface OpenAPIExample {
	summary?: string;
	description?: string;
	value?: unknown;
	externalValue?: string;
}

/**
 * OpenAPI Response
 */
export interface OpenAPIResponse {
	description: string;
	headers?: Record<string, OpenAPIHeader>;
	content?: Record<string, OpenAPIMediaType>;
	links?: Record<string, unknown>;
}

/**
 * OpenAPI Header
 */
export interface OpenAPIHeader {
	description?: string;
	required?: boolean;
	deprecated?: boolean;
	schema?: OpenAPISchema;
	example?: unknown;
	examples?: Record<string, OpenAPIExample>;
	content?: Record<string, OpenAPIMediaType>;
}

/**
 * OpenAPI Responses - Map of status codes to responses
 */
export type OpenAPIResponses = Record<string | 'default', OpenAPIResponse>;

/**
 * OpenAPI Schema - JSON Schema with OpenAPI extensions
 */
export interface OpenAPISchema {
	// JSON Schema keywords
	type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';
	format?: string;
	title?: string;
	description?: string;
	default?: unknown;
	example?: unknown;
	examples?: unknown[];

	// Object schema
	properties?: Record<string, OpenAPISchema>;
	required?: string[];
	additionalProperties?: boolean | OpenAPISchema;
	maxProperties?: number;
	minProperties?: number;

	// Array schema
	items?: OpenAPISchema;
	maxItems?: number;
	minItems?: number;
	uniqueItems?: boolean;

	// String schema
	maxLength?: number;
	minLength?: number;
	pattern?: string;

	// Numeric schema
	maximum?: number;
	minimum?: number;
	exclusiveMaximum?: boolean;
	exclusiveMinimum?: boolean;
	multipleOf?: number;

	// Enum
	enum?: unknown[];

	// Schema composition
	allOf?: OpenAPISchema[];
	oneOf?: OpenAPISchema[];
	anyOf?: OpenAPISchema[];
	not?: OpenAPISchema;

	// References
	$ref?: string;

	// OpenAPI extensions
	nullable?: boolean;
	discriminator?: OpenAPIDiscriminator;
	readOnly?: boolean;
	writeOnly?: boolean;
	xml?: OpenAPIXML;
	externalDocs?: OpenAPIExternalDocs;
	deprecated?: boolean;
}

export interface OpenAPIDiscriminator {
	propertyName: string;
	mapping?: Record<string, string>;
}

export interface OpenAPIXML {
	name?: string;
	namespace?: string;
	prefix?: string;
	attribute?: boolean;
	wrapped?: boolean;
}

/**
 * OpenAPI Components - Reusable schema definitions
 */
export interface OpenAPIComponents {
	schemas?: Record<string, OpenAPISchema>;
	responses?: Record<string, OpenAPIResponse>;
	parameters?: Record<string, OpenAPIParameter>;
	examples?: Record<string, OpenAPIExample>;
	requestBodies?: Record<string, OpenAPIRequestBody>;
	headers?: Record<string, OpenAPIHeader>;
	securitySchemes?: Record<string, OpenAPISecurityScheme>;
	links?: Record<string, unknown>;
	callbacks?: Record<string, unknown>;
	pathItems?: Record<string, OpenAPIPath>;
}

/**
 * OpenAPI Security Scheme
 */
export interface OpenAPISecurityScheme {
	type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
	description?: string;
	name?: string; // for apiKey
	in?: 'query' | 'header' | 'cookie'; // for apiKey
	scheme?: string; // for http (e.g., 'bearer', 'basic')
	bearerFormat?: string; // for http with bearer
	flows?: OpenAPIOAuthFlows; // for oauth2
	openIdConnectUrl?: string; // for openIdConnect
}

export interface OpenAPIOAuthFlows {
	implicit?: OpenAPIOAuthFlow;
	password?: OpenAPIOAuthFlow;
	clientCredentials?: OpenAPIOAuthFlow;
	authorizationCode?: OpenAPIOAuthFlow;
}

export interface OpenAPIOAuthFlow {
	authorizationUrl: string;
	tokenUrl?: string;
	refreshUrl?: string;
	scopes: Record<string, string>;
}

/**
 * OpenAPI Security - Security requirement object
 */
export type OpenAPISecurity = Record<string, string[]>;

/**
 * OpenAPI Tag - Tag information
 */
export interface OpenAPITag {
	name: string;
	description?: string;
	externalDocs?: OpenAPIExternalDocs;
}

/**
 * Options for Swagger UI
 */
export interface SwaggerOptions {
	title?: string;
	customCss?: string;
	customSiteTitle?: string;
	customfavIcon?: string;
	swaggerUrl?: string;
	swaggerVersion?: string;
}

/**
 * Decorator Options - Used when decorating controllers/methods
 */

export interface ApiOperationOptions {
	summary?: string;
	description?: string;
	operationId?: string;
	deprecated?: boolean;
}

export interface ApiResponseOptions {
	status: number | 'default';
	description: string;
	type?: Constructor | Constructor[];
	schema?: OpenAPISchema;
	headers?: Record<string, OpenAPIHeader>;
}

export interface ApiParamOptions {
	name: string;
	type?: 'string' | 'number' | 'boolean' | 'integer';
	description?: string;
	required?: boolean;
	example?: unknown;
	schema?: OpenAPISchema;
}

export interface ApiQueryOptions {
	name: string;
	type?: 'string' | 'number' | 'boolean' | 'integer' | 'array';
	description?: string;
	required?: boolean;
	example?: unknown;
	schema?: OpenAPISchema;
}

export interface ApiHeaderOptions {
	name: string;
	description?: string;
	required?: boolean;
	schema?: OpenAPISchema;
}

export interface ApiBodyOptions {
	type?: Constructor;
	description?: string;
	required?: boolean;
	schema?: OpenAPISchema;
}

export interface ApiPropertyOptions {
	description?: string;
	example?: unknown;
	type?: Constructor | string;
	format?: string;
	required?: boolean;
	nullable?: boolean;
	enum?: unknown[];
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	default?: unknown;
	readOnly?: boolean;
	writeOnly?: boolean;
	items?: OpenAPISchema;
	maxItems?: number;
	minItems?: number;
}

export interface SecuritySchemeOptions {
	description?: string;
	bearerFormat?: string;
}

export interface ApiKeySecurityOptions {
	in: 'header' | 'query' | 'cookie';
	name: string;
	description?: string;
}
