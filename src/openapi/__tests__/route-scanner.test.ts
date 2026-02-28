import { describe, test, expect } from 'bun:test';
import { Controller, Get, Post } from '../../modules';
import { RouteScanner } from '../route-scanner';
import { SchemaGenerator } from '../schema-generator';
import {
	ApiOperation,
	ApiResponse,
	ApiParam,
	ApiQuery,
	ApiBody,
	ApiProperty,
	ApiTags,
} from '../decorators';
import { setMetadata, setPrototypeMetadata } from '../../modules/metadata';
import { setApiMetadata, setApiMethodMetadata } from '../metadata';

// ============= Helper =============

/** Manually inject routes metadata (as @Get/@Post would) */
function setRoutes(
	proto: object,
	routes: Array<{ method: string; path: string; handler: string }>,
) {
	setPrototypeMetadata(proto, 'routes', routes);
}

// ============= Test Fixtures =============

class UserDto {
	@ApiProperty({ description: 'User ID' })
	id!: string;

	@ApiProperty({ description: 'User email' })
	email!: string;
}

// ============= Tests =============

describe('RouteScanner', () => {
	describe('Basic route scanning', () => {
		test('should scan empty controller and return empty paths', () => {
			@Controller('/users')
			class UsersController {}

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([UsersController]);
			expect(typeof paths).toBe('object');
			expect(Object.keys(paths).length).toBe(0);
		});

		test('should extract controller base path', () => {
			@Controller('/users')
			class UsersController {
				getAll() {}
			}

			setRoutes(UsersController.prototype, [{ method: 'GET', path: '', handler: 'getAll' }]);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([UsersController]);
			expect(paths['/users']).toBeDefined();
		});

		test('should combine controller path with route path', () => {
			@Controller('/api/users')
			class UsersController {
				getById() {}
			}

			setRoutes(UsersController.prototype, [{ method: 'GET', path: '/:id', handler: 'getById' }]);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([UsersController]);
			expect(paths['/api/users/{id}']).toBeDefined();
		});
	});

	describe('Path parameter conversion', () => {
		test('should convert :param to {param}', () => {
			@Controller('/users')
			class UsersController {
				getById() {}
			}

			setRoutes(UsersController.prototype, [{ method: 'GET', path: '/:id', handler: 'getById' }]);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([UsersController]);
			expect(paths['/users/{id}']).toBeDefined();
			expect(paths['/users/:id']).toBeUndefined();
		});

		test('should handle multiple path parameters', () => {
			@Controller('/api')
			class ApiController {
				getPost() {}
			}

			setRoutes(ApiController.prototype, [
				{ method: 'GET', path: '/users/:userId/posts/:postId', handler: 'getPost' },
			]);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([ApiController]);
			expect(paths['/api/users/{userId}/posts/{postId}']).toBeDefined();
		});
	});

	describe('HTTP methods', () => {
		test('should register GET operations', () => {
			@Controller('/users')
			class UsersController {
				getAll() {}
			}

			setRoutes(UsersController.prototype, [{ method: 'GET', path: '', handler: 'getAll' }]);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([UsersController]);
			expect(paths['/users']?.get).toBeDefined();
		});

		test('should register POST operations', () => {
			@Controller('/users')
			class UsersController {
				create() {}
			}

			setRoutes(UsersController.prototype, [{ method: 'POST', path: '', handler: 'create' }]);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([UsersController]);
			expect(paths['/users']?.post).toBeDefined();
		});

		test('should handle multiple HTTP methods on same path', () => {
			@Controller('/users')
			class UsersController {
				getAll() {}
				create() {}
			}

			setRoutes(UsersController.prototype, [
				{ method: 'GET', path: '', handler: 'getAll' },
				{ method: 'POST', path: '', handler: 'create' },
			]);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([UsersController]);
			expect(paths['/users']?.get).toBeDefined();
			expect(paths['/users']?.post).toBeDefined();
		});
	});

	describe('Operation metadata', () => {
		test('should include operation summary and description', () => {
			@Controller('/users')
			class UsersController {
				@ApiOperation({ summary: 'List users', description: 'Get all users' })
				getAll() {}
			}

			setRoutes(UsersController.prototype, [{ method: 'GET', path: '', handler: 'getAll' }]);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([UsersController]);
			const op = paths['/users']?.get;
			expect(op?.summary).toBe('List users');
			expect(op?.description).toBe('Get all users');
		});

		test('should include class-level tags', () => {
			@Controller('/users')
			@ApiTags('users')
			class UsersController {
				getAll() {}
			}

			setRoutes(UsersController.prototype, [{ method: 'GET', path: '', handler: 'getAll' }]);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([UsersController]);
			const op = paths['/users']?.get;
			expect(op?.tags).toContain('users');
		});
	});

	describe('Multiple controllers', () => {
		test('should scan multiple controllers', () => {
			@Controller('/users')
			class UsersController {
				getAll() {}
			}

			@Controller('/posts')
			class PostsController {
				getAll() {}
			}

			setRoutes(UsersController.prototype, [{ method: 'GET', path: '', handler: 'getAll' }]);
			setRoutes(PostsController.prototype, [{ method: 'GET', path: '', handler: 'getAll' }]);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([
				UsersController,
				PostsController,
			]);
			expect(paths['/users']?.get).toBeDefined();
			expect(paths['/posts']?.get).toBeDefined();
		});

		test('should handle controllers with different paths', () => {
			@Controller('/api')
			class ApiV1Controller {
				info() {}
			}

			@Controller('/api/v2')
			class ApiV2Controller {
				info() {}
			}

			setRoutes(ApiV1Controller.prototype, [{ method: 'GET', path: '', handler: 'info' }]);
			setRoutes(ApiV2Controller.prototype, [{ method: 'GET', path: '', handler: 'info' }]);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([
				ApiV1Controller,
				ApiV2Controller,
			]);
			expect(paths['/api']?.get).toBeDefined();
			expect(paths['/api/v2']?.get).toBeDefined();
		});
	});

	describe('Excluded controllers and endpoints', () => {
		test('should skip excluded controllers', () => {
			@Controller('/hidden')
			class HiddenController {
				getAll() {}
			}

			setRoutes(HiddenController.prototype, [{ method: 'GET', path: '', handler: 'getAll' }]);
			setApiMetadata(HiddenController as any, 'api:exclude', true);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([HiddenController]);
			expect(Object.keys(paths).length).toBe(0);
		});
	});

	describe('Default responses', () => {
		test('should add default 200 response when none documented', () => {
			@Controller('/users')
			class UsersController {
				getAll() {}
			}

			setRoutes(UsersController.prototype, [{ method: 'GET', path: '', handler: 'getAll' }]);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([UsersController]);
			const op = paths['/users']?.get;
			expect(op?.responses['200']).toBeDefined();
			expect(op?.responses['200'].description).toBe('Success');
		});
	});

	describe('Documented responses', () => {
		test('should include documented response statuses', () => {
			@Controller('/users')
			class UsersController {
				@ApiResponse({ status: 200, description: 'OK' })
				@ApiResponse({ status: 404, description: 'Not found' })
				getUser() {}
			}

			setRoutes(UsersController.prototype, [{ method: 'GET', path: '/:id', handler: 'getUser' }]);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([UsersController]);
			const op = paths['/users/{id}']?.get;
			expect(op?.responses['200']).toBeDefined();
			expect(op?.responses['404']).toBeDefined();
		});
	});

	describe('Path parameters in operation', () => {
		test('should include @ApiParam in operation parameters', () => {
			@Controller('/users')
			class UsersController {
				@ApiParam({ name: 'id', type: 'string', description: 'User ID' })
				getUser() {}
			}

			setRoutes(UsersController.prototype, [{ method: 'GET', path: '/:id', handler: 'getUser' }]);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([UsersController]);
			const op = paths['/users/{id}']?.get;
			const param = op?.parameters?.find((p) => p.name === 'id');
			expect(param).toBeDefined();
			expect(param?.in).toBe('path');
		});
	});

	describe('Query parameters in operation', () => {
		test('should include @ApiQuery in operation parameters', () => {
			@Controller('/users')
			class UsersController {
				@ApiQuery({ name: 'page', type: 'number', required: false })
				getAll() {}
			}

			setRoutes(UsersController.prototype, [{ method: 'GET', path: '', handler: 'getAll' }]);

			const paths = new RouteScanner(new SchemaGenerator()).scanControllers([UsersController]);
			const op = paths['/users']?.get;
			const param = op?.parameters?.find((p) => p.name === 'page');
			expect(param).toBeDefined();
			expect(param?.in).toBe('query');
			expect(param?.required).toBe(false);
		});
	});

	describe('Schema generator integration', () => {
		test('should have access to schema generator', () => {
			const generator = new SchemaGenerator();
			const scanner = new RouteScanner(generator);
			expect(scanner.getSchemaGenerator()).toBe(generator);
		});

		test('should populate schemas for response types', () => {
			@Controller('/users')
			class UsersController {
				@ApiResponse({ status: 200, description: 'Success', type: UserDto })
				getAll() {}
			}

			setRoutes(UsersController.prototype, [{ method: 'GET', path: '', handler: 'getAll' }]);

			const generator = new SchemaGenerator();
			const scanner = new RouteScanner(generator);
			scanner.scanControllers([UsersController]);

			const schemas = generator.getSchemas();
			expect(schemas).toHaveProperty('UserDto');
		});
	});
});
