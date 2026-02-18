/**
 * Database Migration System
 *
 * Provides utilities for managing database migrations with
 * up/down support, version tracking, and rollback capabilities.
 */

import type { Database } from "../index";
import {
	type TableSchema,
	generateCreateIndex,
	generateCreateTable,
	generateDropTable,
} from "../schema";

// ============= Types =============

export interface Migration {
	id: string;
	name: string;
	up: (db: MigrationRunner) => Promise<void>;
	down: (db: MigrationRunner) => Promise<void>;
}

export interface MigrationRecord {
	id: string;
	name: string;
	executedAt: Date;
}

export interface MigrationOptions {
	migrationsTable?: string;
	migrationsDir?: string;
}

// ============= Migration Runner =============

export class MigrationRunner {
	private db: Database;
	private migrationsTable: string;

	constructor(db: Database, options: MigrationOptions = {}) {
		this.db = db;
		this.migrationsTable = options.migrationsTable ?? "_migrations";
	}

	/**
	 * Ensure migrations table exists
	 */
	async ensureMigrationsTable(): Promise<void> {
		await this.db.raw(`
      CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
	}

	/**
	 * Get list of executed migrations
	 */
	async getExecutedMigrations(): Promise<MigrationRecord[]> {
		await this.ensureMigrationsTable();

		const results = await this.db.raw<{
			id: string;
			name: string;
			executed_at: string;
		}>(
			`SELECT id, name, executed_at FROM ${this.migrationsTable} ORDER BY id ASC`,
		);

		return results.map((r) => ({
			id: r.id,
			name: r.name,
			executedAt: new Date(r.executed_at),
		}));
	}

	/**
	 * Get pending migrations
	 */
	async getPendingMigrations(migrations: Migration[]): Promise<Migration[]> {
		const executed = await this.getExecutedMigrations();
		const executedIds = new Set(executed.map((m) => m.id));

		return migrations
			.filter((m) => !executedIds.has(m.id))
			.sort((a, b) => a.id.localeCompare(b.id));
	}

	/**
	 * Run a single migration
	 */
	async runMigration(migration: Migration): Promise<void> {
		await this.db.transaction(async () => {
			await migration.up(this);

			await this.db.raw(
				`INSERT INTO ${this.migrationsTable} (id, name) VALUES (?, ?)`,
				[migration.id, migration.name],
			);
		});
	}

	/**
	 * Run all pending migrations
	 */
	async migrate(migrations: Migration[]): Promise<{ executed: string[] }> {
		const pending = await this.getPendingMigrations(migrations);
		const executed: string[] = [];

		for (const migration of pending) {
			await this.runMigration(migration);
			executed.push(migration.id);
			console.log(`Executed migration: ${migration.id} - ${migration.name}`);
		}

		return { executed };
	}

	/**
	 * Rollback last n migrations
	 */
	async rollback(
		migrations: Migration[],
		steps = 1,
	): Promise<{ rolledBack: string[] }> {
		const executed = await this.getExecutedMigrations();
		const rolledBack: string[] = [];

		// Sort migrations by id descending for rollback
		const migrationsById = new Map(migrations.map((m) => [m.id, m]));

		// Get migrations to rollback
		const toRollback = executed
			.sort((a, b) => b.id.localeCompare(a.id))
			.slice(0, steps);

		for (const record of toRollback) {
			const migration = migrationsById.get(record.id);

			if (!migration) {
				console.warn(`Migration not found: ${record.id}`);
				continue;
			}

			await this.db.transaction(async () => {
				await migration.down(this);

				await this.db.raw(`DELETE FROM ${this.migrationsTable} WHERE id = ?`, [
					record.id,
				]);
			});

			rolledBack.push(record.id);
			console.log(`Rolled back migration: ${record.id} - ${record.name}`);
		}

		return { rolledBack };
	}

	/**
	 * Reset all migrations
	 */
	async reset(migrations: Migration[]): Promise<{ rolledBack: string[] }> {
		const executed = await this.getExecutedMigrations();
		return this.rollback(migrations, executed.length);
	}

	/**
	 * Refresh migrations (rollback all, then migrate all)
	 */
	async refresh(
		migrations: Migration[],
	): Promise<{ rolledBack: string[]; executed: string[] }> {
		const { rolledBack } = await this.reset(migrations);
		const { executed } = await this.migrate(migrations);
		return { rolledBack, executed };
	}

	// ============= Schema Helpers =============

	/**
	 * Create a table
	 */
	async createTable(schema: TableSchema): Promise<void> {
		const sql = generateCreateTable(schema, "postgresql");
		await this.db.raw(sql);

		// Create indexes
		for (const index of schema.indexes ?? []) {
			await this.createIndex(schema.name, index);
		}
	}

	/**
	 * Drop a table
	 */
	async dropTable(name: string): Promise<void> {
		const sql = generateDropTable(name);
		await this.db.raw(sql);
	}

	/**
	 * Create an index
	 */
	async createIndex(
		tableName: string,
		index: { name?: string; columns: string[]; unique?: boolean },
	): Promise<void> {
		const sql = generateCreateIndex(tableName, index, "postgresql");
		await this.db.raw(sql);
	}

	/**
	 * Drop an index
	 */
	async dropIndex(name: string): Promise<void> {
		await this.db.raw(`DROP INDEX IF EXISTS ${name}`);
	}

	/**
	 * Add a column
	 */
	async addColumn(
		table: string,
		name: string,
		type: string,
		options?: {
			nullable?: boolean;
			default?: unknown;
		},
	): Promise<void> {
		let sql = `ALTER TABLE ${table} ADD COLUMN ${name} ${type}`;

		if (options?.default !== undefined) {
			sql += ` DEFAULT ${typeof options.default === "string" ? `'${options.default}'` : options.default}`;
		}

		if (!options?.nullable) {
			sql += " NOT NULL";
		}

		await this.db.raw(sql);
	}

	/**
	 * Drop a column
	 */
	async dropColumn(table: string, name: string): Promise<void> {
		await this.db.raw(`ALTER TABLE ${table} DROP COLUMN ${name}`);
	}

	/**
	 * Rename a column
	 */
	async renameColumn(
		table: string,
		oldName: string,
		newName: string,
	): Promise<void> {
		await this.db.raw(
			`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName}`,
		);
	}

	/**
	 * Add a foreign key
	 */
	async addForeignKey(
		table: string,
		columns: string[],
		reference: { table: string; columns: string[] },
		options?: {
			name?: string;
			onDelete?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";
			onUpdate?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";
		},
	): Promise<void> {
		const name = options?.name ?? `fk_${table}_${columns.join("_")}`;
		let sql = `ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY (${columns.join(", ")}) REFERENCES ${reference.table}(${reference.columns.join(", ")})`;

		if (options?.onDelete) sql += ` ON DELETE ${options.onDelete}`;
		if (options?.onUpdate) sql += ` ON UPDATE ${options.onUpdate}`;

		await this.db.raw(sql);
	}

	/**
	 * Drop a foreign key
	 */
	async dropForeignKey(table: string, name: string): Promise<void> {
		await this.db.raw(`ALTER TABLE ${table} DROP CONSTRAINT ${name}`);
	}

	/**
	 * Execute raw SQL
	 */
	async raw(sql: string): Promise<void> {
		await this.db.raw(sql);
	}
}

// ============= Migration Builder =============

export class MigrationBuilder {
	private id: string;
	private name: string;
	private upFn: (runner: MigrationRunner) => Promise<void> = async () => {};
	private downFn: (runner: MigrationRunner) => Promise<void> = async () => {};

	constructor(id: string, name: string) {
		this.id = id;
		this.name = name;
	}

	up(fn: (runner: MigrationRunner) => Promise<void>): this {
		this.upFn = fn;
		return this;
	}

	down(fn: (runner: MigrationRunner) => Promise<void>): this {
		this.downFn = fn;
		return this;
	}

	build(): Migration {
		return {
			id: this.id,
			name: this.name,
			up: this.upFn,
			down: this.downFn,
		};
	}
}

// ============= Factory Functions =============

/**
 * Create a migration builder
 */
export function createMigration(id: string, name: string): MigrationBuilder {
	return new MigrationBuilder(id, name);
}

/**
 * Create a migration runner
 */
export function createMigrationRunner(
	db: Database,
	options?: MigrationOptions,
): MigrationRunner {
	return new MigrationRunner(db, options);
}

/**
 * Generate migration ID from timestamp
 */
export function generateMigrationId(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	const hour = String(now.getHours()).padStart(2, "0");
	const minute = String(now.getMinutes()).padStart(2, "0");
	const second = String(now.getSeconds()).padStart(2, "0");

	return `${year}${month}${day}${hour}${minute}${second}`;
}
