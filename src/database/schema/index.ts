/**
 * Database Schema Definition and Type System
 *
 * Provides utilities for defining database schemas and generating
 * TypeScript types from them.
 */

// ============= Column Types =============

export type ColumnType =
	| "serial"
	| "integer"
	| "bigint"
	| "decimal"
	| "varchar"
	| "text"
	| "boolean"
	| "date"
	| "timestamp"
	| "timestamptz"
	| "json"
	| "jsonb"
	| "uuid"
	| "blob"
	| "enum";

// ============= Column Options =============

export interface ColumnOptions {
	type: ColumnType;
	length?: number;
	precision?: number;
	scale?: number;
	nullable?: boolean;
	default?: unknown;
	primaryKey?: boolean;
	autoIncrement?: boolean;
	unique?: boolean;
	references?: {
		table: string;
		column: string;
		onDelete?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";
		onUpdate?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";
	};
	check?: string;
	enum?: string[];
	comment?: string;
}

// ============= Table Schema =============

export interface TableSchema {
	name: string;
	columns: Record<string, ColumnOptions>;
	indexes?: IndexDefinition[];
	constraints?: ConstraintDefinition[];
	comment?: string;
}

export interface IndexDefinition {
	name?: string;
	columns: string[];
	unique?: boolean;
	type?: "btree" | "hash" | "gin" | "gist";
}

export interface ConstraintDefinition {
	name?: string;
	type: "unique" | "check" | "foreign";
	columns: string[];
	reference?: {
		table: string;
		columns: string[];
		onDelete?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";
		onUpdate?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";
	};
	check?: string;
}

// ============= Column Builder =============

class ColumnBuilder {
	column: ColumnOptions;

	constructor(type: ColumnType) {
		this.column = { type, nullable: false };
	}

	nullable(): this {
		this.column.nullable = true;
		return this;
	}

	notNull(): this {
		this.column.nullable = false;
		return this;
	}

	default(value: unknown): this {
		this.column.default = value;
		return this;
	}

	primaryKey(): this {
		this.column.primaryKey = true;
		return this;
	}

	unique(): this {
		this.column.unique = true;
		return this;
	}

	length(len: number): this {
		this.column.length = len;
		return this;
	}

	precision(p: number, s?: number): this {
		this.column.precision = p;
		if (s !== undefined) this.column.scale = s;
		return this;
	}

	references(
		table: string,
		column: string,
		options?: {
			onDelete?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";
			onUpdate?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";
		},
	): this {
		this.column.references = {
			table,
			column,
			...options,
		};
		return this;
	}

	check(expression: string): this {
		this.column.check = expression;
		return this;
	}

	comment(text: string): this {
		this.column.comment = text;
		return this;
	}

	build(): ColumnOptions {
		return { ...this.column };
	}
}

// ============= Schema Builder =============

export class SchemaBuilder {
	private name: string;
	private columns: Record<string, ColumnOptions> = {};
	private indexes: IndexDefinition[] = [];
	private constraints: ConstraintDefinition[] = [];
	private tableComment?: string;

	constructor(tableName: string) {
		this.name = tableName;
	}

	// Column type helpers
	serial(name: string): ColumnBuilder {
		const builder = new ColumnBuilder("serial");
		builder.primaryKey();
		this.columns[name] = builder.build();
		return builder;
	}

	integer(name: string): ColumnBuilder {
		const builder = new ColumnBuilder("integer");
		this.columns[name] = builder.build();
		return builder;
	}

	bigint(name: string): ColumnBuilder {
		const builder = new ColumnBuilder("bigint");
		this.columns[name] = builder.build();
		return builder;
	}

	decimal(name: string): ColumnBuilder {
		const builder = new ColumnBuilder("decimal");
		this.columns[name] = builder.build();
		return builder;
	}

