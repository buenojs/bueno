import { describe, test, expect } from 'bun:test';
import { SchemaGenerator } from '../schema-generator';
import { ApiProperty, ApiPropertyOptional } from '../decorators';

// ============= Test Fixtures =============

class SimpleDto {
	@ApiProperty({ description: 'User name' })
	name!: string;

	@ApiPropertyOptional({ description: 'User email' })
	email?: string;
}

class UserDto {
	@ApiProperty({ description: 'User ID' })
	id!: string;

	@ApiProperty({ description: 'Email address', format: 'email' })
	email!: string;

	@ApiProperty({ description: 'Full name', minLength: 2, maxLength: 100 })
	name!: string;

	@ApiPropertyOptional({ description: 'Age', minimum: 0, maximum: 150 })
	age?: number;
}

class CreateUserDto {
	@ApiProperty({ description: 'Email address', example: 'user@example.com' })
	email!: string;

	@ApiProperty({ description: 'Password', minLength: 8 })
	password!: string;

	@ApiPropertyOptional({ description: 'Full name' })
	name?: string;
}

// ============= Tests =============

describe('SchemaGenerator', () => {
	describe('Primitive type generation', () => {
		test('should generate string schema from String type', () => {
			const generator = new SchemaGenerator();
			const schema = generator.generateSchema(String);
			expect(schema.type).toBe('string');
		});

		test('should generate number schema from Number type', () => {
			const generator = new SchemaGenerator();
			const schema = generator.generateSchema(Number);
			expect(schema.type).toBe('number');
		});

		test('should generate boolean schema from Boolean type', () => {
			const generator = new SchemaGenerator();
			const schema = generator.generateSchema(Boolean);
			expect(schema.type).toBe('boolean');
		});

		test('should generate schema from string type names', () => {
			const generator = new SchemaGenerator();

			expect(generator.generateSchema('string').type).toBe('string');
			expect(generator.generateSchema('number').type).toBe('number');
			expect(generator.generateSchema('integer').type).toBe('integer');
			expect(generator.generateSchema('boolean').type).toBe('boolean');
		});

		test('should generate email format for email type', () => {
			const generator = new SchemaGenerator();
			const schema = generator.generateSchema('email');
			expect(schema.type).toBe('string');
			expect(schema.format).toBe('email');
		});

		test('should generate date-time format for datetime type', () => {
			const generator = new SchemaGenerator();
			const schema = generator.generateSchema('datetime');
			expect(schema.type).toBe('string');
			expect(schema.format).toBe('date-time');
		});

		test('should generate uuid format for uuid type', () => {
			const generator = new SchemaGenerator();
			const schema = generator.generateSchema('uuid');
			expect(schema.type).toBe('string');
			expect(schema.format).toBe('uuid');
		});

		test('should generate uri format for url type', () => {
			const generator = new SchemaGenerator();
			const schema = generator.generateSchema('url');
			expect(schema.type).toBe('string');
			expect(schema.format).toBe('uri');
		});
	});

	describe('Object/DTO schema generation', () => {
		test('should generate schema for simple DTO', () => {
			const generator = new SchemaGenerator();
			const schema = generator.generateSchema(SimpleDto);

			expect(schema.$ref).toBeDefined();
			expect(schema.$ref).toContain('SimpleDto');
		});

		test('should cache and return reference for same DTO', () => {
			const generator = new SchemaGenerator();
			const schema1 = generator.generateSchema(SimpleDto);
			const schema2 = generator.generateSchema(SimpleDto);

			expect(schema1).toEqual(schema2);
			expect(schema1.$ref).toBe(schema2.$ref);
		});

		test('should generate schemas map with DTO properties', () => {
			const generator = new SchemaGenerator();
			generator.generateSchema(UserDto);

			const schemas = generator.getSchemas();
			expect(schemas).toHaveProperty('UserDto');

			const userSchema = schemas['UserDto'];
			expect(userSchema.type).toBe('object');
			expect(userSchema.properties).toBeDefined();
			expect(userSchema.properties?.['name']).toBeDefined();
			expect(userSchema.properties?.['email']).toBeDefined();
			expect(userSchema.properties?.['age']).toBeDefined();
		});

		test('should respect required fields', () => {
			const generator = new SchemaGenerator();
			generator.generateSchema(UserDto);

			const schemas = generator.getSchemas();
			const userSchema = schemas['UserDto'];

			expect(userSchema.required).toContain('name');
			expect(userSchema.required).toContain('email');
			expect(userSchema.required).toContain('id');

			// Optional fields should not be in required
			if (userSchema.required) {
				expect(userSchema.required.includes('age')).toBe(false);
			}
		});

		test('should include property descriptions', () => {
			const generator = new SchemaGenerator();
			generator.generateSchema(UserDto);

			const schemas = generator.getSchemas();
			const userSchema = schemas['UserDto'];

			expect((userSchema.properties?.['name'] as any)?.description).toBe('Full name');
			expect((userSchema.properties?.['email'] as any)?.description).toBe('Email address');
		});

		test('should include format information', () => {
			const generator = new SchemaGenerator();
			generator.generateSchema(UserDto);

			const schemas = generator.getSchemas();
			const userSchema = schemas['UserDto'];

			expect((userSchema.properties?.['email'] as any)?.format).toBe('email');
		});

		test('should include validation constraints', () => {
			const generator = new SchemaGenerator();
			generator.generateSchema(UserDto);

			const schemas = generator.getSchemas();
			const userSchema = schemas['UserDto'];

			const nameProperty = userSchema.properties?.['name'] as any;
			expect(nameProperty?.minLength).toBe(2);
			expect(nameProperty?.maxLength).toBe(100);

			const ageProperty = userSchema.properties?.['age'] as any;
			expect(ageProperty?.minimum).toBe(0);
			expect(ageProperty?.maximum).toBe(150);
		});

		test('should include examples and defaults', () => {
			const generator = new SchemaGenerator();
			generator.generateSchema(CreateUserDto);

			const schemas = generator.getSchemas();
			const createSchema = schemas['CreateUserDto'];

			const emailProperty = createSchema.properties?.['email'] as any;
			expect(emailProperty?.example).toBe('user@example.com');
		});
	});

	describe('Multiple DTO schema generation', () => {
		test('should generate schemas for multiple DTOs', () => {
			const generator = new SchemaGenerator();
			generator.generateSchema(UserDto);
			generator.generateSchema(CreateUserDto);

			const schemas = generator.getSchemas();
			expect(schemas).toHaveProperty('UserDto');
			expect(schemas).toHaveProperty('CreateUserDto');
		});

		test('should handle DTOs with same property names differently', () => {
			const generator = new SchemaGenerator();
			const userRef = generator.generateSchema(UserDto);
			const createRef = generator.generateSchema(CreateUserDto);

			expect(userRef.$ref).not.toBe(createRef.$ref);
		});
	});

	describe('Schema clearing', () => {
		test('should clear all cached schemas', () => {
			const generator = new SchemaGenerator();
			generator.generateSchema(UserDto);
			generator.generateSchema(CreateUserDto);

			let schemas = generator.getSchemas();
			expect(Object.keys(schemas).length).toBeGreaterThan(0);

			generator.clear();
			schemas = generator.getSchemas();
			expect(Object.keys(schemas).length).toBe(0);
		});

		test('should regenerate schemas after clearing', () => {
			const generator = new SchemaGenerator();
			generator.generateSchema(UserDto);
			generator.clear();

			const ref1 = generator.generateSchema(UserDto);
			const ref2 = generator.generateSchema(UserDto);

			expect(ref1).toEqual(ref2);
		});
	});

	describe('Array type handling', () => {
		test('should handle Array type', () => {
			const generator = new SchemaGenerator();
			const schema = generator.generateSchema(Array);
			expect(schema.type).toBe('array');
		});
	});

	describe('Type name generation', () => {
		test('should use class name for DTO', () => {
			const generator = new SchemaGenerator();
			generator.generateSchema(UserDto);

			const schemas = generator.getSchemas();
			expect(schemas).toHaveProperty('UserDto');
		});

		test('should generate unique names for multiple generations', () => {
			const generator = new SchemaGenerator();

			// Create anonymous classes
			const AnonClass1 = class {};
			const AnonClass2 = class {};

			const schema1 = generator.generateSchema(AnonClass1);
			const schema2 = generator.generateSchema(AnonClass2);

			expect(schema1.$ref).not.toBe(schema2.$ref);
		});
	});
});
