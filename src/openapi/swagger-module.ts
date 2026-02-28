/**
 * Swagger Module
 *
 * Provides utilities to set up Swagger UI and integrate OpenAPI document generation
 * with a Bueno Application.
 */

import type { Application } from '../modules';
import type { Constructor, OpenAPIDocument, SwaggerOptions } from './types';
import { DocumentBuilder } from './document-builder';
import { RouteScanner } from './route-scanner';
import { SchemaGenerator } from './schema-generator';

/**
 * SwaggerModule - Static utilities for OpenAPI integration
 */
export class SwaggerModule {
	/**
	 * Create an OpenAPI document from a Bueno Application and controllers
	 *
	 * @param app - The Application instance
	 * @param config - Base OpenAPI document configuration
	 * @param controllers - Array of controller classes to scan
	 * @returns Complete OpenAPI document with paths and schemas
	 *
	 * @example
	 * ```typescript
	 * const document = SwaggerModule.createDocument(app, {
	 *   openapi: '3.1.0',
	 *   info: { title: 'My API', version: '1.0.0' },
	 *   paths: {},
	 * }, [UserController, PostController]);
	 * ```
	 */
	static createDocument(
		app: Application,
		config: OpenAPIDocument,
		controllers: Constructor[],
	): OpenAPIDocument {
		const schemaGenerator = new SchemaGenerator();
		const scanner = new RouteScanner(schemaGenerator);

		// Scan controllers to get paths and schemas
		const paths = scanner.scanControllers(controllers);
		const schemas = schemaGenerator.getSchemas();

		// Merge with the provided config
		return {
			...config,
			paths: {
				...config.paths,
				...paths,
			},
			components: {
				...config.components,
				schemas: {
					...(config.components?.schemas ?? {}),
					...schemas,
				},
			},
		};
	}

	/**
	 * Setup Swagger UI and JSON endpoint
	 *
	 * Registers two routes:
	 * - GET {path} - Swagger UI HTML page
	 * - GET {path}-json - OpenAPI JSON document
	 *
	 * @param path - Base path for Swagger UI (e.g., '/api-docs')
	 * @param app - The Application instance
	 * @param document - OpenAPI document to serve
	 * @param options - Swagger UI configuration options
	 *
	 * @example
	 * ```typescript
	 * const document = SwaggerModule.createDocument(app, config, controllers);
	 * SwaggerModule.setup('/api-docs', app, document, {
	 *   title: 'My API Documentation',
	 * });
	 * ```
	 */
	static setup(
		path: string,
		app: Application,
		document: OpenAPIDocument,
		options?: SwaggerOptions,
	): void {
		// Register JSON endpoint
		app.router.get(`${path}-json`, (ctx) => {
			return ctx.json(document);
		});

		// Register Swagger UI endpoint
		app.router.get(path, (ctx) => {
			const html = this.generateSwaggerUI(path, document, options);
			return ctx.html(html);
		});
	}

	/**
	 * Generate Swagger UI HTML
	 */
	private static generateSwaggerUI(
		jsonPath: string,
		document: OpenAPIDocument,
		options?: SwaggerOptions,
	): string {
		const title = options?.title ?? 'API Documentation';
		const customCss = options?.customCss ?? '';
		const customSiteTitle = options?.customSiteTitle ?? title;
		const favicon = options?.customfavIcon ?? '';

		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${customSiteTitle}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: sans-serif;
    }
    ${customCss}
  </style>
  ${favicon ? `<link rel="icon" href="${favicon}">` : ''}
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '${jsonPath}-json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: 'StandaloneLayout',
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
      });
    };
  </script>
</body>
</html>`;
	}
}