	varchar(name: string, length = 255): ColumnBuilder {
		const builder = new ColumnBuilder("varchar");
		builder.length(length);
		this.columns[name] = builder.build();
		return builder;
	}

	text(name: string): ColumnBuilder {
		const builder = new ColumnBuilder("text");
		this.columns[name] = builder.build();
		return builder;
	}

	boolean(name: string): ColumnBuilder {
		const builder = new ColumnBuilder("boolean");
		this.columns[name] = builder.build();
		return builder;
	}

	date(name: string): ColumnBuilder {
		const builder = new ColumnBuilder("date");
		this.columns[name] = builder.build();
		return builder;
	}

	timestamp(name: string): ColumnBuilder {
		const builder = new ColumnBuilder("timestamp");
		this.columns[name] = builder.build();
		return builder;
	}

	timestamptz(name: string): ColumnBuilder {
		const builder = new ColumnBuilder("timestamptz");
		this.columns[name] = builder.build();
		return builder;
	}

	json(name: string): ColumnBuilder {
		const builder = new ColumnBuilder("json");
		this.columns[name] = builder.build();
		return builder;
	}

	jsonb(name: string): ColumnBuilder {
		const builder = new ColumnBuilder("jsonb");
		this.columns[name] = builder.build();
		return builder;
	}

	uuid(name: string): ColumnBuilder {
		const builder = new ColumnBuilder("uuid");
		this.columns[name] = builder.build();
		return builder;
	}

	blob(name: string): ColumnBuilder {
		const builder = new ColumnBuilder("blob");
		this.columns[name] = builder.build();
		return builder;
	}

	enum(name: string, values: string[]): ColumnBuilder {
		const builder = new ColumnBuilder("enum");
		builder.column.enum = values;
		this.columns[name] = builder.build();
		return builder;
	}

	// Custom column
	column(name: string, options: ColumnOptions): this {
		this.columns[name] = options;
		return this;
	}

	// Indexes
	index(
		columns: string[],
		options?: {
			name?: string;
			unique?: boolean;
			type?: "btree" | "hash" | "gin" | "gist";
		},
	): this {
		this.indexes.push({
			columns,
			...options,
		});
		return this;
	}

	unique(columns: string[], name?: string): this {
		this.constraints.push({
			type: "unique",
			columns,
			name,
		});
		return this;
	}

	foreignKey(
		columns: string[],
		reference: {
			table: string;
			columns: string[];
			onDelete?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";
			onUpdate?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";
		},
		name?: string,
	): this {
		this.constraints.push({
			type: "foreign",
			columns,
			reference,
			name,
		});
		return this;
	}

	check(expression: string, name?: string): this {
		this.constraints.push({
			type: "check",
			columns: [],
			check: expression,
			name,
		});
		return this;
	}

	comment(text: string): this {
		this.tableComment = text;
		return this;
	}

	build(): TableSchema {
		return {
			name: this.name,
			columns: { ...this.columns },
			indexes: [...this.indexes],
			constraints: [...this.constraints],
			comment: this.tableComment,
		};
	}
}

// ============= Migration Helpers =============

/**
 * Generate CREATE TABLE SQL from schema
 */
