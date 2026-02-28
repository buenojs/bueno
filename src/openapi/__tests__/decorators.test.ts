import { describe, test, expect } from 'bun:test';
import {
	ApiTags,
	ApiBearerAuth,
	ApiBasicAuth,
	ApiApiKey,
	ApiExcludeController,
	ApiOperation,
	ApiResponse,
	ApiParam,
	ApiQuery,
	ApiHeader,
	ApiBody,
	ApiExcludeEndpoint,
	ApiProperty,
	ApiPropertyOptional,
} from '../decorators';
import { getApiMetadata, getApiMethodMetadata, getApiPropertyMetadata } from '../metadata';

// ============= Fixtures =============

class TestDto {}

// ============= Class-Level Decorators =============

describe('Class-Level Decorators', () => {
	describe('@ApiTags', () => {
		test('should store tags on class constructor', () => {
			@ApiTags('users', 'admin')
			class UserController {}

			const tags = getApiMetadata<string[]>(UserController, 'api:tags');
			expect(tags).toEqual(['users', 'admin']);
		});

		test('should merge multiple @ApiTags decorators', () => {
			@ApiTags('users')
			@ApiTags('admin')
			class UserController {}

			const tags = getApiMetadata<string[]>(UserController, 'api:tags');
			expect(tags?.includes('users')).toBe(true);
			expect(tags?.includes('admin')).toBe(true);
		});
	});

	describe('@ApiBearerAuth', () => {
		test('should store bearer auth security on class', () => {
			@ApiBearerAuth()
			class ApiController {}

			const security = getApiMetadata<Record<string, string[]>[]>(ApiController, 'api:security');
			expect(security).toBeDefined();
			expect(security?.length).toBeGreaterThan(0);
			expect(security?.[0]).toHaveProperty('bearer');
		});

		test('should use custom bearer name', () => {
			@ApiBearerAuth('jwt')
			class ApiController {}

			const security = getApiMetadata<Record<string, string[]>[]>(ApiController, 'api:security');
			expect(security?.[0]).toHaveProperty('jwt');
		});
	});

	describe('@ApiBasicAuth', () => {
		test('should store basic auth security on class', () => {
			@ApiBasicAuth()
			class ApiController {}

			const security = getApiMetadata<Record<string, string[]>[]>(ApiController, 'api:security');
			expect(security).toBeDefined();
			expect(security?.[0]).toHaveProperty('basic');
		});
	});

	describe('@ApiApiKey', () => {
		test('should store API key security on class', () => {
			@ApiApiKey({ in: 'header', name: 'X-API-Key' })
			class ApiController {}

			const security = getApiMetadata<Record<string, string[]>[]>(ApiController, 'api:security');
			expect(security).toBeDefined();
			expect(security?.[0]).toHaveProperty('api_key');
		});
	});

	describe('@ApiExcludeController', () => {
		test('should mark controller as excluded', () => {
			@ApiExcludeController()
			class HiddenController {}

			const excluded = getApiMetadata<boolean>(HiddenController, 'api:exclude');
			expect(excluded).toBe(true);
		});
	});
});

// ============= Method-Level Decorators =============
// Note: metadata is stored as 'api:<key>:<methodName>' on the prototype

