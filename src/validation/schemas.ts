/**
 * Built-in Schema System
 * Lightweight validation schema builder for common use cases.
 * No external dependencies required.
 */

import type { StandardIssue, StandardResult } from "../types";

// ============= Schema Definition Types =============

export type FieldValidator = (value: unknown) => {
	valid: boolean;
	error?: string;
	value?: unknown; // Coerced/transformed value
};

export interface SchemaDefinition {
	[key: string]: FieldValidator | SchemaDefinition | undefined;
}

// ============= Built-in Field Validators =============

export const Fields = {
	/**
	 * String field validators
	 */
	string: (
		options: {
			min?: number;
			max?: number;
			pattern?: RegExp;
			email?: boolean;
			url?: boolean;
			uuid?: boolean;
			optional?: boolean;
		} = {},
	) => {
		return (value: unknown) => {
			if (options.optional && (value === undefined || value === null)) {
				return { valid: true, value: undefined };
			}

			if (typeof value !== "string") {
				return { valid: false, error: "Must be a string" };
			}

			if (options.min !== undefined && value.length < options.min) {
				return {
					valid: false,
					error: `Must be at least ${options.min} characters`,
				};
			}

			if (options.max !== undefined && value.length > options.max) {
				return {
					valid: false,
					error: `Must be at most ${options.max} characters`,
				};
			}

			if (options.pattern && !options.pattern.test(value)) {
				return { valid: false, error: "Does not match required pattern" };
			}

			if (options.email) {
				const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
				if (!emailRegex.test(value)) {
					return { valid: false, error: "Must be a valid email address" };
				}
			}

			if (options.url) {
				try {
					new URL(value);
				} catch {
					return { valid: false, error: "Must be a valid URL" };
				}
			}

			if (options.uuid) {
				const uuidRegex =
					/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
				if (!uuidRegex.test(value)) {
					return { valid: false, error: "Must be a valid UUID" };
				}
			}

			return { valid: true, value };
		};
	},

	/**
	 * Number field validators (coerces strings to numbers)
	 */
	number: (
		options: {
			min?: number;
			max?: number;
			integer?: boolean;
			positive?: boolean;
			optional?: boolean;
			default?: number;
			coerce?: boolean; // Default: true, coerce strings to numbers
		} = {},
	) => {
		const shouldCoerce = options.coerce !== false; // Default true

		return (value: unknown, validateOnly = false) => {
			// Apply default if value is missing
			if (
				(value === undefined || value === null) &&
				options.default !== undefined
			) {
				return { valid: true, value: options.default };
			}

			if (options.optional && (value === undefined || value === null)) {
				return { valid: true, value: undefined };
			}

			let num = value;

			// Coerce string to number
			if (shouldCoerce && typeof value === "string") {
				num = Number(value);
			}

			if (typeof num !== "number" || Number.isNaN(num)) {
				return { valid: false, error: "Must be a number" };
			}

			if (options.integer && !Number.isInteger(num)) {
				return { valid: false, error: "Must be an integer" };
			}

			if (options.positive && num <= 0) {
				return { valid: false, error: "Must be a positive number" };
			}

			if (options.min !== undefined && num < options.min) {
				return { valid: false, error: `Must be at least ${options.min}` };
			}

			if (options.max !== undefined && num > options.max) {
				return { valid: false, error: `Must be at most ${options.max}` };
			}

			return { valid: true, value: num };
		};
	},

	/**
	 * Boolean field validator
	 */
	boolean: (options: { optional?: boolean } = {}) => {
		return (value: unknown) => {
			if (options.optional && (value === undefined || value === null)) {
				return { valid: true, value: undefined };
			}

			if (typeof value !== "boolean") {
				return { valid: false, error: "Must be a boolean" };
			}

			return { valid: true, value };
		};
	},

	/**
	 * Array field validators
	 */
	array: (
		options: {
			min?: number;
			max?: number;
			itemValidator?: FieldValidator;
			optional?: boolean;
		} = {},
	) => {
		return (value: unknown) => {
			if (options.optional && (value === undefined || value === null)) {
				return { valid: true, value: undefined };
			}

			if (!Array.isArray(value)) {
				return { valid: false, error: "Must be an array" };
			}

			if (options.min !== undefined && value.length < options.min) {
				return {
					valid: false,
					error: `Must have at least ${options.min} items`,
				};
			}

			if (options.max !== undefined && value.length > options.max) {
				return {
					valid: false,
					error: `Must have at most ${options.max} items`,
				};
			}

			if (options.itemValidator) {
				for (let i = 0; i < value.length; i++) {
					const result = options.itemValidator(value[i]);
					if (!result.valid) {
						return {
							valid: false,
							error: `Item ${i}: ${result.error}`,
						};
					}
				}
			}

			return { valid: true, value };
		};
	},

	/**
	 * Enum field validator
	 */
	enum: (
		values: readonly (string | number)[],
		options: { optional?: boolean } = {},
	) => {
		return (value: unknown) => {
			if (options.optional && (value === undefined || value === null)) {
				return { valid: true, value: undefined };
			}

			if (!values.includes(value as string | number)) {
				return {
					valid: false,
					error: `Must be one of: ${values.join(", ")}`,
				};
			}

			return { valid: true, value };
		};
	},

	/**
	 * Custom validator function
	 */
	custom: (
		validate: (value: unknown) => boolean,
		message = "Validation failed",
	) => {
		return (value: unknown) => {
			if (validate(value)) {
				return { valid: true, value };
			}
			return { valid: false, error: message };
		};
	},

	/**
	 * Environment variable validators
	 */
	env: {
		/**
		 * Required environment variable validator
		 */
		required: (options: { optional?: boolean } = {}) => {
			return (value: unknown) => {
				if (options.optional && (value === undefined || value === null)) {
					return { valid: true, value: undefined };
				}

				if (value === undefined || value === null || value === "") {
					return {
						valid: false,
						error: "This environment variable is required",
					};
				}

				return { valid: true, value };
			};
		},

		/**
		 * Port number validator (1-65535)
		 */
		port: (options: { optional?: boolean } = {}) => {
			return (value: unknown) => {
				if (options.optional && (value === undefined || value === null)) {
					return { valid: true, value: undefined };
				}

				const num = Number(value);
				if (isNaN(num) || num < 1 || num > 65535) {
					return {
						valid: false,
						error: "Must be a valid port number (1-65535)",
					};
				}

				return { valid: true, value: num };
			};
		},

		/**
		 * URL validator
		 */
		url: (options: { optional?: boolean } = {}) => {
			return (value: unknown) => {
				if (options.optional && (value === undefined || value === null)) {
					return { valid: true, value: undefined };
				}

				if (typeof value !== "string") {
					return { valid: false, error: "Must be a string" };
				}

				try {
					new URL(value);
					return { valid: true, value };
				} catch {
					return { valid: false, error: "Must be a valid URL" };
				}
			};
		},

		/**
		 * Database URL validator
		 */
		databaseUrl: (options: { optional?: boolean } = {}) => {
			return (value: unknown) => {
				if (options.optional && (value === undefined || value === null)) {
					return { valid: true, value: undefined };
				}

				if (typeof value !== "string") {
					return { valid: false, error: "Must be a string" };
				}

				try {
					const url = new URL(value);
					const validSchemes = ["postgresql", "mysql", "sqlite", "mongodb"];
					if (!validSchemes.includes(url.protocol.replace(/:$/, ""))) {
						return {
							valid: false,
							error: `Must be a valid database URL (postgresql://, mysql://, sqlite://, mongodb://)`,
						};
					}
					return { valid: true, value };
				} catch {
					return { valid: false, error: "Must be a valid database URL" };
				}
			};
		},

		/**
		 * Boolean validator
		 */
		boolean: (options: { optional?: boolean } = {}) => {
			return (value: unknown) => {
				if (options.optional && (value === undefined || value === null)) {
					return { valid: true, value: undefined };
				}

				if (
					typeof value !== "boolean" &&
					value !== "true" &&
					value !== "false"
				) {
					return { valid: false, error: "Must be a boolean (true/false)" };
				}

				return { valid: true, value: value === "true" || value === true };
			};
		},

		/**
		 * Number validator
		 */
		number: (
			options: {
				min?: number;
				max?: number;
				optional?: boolean;
				integer?: boolean;
			} = {},
		) => {
			return (value: unknown) => {
				if (options.optional && (value === undefined || value === null)) {
					return { valid: true, value: undefined };
				}

				const num = Number(value);
				if (isNaN(num)) {
					return { valid: false, error: "Must be a number" };
				}

				if (options.integer && !Number.isInteger(num)) {
					return { valid: false, error: "Must be an integer" };
				}

				if (options.min !== undefined && num < options.min) {
					return { valid: false, error: `Must be at least ${options.min}` };
				}

				if (options.max !== undefined && num > options.max) {
					return { valid: false, error: `Must be at most ${options.max}` };
				}

				return { valid: true, value: num };
			};
		},
	},
};

