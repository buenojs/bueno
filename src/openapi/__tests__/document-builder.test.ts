import { describe, test, expect } from 'bun:test';
import { DocumentBuilder } from '../document-builder';

describe('DocumentBuilder', () => {
	describe('Basic configuration', () => {
		test('should create a basic document with defaults', () => {
			const builder = new DocumentBuilder();
			const doc = builder.build();

			expect(doc.openapi).toBe('3.1.0');
			expect(doc.info?.title).toBe('API');
			expect(doc.info?.version).toBe('1.0.0');
			expect(doc.paths).toBeDefined();
		});

		test('should set title', () => {
			const builder = new DocumentBuilder();
			builder.setTitle('My API');
			const doc = builder.build();

			expect(doc.info?.title).toBe('My API');
		});

		test('should set description', () => {
			const builder = new DocumentBuilder();
			builder.setDescription('API description');
			const doc = builder.build();

			expect(doc.info?.description).toBe('API description');
		});

		test('should set version', () => {
			const builder = new DocumentBuilder();
			builder.setVersion('2.0.0');
			const doc = builder.build();

			expect(doc.info?.version).toBe('2.0.0');
		});

		test('should set contact information', () => {
			const builder = new DocumentBuilder();
			builder.setContact('Support', 'https://support.example.com', 'support@example.com');
			const doc = builder.build();

			expect(doc.info?.contact?.name).toBe('Support');
			expect(doc.info?.contact?.url).toBe('https://support.example.com');
			expect(doc.info?.contact?.email).toBe('support@example.com');
		});

		test('should set license information', () => {
			const builder = new DocumentBuilder();
			builder.setLicense('MIT', 'https://opensource.org/licenses/MIT');
			const doc = builder.build();

			expect(doc.info?.license?.name).toBe('MIT');
			expect(doc.info?.license?.url).toBe('https://opensource.org/licenses/MIT');
		});
	});

	describe('Server configuration', () => {
		test('should add a single server', () => {
			const builder = new DocumentBuilder();
			builder.addServer('https://api.example.com', 'Production API');
			const doc = builder.build();

			expect(doc.servers).toBeDefined();
			expect(doc.servers?.length).toBe(1);
			expect(doc.servers?.[0].url).toBe('https://api.example.com');
			expect(doc.servers?.[0].description).toBe('Production API');
		});

		test('should add multiple servers', () => {
			const builder = new DocumentBuilder();
			builder
				.addServer('https://api.example.com', 'Production')
				.addServer('https://staging-api.example.com', 'Staging')
				.addServer('http://localhost:3000', 'Development');

			const doc = builder.build();
			expect(doc.servers?.length).toBe(3);
		});

		test('should add server without description', () => {
			const builder = new DocumentBuilder();
			builder.addServer('https://api.example.com');
			const doc = builder.build();

			expect(doc.servers?.[0].url).toBe('https://api.example.com');
			expect(doc.servers?.[0].description).toBeUndefined();
		});
	});

	describe('Security schemes', () => {
		test('should add bearer auth', () => {
			const builder = new DocumentBuilder();
			builder.addBearerAuth();
			const doc = builder.build();

			expect(doc.components?.securitySchemes?.['bearer']).toBeDefined();
			const bearer = doc.components?.securitySchemes?.['bearer'];
			expect(bearer?.type).toBe('http');
			expect(bearer?.scheme).toBe('bearer');
			expect(bearer?.bearerFormat).toBe('JWT');
		});

		test('should add bearer auth with custom format', () => {
			const builder = new DocumentBuilder();
			builder.addBearerAuth('jwt', { bearerFormat: 'Bearer' });
			const doc = builder.build();

			const bearer = doc.components?.securitySchemes?.['jwt'];
			expect(bearer?.bearerFormat).toBe('Bearer');
		});

		test('should add bearer auth with description', () => {
			const builder = new DocumentBuilder();
			builder.addBearerAuth('bearer', { description: 'JWT bearer token' });
			const doc = builder.build();

			const bearer = doc.components?.securitySchemes?.['bearer'];
			expect(bearer?.description).toBe('JWT bearer token');
		});

		test('should add basic auth', () => {
			const builder = new DocumentBuilder();
			builder.addBasicAuth();
			const doc = builder.build();

			expect(doc.components?.securitySchemes?.['basic']).toBeDefined();
			const basic = doc.components?.securitySchemes?.['basic'];
			expect(basic?.type).toBe('http');
			expect(basic?.scheme).toBe('basic');
		});

		test('should add API key auth', () => {
			const builder = new DocumentBuilder();
			builder.addApiKey({ in: 'header', name: 'X-API-Key' });
			const doc = builder.build();

			expect(doc.components?.securitySchemes?.['api_key']).toBeDefined();
			const apiKey = doc.components?.securitySchemes?.['api_key'];
			expect(apiKey?.type).toBe('apiKey');
			expect(apiKey?.in).toBe('header');
			expect(apiKey?.name).toBe('X-API-Key');
		});

		test('should add API key with description', () => {
			const builder = new DocumentBuilder();
			builder.addApiKey(
				{ in: 'header', name: 'X-API-Key', description: 'API key for access' },
				'api_key',
			);
			const doc = builder.build();

			const apiKey = doc.components?.securitySchemes?.['api_key'];
			expect(apiKey?.description).toBe('API key for access');
		});

		test('should add OAuth2 security scheme', () => {
			const builder = new DocumentBuilder();
			builder.addOAuth2('oauth2', 'https://example.com/oauth/authorize', 'https://example.com/oauth/token');
			const doc = builder.build();

			expect(doc.components?.securitySchemes?.['oauth2']).toBeDefined();
			const oauth2 = doc.components?.securitySchemes?.['oauth2'];
			expect(oauth2?.type).toBe('oauth2');
			expect((oauth2?.flows?.authorizationCode as any)?.authorizationUrl).toBe(
				'https://example.com/oauth/authorize',
			);
		});

		test('should add OpenID Connect security scheme', () => {
			const builder = new DocumentBuilder();
			builder.addOpenIdConnect('openid', 'https://example.com/.well-known/openid-configuration');
			const doc = builder.build();

			expect(doc.components?.securitySchemes?.['openid']).toBeDefined();
			const openid = doc.components?.securitySchemes?.['openid'];
			expect(openid?.type).toBe('openIdConnect');
			expect(openid?.openIdConnectUrl).toBe('https://example.com/.well-known/openid-configuration');
		});

		test('should add multiple security schemes', () => {
			const builder = new DocumentBuilder();
			builder
				.addBearerAuth()
				.addApiKey({ in: 'header', name: 'X-API-Key' })
				.addBasicAuth('basic2');

			const doc = builder.build();
			const schemes = doc.components?.securitySchemes;

			expect(Object.keys(schemes ?? {}).length).toBeGreaterThanOrEqual(3);
		});
	});

	describe('Tags', () => {
		test('should add a single tag', () => {
			const builder = new DocumentBuilder();
			builder.addTag('users', 'User management endpoints');
			const doc = builder.build();

			expect(doc.tags).toBeDefined();
			expect(doc.tags?.length).toBe(1);
			expect(doc.tags?.[0].name).toBe('users');
			expect(doc.tags?.[0].description).toBe('User management endpoints');
		});

		test('should add multiple tags', () => {
			const builder = new DocumentBuilder();
			builder
				.addTag('users', 'User management')
				.addTag('posts', 'Post management')
				.addTag('comments', 'Comment management');

			const doc = builder.build();
			expect(doc.tags?.length).toBe(3);
		});

		test('should add tag without description', () => {
			const builder = new DocumentBuilder();
			builder.addTag('admin');
			const doc = builder.build();

			expect(doc.tags?.[0].name).toBe('admin');
			expect(doc.tags?.[0].description).toBeUndefined();
		});
	});

	describe('Fluent API', () => {
		test('should support method chaining', () => {
			const builder = new DocumentBuilder();
			const doc = builder
				.setTitle('My API')
				.setDescription('An awesome API')
				.setVersion('1.0.0')
				.addServer('https://api.example.com')
				.addBearerAuth()
				.addTag('users')
				.build();

			expect(doc.info?.title).toBe('My API');
			expect(doc.info?.description).toBe('An awesome API');
			expect(doc.info?.version).toBe('1.0.0');
			expect(doc.servers?.length).toBe(1);
			expect(doc.components?.securitySchemes?.['bearer']).toBeDefined();
			expect(doc.tags?.length).toBe(1);
		});

		test('should return builder instance for chaining', () => {
			const builder = new DocumentBuilder();
			const result = builder.setTitle('Test');

			expect(result).toBe(builder);
		});
	});

	describe('Complete document generation', () => {
		test('should generate a complete OpenAPI document', () => {
			const doc = new DocumentBuilder()
				.setTitle('E-Commerce API')
				.setDescription('RESTful API for e-commerce platform')
				.setVersion('1.0.0')
				.setContact('API Support', 'https://support.example.com', 'api@example.com')
				.setLicense('MIT')
				.addServer('https://api.example.com', 'Production')
				.addServer('http://localhost:3000', 'Development')
				.addBearerAuth()
				.addApiKey({ in: 'header', name: 'X-API-Key' })
				.addTag('products', 'Product management')
				.addTag('orders', 'Order management')
				.build();

			expect(doc.openapi).toBe('3.1.0');
			expect(doc.info?.title).toBe('E-Commerce API');
			expect(doc.info?.description).toBe('RESTful API for e-commerce platform');
			expect(doc.info?.version).toBe('1.0.0');
			expect(doc.info?.contact).toBeDefined();
			expect(doc.info?.license).toBeDefined();
			expect(doc.servers?.length).toBe(2);
			expect(Object.keys(doc.components?.securitySchemes ?? {}).length).toBe(2);
			expect(doc.tags?.length).toBe(2);
		});
	});
});
