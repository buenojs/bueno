/**
 * Schema Generator
 *
 * Converts TypeScript class types and @ApiProperty decorators into OpenAPI schemas.
 */

import type { ApiPropertyOptions, Constructor, OpenAPISchema } from './types';
import { getApiPropertyMetadata, getApiPropertyKeys } from './metadata';

/**
 * SchemaGenerator - Converts TypeScript types to OpenAPI schemas
 */
export class SchemaGenerator {
	private schemas = new Map<string, OpenAPISchema>();
	private typeNames = new Map<Constructor, string>();
	private typeCounter = 0;

	/**
	 * Generate an OpenAPI schema from a TypeScript type
	 * Supports classes, interfaces (via decorators), primitives, arrays
	 */
	generateSchema(type: Constructor | string | Function): OpenAPISchema {
		// Handle string type names (primitives like 'string', 'number')
		if (typeof type === 'string') {
			return this.generatePrimitiveSchema(type);
		}

		// Handle function types (classes, constructors)
		if (typeof type === 'function') {
			const typeName = this.getTypeName(type);

			// Check if already cached
			if (this.schemas.has(typeName)) {
				return { $ref: `#/components/schemas/${typeName}` };
			}

			// Handle built-in types
			if (this.isBuiltInType(type)) {
				return this.generatePrimitiveSchema(type);
			}

			// Handle arrays (Array constructor)
			if (type === Array) {
				return { type: 'array', items: { type: 'object' } };
			}

			// Generate object schema from class
			return this.generateObjectSchema(type);
		}

		// Default fallback
		return { type: 'object' };
	}

	/**
	 * Generate schema for an object/class type
	 * Reads @ApiProperty metadata from class properties
	 */
	private generateObjectSchema(type: Function): OpenAPISchema {
		const typeName = this.getTypeName(type);
		const properties: Record<string, OpenAPISchema> = {};
		const required: string[] = [];

		// Get all property keys that have @ApiProperty metadata
		const propertyKeys = getApiPropertyKeys((type as Constructor).prototype);

		for (const key of propertyKeys) {
			const propName = typeof key === 'symbol' ? key.toString() : key;
			const propOptions = getApiPropertyMetadata<ApiPropertyOptions>(
				(type as Constructor).prototype,
				key,
			);

			if (propOptions) {
				properties[propName] = this.generatePropertySchema(propOptions);

				// Track required properties
				if (propOptions.required !== false) {
					required.push(propName);
				}
			}
		}

		const schema: OpenAPISchema = {
			type: 'object',
			properties: Object.keys(properties).length > 0 ? properties : undefined,
			required: required.length > 0 ? required : undefined,
		};

		// Cache the schema
		this.schemas.set(typeName, schema);

		// Return a reference to the cached schema
		return { $ref: `#/components/schemas/${typeName}` };
	}

	/**
	 * Generate schema from an @ApiProperty options object
	 */
	private generatePropertySchema(options: ApiPropertyOptions): OpenAPISchema {
		const schema: OpenAPISchema = {};

		// Type mapping
		if (options.type) {
			if (typeof options.type === 'string') {
				// Map string type names
				const typeSchema = this.mapStringType(options.type);
				Object.assign(schema, typeSchema);
			} else if (typeof options.type === 'function') {
				// Recurse for class types
				const nested = this.generateSchema(options.type);
				Object.assign(schema, nested);
			}
		}

		// String validations
		if (options.minLength !== undefined) schema.minLength = options.minLength;
		if (options.maxLength !== undefined) schema.maxLength = options.maxLength;
		if (options.pattern !== undefined) schema.pattern = options.pattern;

		// Numeric validations
		if (options.minimum !== undefined) schema.minimum = options.minimum;
		if (options.maximum !== undefined) schema.maximum = options.maximum;

		// Array validations
		if (options.minItems !== undefined) schema.minItems = options.minItems;
		if (options.maxItems !== undefined) schema.maxItems = options.maxItems;
		if (options.items !== undefined) schema.items = options.items;

		// Enum
		if (options.enum !== undefined) {
			schema.enum = options.enum;
		}

		// Format
		if (options.format !== undefined) schema.format = options.format;

		// Metadata
		if (options.title !== undefined) schema.title = options.title;
		if (options.description !== undefined) schema.description = options.description;
		if (options.example !== undefined) schema.example = options.example;
		if (options.default !== undefined) schema.default = options.default;
		if (options.nullable !== undefined) schema.nullable = options.nullable;
		if (options.readOnly !== undefined) schema.readOnly = options.readOnly;
		if (options.writeOnly !== undefined) schema.writeOnly = options.writeOnly;

		return schema;
	}

	/**
	 * Generate schema for a primitive TypeScript type
	 */
	private generatePrimitiveSchema(type: string | Function): OpenAPISchema {
		if (typeof type === 'string') {
			return this.mapStringType(type);
		}

		// Map constructor to primitive type
		if (type === String) return { type: 'string' };
		if (type === Number) return { type: 'number' };
		if (type === Boolean) return { type: 'boolean' };
		if (type === Date) return { type: 'string', format: 'date-time' };
		if (type === Array) return { type: 'array', items: {} };

		return { type: 'object' };
	}

	/**
	 * Map string type names to OpenAPI schema
	 */
	private mapStringType(type: string): OpenAPISchema {
		switch (type.toLowerCase()) {
			case 'string':
				return { type: 'string' };
			case 'number':
				return { type: 'number' };
			case 'integer':
				return { type: 'integer' };
			case 'boolean':
				return { type: 'boolean' };
			case 'date':
				return { type: 'string', format: 'date' };
			case 'datetime':
			case 'date-time':
				return { type: 'string', format: 'date-time' };
			case 'email':
				return { type: 'string', format: 'email' };
			case 'uuid':
				return { type: 'string', format: 'uuid' };
			case 'url':
			case 'uri':
				return { type: 'string', format: 'uri' };
			case 'object':
				return { type: 'object' };
			case 'array':
				return { type: 'array', items: {} };
			default:
				return { type: 'string' };
		}
	}

	/**
	 * Check if type is a built-in TypeScript type
	 */
	private isBuiltInType(type: Function): boolean {
		return (
			type === String ||
			type === Number ||
			type === Boolean ||
			type === Date ||
			type === Array ||
			type === Object
		);
	}

	/**
	 * Get the name for a type (for referencing in components.schemas)
	 */
	private getTypeName(type: Function): string {
		// Check if we've already assigned a name
		if (this.typeNames.has(type as Constructor)) {
			return this.typeNames.get(type as Constructor)!;
		}

		// Use the constructor name if available
		let name = type.name;

		// Fallback to generic name if no name
		if (!name || name === 'Object' || name === 'Function') {
			name = `Schema_${++this.typeCounter}`;
		}

		this.typeNames.set(type as Constructor, name);
		return name;
	}

	/**
	 * Get all generated schemas (for components.schemas)
	 */
	getSchemas(): Record<string, OpenAPISchema> {
		const result: Record<string, OpenAPISchema> = {};
		for (const [name, schema] of this.schemas) {
			result[name] = schema;
		}
		return result;
	}

	/**
	 * Clear cached schemas
	 */
	clear(): void {
		this.schemas.clear();
		this.typeNames.clear();
		this.typeCounter = 0;
	}
}