// ============= Schema Class =============

/**
 * Built-in schema validator
 * Simple, zero-dependency schema validation
 */
export class Schema {
	constructor(private definition: SchemaDefinition) {}

	/**
	 * Create a new schema from field definitions
	 */
	static object<T extends SchemaDefinition>(definition: T): Schema {
		return new Schema(definition);
	}

	/**
	 * Validate data synchronously
	 */
	validateSync(data: unknown): StandardResult<Record<string, unknown>> {
		const errors: StandardIssue[] = [];
		const validated: Record<string, unknown> = {};

		if (typeof data !== "object" || data === null) {
			return {
				issues: [{ message: "Input must be an object" }],
			};
		}

		const obj = data as Record<string, unknown>;

		for (const [key, validator] of Object.entries(this.definition)) {
			if (typeof validator === "function") {
				const result = validator(obj[key]);
				if (!result.valid) {
					errors.push({
						message: result.error || `Validation failed for ${key}`,
						path: [key],
					});
				} else {
					// Use coerced value if provided, otherwise use original value
					validated[key] = result.value !== undefined ? result.value : obj[key];
				}
			}
		}

		if (errors.length > 0) {
			return { issues: errors };
		}

		return { value: validated };
	}

	/**
	 * Validate data asynchronously
	 * Currently same as sync, but allows for async validators in future
	 */
	async validate(
		data: unknown,
	): Promise<StandardResult<Record<string, unknown>>> {
		return this.validateSync(data);
	}