export function generateCreateTable(
	schema: TableSchema,
	driver: "postgresql" | "mysql" | "sqlite" = "postgresql",
): string {
	const columnDefs: string[] = [];
	const primaryKeys: string[] = [];

	for (const [name, col] of Object.entries(schema.columns)) {
		const parts: string[] = [name, mapColumnType(col, driver)];

		if (col.primaryKey) {
			primaryKeys.push(name);
			if (driver === "sqlite" && col.type === "serial") {
				parts[1] = "INTEGER PRIMARY KEY AUTOINCREMENT";
			}
		}

		if (!col.nullable && !col.primaryKey) {
			parts.push("NOT NULL");
		}

		if (col.unique && !col.primaryKey) {
			parts.push("UNIQUE");
		}

		if (col.default !== undefined) {
			parts.push(`DEFAULT ${formatDefault(col.default, driver)}`);
		}

		if (col.references) {
			const ref = col.references;
			parts.push(`REFERENCES ${ref.table}(${ref.column})`);
			if (ref.onDelete) parts.push(`ON DELETE ${ref.onDelete}`);
			if (ref.onUpdate) parts.push(`ON UPDATE ${ref.onUpdate}`);
		}

		columnDefs.push(parts.join(" "));
	}

	// Add primary key constraint if multiple
	if (primaryKeys.length > 1) {
		columnDefs.push(`PRIMARY KEY (${primaryKeys.join(", ")})`);
	}

	// Add constraints
	for (const constraint of schema.constraints ?? []) {
		if (constraint.type === "unique") {
			const name =
				constraint.name || `uq_${schema.name}_${constraint.columns.join("_")}`;
			columnDefs.push(
				`CONSTRAINT ${name} UNIQUE (${constraint.columns.join(", ")})`,
			);
		} else if (constraint.type === "check" && constraint.check) {
			const name = constraint.name || `chk_${schema.name}`;
			columnDefs.push(`CONSTRAINT ${name} CHECK (${constraint.check})`);
		}
	}

	let sql = `CREATE TABLE ${schema.name} (\n  ${columnDefs.join(",\n  ")}\n)`;

	if (driver === "postgresql" && schema.comment) {
		sql += `;\nCOMMENT ON TABLE ${schema.name} IS '${schema.comment}'`;
	}

	return `${sql};`;
}

/**
 * Generate DROP TABLE SQL
 */
export function generateDropTable(tableName: string, ifExists = true): string {
	if (ifExists) {
		return `DROP TABLE IF EXISTS ${tableName};`;
	}
	return `DROP TABLE ${tableName};`;
}

/**
 * Generate CREATE INDEX SQL
 */
export function generateCreateIndex(
	tableName: string,
	index: IndexDefinition,
	driver: "postgresql" | "mysql" | "sqlite" = "postgresql",
): string {
	const name = index.name || `idx_${tableName}_${index.columns.join("_")}`;
	const unique = index.unique ? "UNIQUE " : "";
	const type =
		index.type && driver === "postgresql" ? `USING ${index.type} ` : "";

	return `CREATE ${unique}INDEX ${name} ON ${tableName} ${type}(${index.columns.join(", ")});`;
}

// ============= Type Mappers =============

function mapColumnType(
	col: ColumnOptions,
	driver: "postgresql" | "mysql" | "sqlite",
): string {
	const typeMap: Record<ColumnType, Record<string, string>> = {
		serial: {
			postgresql: "SERIAL",
			mysql: "INT AUTO_INCREMENT",
			sqlite: "INTEGER",
		},
		integer: {
			postgresql: "INTEGER",
			mysql: "INT",
			sqlite: "INTEGER",
		},
		bigint: {
			postgresql: "BIGINT",
			mysql: "BIGINT",
			sqlite: "INTEGER",
		},
		decimal: {
			postgresql: col.precision
				? `DECIMAL(${col.precision}, ${col.scale ?? 0})`
				: "DECIMAL",
			mysql: col.precision
				? `DECIMAL(${col.precision}, ${col.scale ?? 0})`
				: "DECIMAL",
			sqlite: "REAL",
		},
		varchar: {
			postgresql: col.length ? `VARCHAR(${col.length})` : "VARCHAR",
			mysql: col.length ? `VARCHAR(${col.length})` : "VARCHAR(255)",
			sqlite: "TEXT",
		},
		text: {
			postgresql: "TEXT",
			mysql: "TEXT",
			sqlite: "TEXT",
		},
		boolean: {
			postgresql: "BOOLEAN",
			mysql: "TINYINT(1)",
			sqlite: "INTEGER",
		},
		date: {
			postgresql: "DATE",
			mysql: "DATE",
			sqlite: "TEXT",
		},
		timestamp: {
			postgresql: "TIMESTAMP",
			mysql: "DATETIME",
			sqlite: "TEXT",
		},
		timestamptz: {
			postgresql: "TIMESTAMPTZ",
			mysql: "DATETIME",
			sqlite: "TEXT",
		},
		json: {
			postgresql: "JSON",
			mysql: "JSON",
			sqlite: "TEXT",
		},
		jsonb: {
			postgresql: "JSONB",
			mysql: "JSON",
			sqlite: "TEXT",
		},
		uuid: {
			postgresql: "UUID",
			mysql: "CHAR(36)",
			sqlite: "TEXT",
		},
		blob: {
			postgresql: "BYTEA",
			mysql: "BLOB",
			sqlite: "BLOB",
		},
		enum: {
			postgresql: col.enum
				? `ENUM(${col.enum.map((e) => `'${e}'`).join(", ")})`
				: "VARCHAR",
			mysql: col.enum
				? `ENUM(${col.enum.map((e) => `'${e}'`).join(", ")})`
				: "VARCHAR",
			sqlite: "TEXT",
		},
	};

	return typeMap[col.type][driver];
}

