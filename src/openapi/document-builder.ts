/**
 * OpenAPI Document Builder
 *
 * Fluent API for building OpenAPI 3.1 documents with configuration for
 * servers, security schemes, tags, and other top-level metadata.
 */

import type {
	ApiKeySecurityOptions,
	OpenAPIComponents,
	OpenAPIDocument,
	OpenAPISecurityScheme,
	OpenAPIServer,
	OpenAPITag,
	SecuritySchemeOptions,
} from './types';

/**
 * DocumentBuilder - Fluent API for constructing OpenAPI documents
 *
 * @example
 * ```typescript
 * const document = new DocumentBuilder()
 *   .setTitle('My API')
 *   .setVersion('1.0.0')
 *   .setDescription('API description')
 *   .addBearerAuth()
 *   .addTag('users', 'User management endpoints')
 *   .build();
 * ```
 */
export class DocumentBuilder {
	private document: Partial<OpenAPIDocument> = {
		openapi: '3.1.0',
		info: {
			title: 'API',
			version: '1.0.0',
		},
		paths: {},
		components: {
			schemas: {},
			securitySchemes: {},
		},
		tags: [],
	};

	/**
	 * Set the API title
	 */
	setTitle(title: string): this {
		if (!this.document.info) {
			this.document.info = { title, version: '1.0.0' };
		} else {
			this.document.info.title = title;
		}
		return this;
	}

	/**
	 * Set the API description
	 */
	setDescription(description: string): this {
		if (!this.document.info) {
			this.document.info = { title: 'API', version: '1.0.0', description };
		} else {
			this.document.info.description = description;
		}
		return this;
	}

	/**
	 * Set the API version
	 */
	setVersion(version: string): this {
		if (!this.document.info) {
			this.document.info = { title: 'API', version };
		} else {
			this.document.info.version = version;
		}
		return this;
	}

	/**
	 * Set contact information
	 */
	setContact(name: string, url?: string, email?: string): this {
		if (!this.document.info) {
			this.document.info = { title: 'API', version: '1.0.0' };
		}
		this.document.info.contact = { name, url, email };
		return this;
	}

	/**
	 * Set license information
	 */
	setLicense(name: string, url?: string): this {
		if (!this.document.info) {
			this.document.info = { title: 'API', version: '1.0.0' };
		}
		this.document.info.license = { name, url };
		return this;
	}

	/**
	 * Add a server
	 */
	addServer(url: string, description?: string): this {
		if (!this.document.servers) {
			this.document.servers = [];
		}
		this.document.servers.push({ url, description });
		return this;
	}

	/**
	 * Add Bearer token authentication
	 *
	 * @example
	 * ```typescript
	 * builder.addBearerAuth('JWT')
	 * ```
	 */
	addBearerAuth(
		name = 'bearer',
		options?: SecuritySchemeOptions,
	): this {
		if (!this.document.components) {
			this.document.components = { schemas: {}, securitySchemes: {} };
		}
		if (!this.document.components.securitySchemes) {
			this.document.components.securitySchemes = {};
		}

		const scheme: OpenAPISecurityScheme = {
			type: 'http',
			scheme: 'bearer',
			bearerFormat: options?.bearerFormat ?? 'JWT',
		};

		if (options?.description) {
			scheme.description = options.description;
		}

		this.document.components.securitySchemes[name] = scheme;
		return this;
	}

	/**
	 * Add Basic authentication
	 */
	addBasicAuth(name = 'basic', options?: SecuritySchemeOptions): this {
		if (!this.document.components) {
			this.document.components = { schemas: {}, securitySchemes: {} };
		}
		if (!this.document.components.securitySchemes) {
			this.document.components.securitySchemes = {};
		}

		const scheme: OpenAPISecurityScheme = {
			type: 'http',
			scheme: 'basic',
		};

		if (options?.description) {
			scheme.description = options.description;
		}

		this.document.components.securitySchemes[name] = scheme;
		return this;
	}

	/**
	 * Add API Key authentication
	 */
	addApiKey(
		options: ApiKeySecurityOptions,
		name = 'api_key',
	): this {
		if (!this.document.components) {
			this.document.components = { schemas: {}, securitySchemes: {} };
		}
		if (!this.document.components.securitySchemes) {
			this.document.components.securitySchemes = {};
		}

		const scheme: OpenAPISecurityScheme = {
			type: 'apiKey',
			name: options.name,
			in: options.in,
		};

		if (options.description) {
			scheme.description = options.description;
		}

		this.document.components.securitySchemes[name] = scheme;
		return this;
	}

	/**
	 * Add an OAuth2 security scheme
	 */
	addOAuth2(
		name: string,
		authorizationUrl: string,
		tokenUrl?: string,
		refreshUrl?: string,
	): this {
		if (!this.document.components) {
			this.document.components = { schemas: {}, securitySchemes: {} };
		}
		if (!this.document.components.securitySchemes) {
			this.document.components.securitySchemes = {};
		}

		this.document.components.securitySchemes[name] = {
			type: 'oauth2',
			flows: {
				authorizationCode: {
					authorizationUrl,
					tokenUrl: tokenUrl || '',
					refreshUrl,
					scopes: {},
				},
			},
		};

		return this;
	}

	/**
	 * Add an OpenID Connect security scheme
	 */
	addOpenIdConnect(name: string, url: string): this {
		if (!this.document.components) {
			this.document.components = { schemas: {}, securitySchemes: {} };
		}
		if (!this.document.components.securitySchemes) {
			this.document.components.securitySchemes = {};
		}

		this.document.components.securitySchemes[name] = {
			type: 'openIdConnect',
			openIdConnectUrl: url,
		};

		return this;
	}

	/**
	 * Add a tag for organizing operations
	 */
	addTag(name: string, description?: string): this {
		if (!this.document.tags) {
			this.document.tags = [];
		}

		const tag: OpenAPITag = { name };
		if (description) {
			tag.description = description;
		}

		this.document.tags.push(tag);
		return this;
	}

	/**
	 * Build and return the final OpenAPI document
	 */
	build(): OpenAPIDocument {
		return this.document as OpenAPIDocument;
	}
}