describe('Method-Level Decorators', () => {
	describe('@ApiOperation', () => {
		test('should store operation metadata keyed by method name', () => {
			class UserController {
				@ApiOperation({ summary: 'Get all users', description: 'Retrieve a list of users' })
				getAll() {}
			}

			const meta = getApiMethodMetadata<any>(UserController.prototype, 'api:operation:getAll');
			expect(meta).toBeDefined();
			expect(meta?.summary).toBe('Get all users');
			expect(meta?.description).toBe('Retrieve a list of users');
		});

		test('should store deprecated flag', () => {
			class UserController {
				@ApiOperation({ summary: 'Old endpoint', deprecated: true })
				oldMethod() {}
			}

			const meta = getApiMethodMetadata<any>(UserController.prototype, 'api:operation:oldMethod');
			expect(meta?.deprecated).toBe(true);
		});
	});

	describe('@ApiResponse', () => {
		test('should store single response keyed by method name', () => {
			class UserController {
				@ApiResponse({ status: 200, description: 'Success' })
				getUser() {}
			}

			const responses = getApiMethodMetadata<any[]>(UserController.prototype, 'api:responses:getUser');
			expect(responses).toBeDefined();
			expect(responses?.length).toBe(1);
			expect(responses?.[0].status).toBe(200);
			expect(responses?.[0].description).toBe('Success');
		});

		test('should accumulate multiple @ApiResponse decorators', () => {
			class UserController {
				@ApiResponse({ status: 200, description: 'Success' })
				@ApiResponse({ status: 404, description: 'Not found' })
				getUser() {}
			}

			const responses = getApiMethodMetadata<any[]>(UserController.prototype, 'api:responses:getUser');
			expect(responses?.length).toBe(2);
		});
	});

	describe('@ApiParam', () => {
		test('should store path parameter keyed by method name', () => {
			class UserController {
				@ApiParam({ name: 'id', type: 'string', description: 'User ID' })
				getUser() {}
			}

			const params = getApiMethodMetadata<any[]>(UserController.prototype, 'api:params:getUser');
			expect(params).toBeDefined();
			expect(params?.length).toBe(1);
			expect(params?.[0].name).toBe('id');
			expect(params?.[0].type).toBe('string');
		});

		test('should accumulate multiple @ApiParam decorators', () => {
			class UserController {
				@ApiParam({ name: 'userId', type: 'string' })
				@ApiParam({ name: 'postId', type: 'string' })
				getPost() {}
			}

			const params = getApiMethodMetadata<any[]>(UserController.prototype, 'api:params:getPost');
			expect(params?.length).toBe(2);
		});
	});

	describe('@ApiQuery', () => {
		test('should store query parameter keyed by method name', () => {
			class UserController {
				@ApiQuery({ name: 'page', type: 'number', required: false })
				getUsers() {}
			}

			const query = getApiMethodMetadata<any[]>(UserController.prototype, 'api:query:getUsers');
			expect(query).toBeDefined();
			expect(query?.length).toBe(1);
			expect(query?.[0].name).toBe('page');
			expect(query?.[0].required).toBe(false);
		});
	});

	describe('@ApiHeader', () => {
		test('should store header keyed by method name', () => {
			class UserController {
				@ApiHeader({ name: 'X-Request-ID', description: 'Request ID', required: true })
				create() {}
			}

			const headers = getApiMethodMetadata<any[]>(UserController.prototype, 'api:headers:create');
			expect(headers).toBeDefined();
			expect(headers?.length).toBe(1);
			expect(headers?.[0].name).toBe('X-Request-ID');
			expect(headers?.[0].required).toBe(true);
		});
	});

	describe('@ApiBody', () => {
		test('should store request body keyed by method name', () => {
			class UserController {
				@ApiBody({ type: TestDto, description: 'User data' })
				create() {}
			}

			const body = getApiMethodMetadata<any>(UserController.prototype, 'api:body:create');
			expect(body).toBeDefined();
			expect(body?.type).toBe(TestDto);
			expect(body?.description).toBe('User data');
		});
	});

	describe('@ApiExcludeEndpoint', () => {
		test('should mark endpoint as excluded keyed by method name', () => {
			class UserController {
				@ApiExcludeEndpoint()
				internalMethod() {}
			}

			const excluded = getApiMethodMetadata<boolean>(
				UserController.prototype,
				'api:exclude:internalMethod',
			);
			expect(excluded).toBe(true);
		});
	});
});

// ============= Property-Level Decorators (for DTOs) =============

describe('Property-Level Decorators (DTOs)', () => {
	describe('@ApiProperty', () => {
		test('should store property with required=true by default', () => {
			class UserDto {
				@ApiProperty({ description: 'User email' })
				email!: string;
			}

			const meta = getApiPropertyMetadata<any>(UserDto.prototype, 'email');
			expect(meta?.description).toBe('User email');
			expect(meta?.required).toBe(true);
		});

		test('should store type information', () => {
			class UserDto {
				@ApiProperty({ type: 'string' })
				name!: string;
			}

			const meta = getApiPropertyMetadata<any>(UserDto.prototype, 'name');
			expect(meta?.type).toBe('string');
		});

		test('should store validation constraints', () => {
			class UserDto {
				@ApiProperty({ minLength: 2, maxLength: 100, pattern: '^[a-zA-Z]+$' })
				name!: string;
			}

			const meta = getApiPropertyMetadata<any>(UserDto.prototype, 'name');
			expect(meta?.minLength).toBe(2);
			expect(meta?.maxLength).toBe(100);
			expect(meta?.pattern).toBe('^[a-zA-Z]+$');
		});

		test('should store numeric constraints', () => {
			class UserDto {
				@ApiProperty({ minimum: 0, maximum: 150 })
				age!: number;
			}

			const meta = getApiPropertyMetadata<any>(UserDto.prototype, 'age');
			expect(meta?.minimum).toBe(0);
			expect(meta?.maximum).toBe(150);
		});

		test('should store enum values', () => {
			class UserDto {
				@ApiProperty({ enum: ['active', 'inactive', 'pending'] })
				status!: string;
			}

			const meta = getApiPropertyMetadata<any>(UserDto.prototype, 'status');
			expect(meta?.enum).toEqual(['active', 'inactive', 'pending']);
		});

		test('should store examples and defaults', () => {
			class UserDto {
				@ApiProperty({ example: 'john@example.com', default: 'user@example.com' })
				email!: string;
			}

			const meta = getApiPropertyMetadata<any>(UserDto.prototype, 'email');
			expect(meta?.example).toBe('john@example.com');
			expect(meta?.default).toBe('user@example.com');
		});
	});

	describe('@ApiPropertyOptional', () => {
		test('should store property with required=false', () => {
			class UserDto {
				@ApiPropertyOptional({ description: 'Optional middle name' })
				middleName?: string;
			}

			const meta = getApiPropertyMetadata<any>(UserDto.prototype, 'middleName');
			expect(meta?.description).toBe('Optional middle name');
			expect(meta?.required).toBe(false);
		});

		test('should accept same options as @ApiProperty except required', () => {
			class UserDto {
				@ApiPropertyOptional({ minLength: 1, maxLength: 50, example: 'Smith' })
				suffix?: string;
			}

			const meta = getApiPropertyMetadata<any>(UserDto.prototype, 'suffix');
			expect(meta?.minLength).toBe(1);
			expect(meta?.maxLength).toBe(50);
			expect(meta?.example).toBe('Smith');
			expect(meta?.required).toBe(false);
		});
	});
});