function formatDefault(
	value: unknown,
	driver: "postgresql" | "mysql" | "sqlite",
): string {
	if (value === null) return "NULL";
	if (value === true) return driver === "sqlite" ? "1" : "TRUE";
	if (value === false) return driver === "sqlite" ? "0" : "FALSE";
	if (typeof value === "number") return String(value);
	if (typeof value === "string") {
		// Check for SQL functions
		if (
			value.toUpperCase() === "NOW()" ||
			value.toUpperCase() === "CURRENT_TIMESTAMP"
		) {
			return driver === "mysql" ? "CURRENT_TIMESTAMP" : value.toUpperCase();
		}
		return `'${value.replace(/'/g, "''")}'`;
	}
	return String(value);
}

// ============= Type Inference Helpers =============

/**
 * TypeScript type mapping from column types
 * This is for documentation/type generation purposes
 */
export type TypeScriptType<T extends ColumnType> = T extends
	| "serial"
	| "integer"
	? number
	: T extends "bigint"
		? bigint | string
		: T extends "decimal"
			? number | string
			: T extends "varchar" | "text" | "uuid" | "enum"
				? string
				: T extends "boolean"
					? boolean
					: T extends "date" | "timestamp" | "timestamptz"
						? Date | string
						: T extends "json" | "jsonb"
							? Record<string, unknown> | unknown[]
							: T extends "blob"
								? Buffer | ArrayBuffer
								: unknown;

/**
 * Infer TypeScript type from schema
 * Usage: type User = InferType<typeof userSchema>
 */
export type InferType<S extends TableSchema> = {
	[K in keyof S["columns"]]: S["columns"][K] extends { nullable: true }
		? TypeScriptType<S["columns"][K]["type"]> | null
		: TypeScriptType<S["columns"][K]["type"]>;
};

/**
 * Infer insert type (optional fields with defaults)
 */
export type InferInsertType<S extends TableSchema> = {
	[K in keyof S["columns"]]: S["columns"][K] extends { default: unknown }
		? TypeScriptType<S["columns"][K]["type"]> | undefined
		: S["columns"][K] extends { nullable: true }
			? TypeScriptType<S["columns"][K]["type"]> | null | undefined
			: TypeScriptType<S["columns"][K]["type"]>;
};

// ============= Schema Factory =============

/**
 * Create a new schema builder
 */
export function createSchema(tableName: string): SchemaBuilder {
	return new SchemaBuilder(tableName);
}

/**
 * Define a table schema
 */
export function defineTable(
	name: string,
	define: (builder: SchemaBuilder) => void,
): TableSchema {
	const builder = new SchemaBuilder(name);
	define(builder);
	return builder.build();
}