	/**
	 * Implement Standard Schema interface for compatibility with @buenojs/bueno validators
	 */
	get ["~standard"]() {
		return {
			validate: (data: unknown) => this.validateSync(data),
			version: 1,
		};
	}
}

/**
 * Create a schema object
 * Alias for Schema.object() for convenience
 */
export function schema<T extends SchemaDefinition>(definition: T): Schema {
	return Schema.object(definition);
}

// ============= Environment Variable Schemas =============

/**
 * Standard environment variable schema for Bueno Framework
 */
export const envSchema = Schema.object({
	// Required variables
	NODE_ENV: Fields.env.required(),
	PORT: Fields.env.port(),
	HOST: Fields.string({ optional: true }),

	// Database
	DATABASE_URL: Fields.env.databaseUrl({ optional: true }),
	DATABASE_POOL_SIZE: Fields.env.number({ min: 1, max: 100, optional: true }),

	// Cache
	REDIS_URL: Fields.env.url({ optional: true }),
	CACHE_DRIVER: Fields.enum(["memory", "redis", "none"], { optional: true }),
	CACHE_TTL: Fields.env.number({ min: 1, optional: true }),

	// Logging
	LOG_LEVEL: Fields.enum(["error", "warn", "info", "debug", "trace"], {
		optional: true,
	}),
	LOG_PRETTY: Fields.env.boolean({ optional: true }),

	// Health
	HEALTH_ENABLED: Fields.env.boolean({ optional: true }),

	// Metrics
	METRICS_ENABLED: Fields.env.boolean({ optional: true }),

	// Telemetry
	TELEMETRY_ENABLED: Fields.env.boolean({ optional: true }),
	TELEMETRY_SERVICE_NAME: Fields.string({ optional: true }),
	TELEMETRY_ENDPOINT: Fields.env.url({ optional: true }),

	// Frontend
	FRONTEND_DEV_SERVER: Fields.env.boolean({ optional: true }),
	FRONTEND_HMR: Fields.env.boolean({ optional: true }),
	FRONTEND_PORT: Fields.env.port({ optional: true }),
});
