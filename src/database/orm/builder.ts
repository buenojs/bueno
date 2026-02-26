/**
 * ORM Query Builder
 *
 * Fluent, chainable query builder for SELECT, INSERT, UPDATE, DELETE operations.
 * Works independently of Model; can be used standalone.
 */

import type { Database } from "../index";
import {
	QueryCompiler,
	type SqlDialect,
	type QueryState,
	type WhereClause,
	type OrderClause,
	type JoinClause,
	type CompiledQuery,
} from "./compiler";

export interface PaginationResult<T> {
	data: T[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

/**
 * Standalone ORM Query Builder
 * Generic over the row type T returned by queries
 */
export class OrmQueryBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
	protected state: QueryState;
	protected compiler: QueryCompiler;
	protected db: Database;
	protected rowTransformer?: (row: Record<string, unknown>) => T;

	constructor(db: Database, table: string, dialect?: SqlDialect) {
		this.db = db;
		this.compiler = new QueryCompiler(dialect || db.getDriver());
		this.state = {
			table,
			selects: [],
			wheres: [],
			orders: [],
			joins: [],
			groupBys: [],
			havings: [],
			distinct: false,
		};
	}

	/**
	 * Clone this builder to a new instance (used by scopes, relationships)
	 */
	clone(): OrmQueryBuilder<T> {
		const cloned = new OrmQueryBuilder<T>(this.db, this.state.table);
		cloned.state = {
			...this.state,
			wheres: [...this.state.wheres],
			orders: [...this.state.orders],
			joins: [...this.state.joins],
			selects: [...this.state.selects],
			groupBys: [...this.state.groupBys],
			havings: [...this.state.havings],
		};
		cloned.compiler = this.compiler;
		cloned.rowTransformer = this.rowTransformer;
		return cloned;
	}

	/**
	 * Set row transformer (called after fetch, before return)
	 */
	setRowTransformer(fn: (row: Record<string, unknown>) => T): this {
		this.rowTransformer = fn;
		return this;
	}

	// ============= SELECT =============

	select(...columns: string[]): this {
		this.state.selects = columns;
		return this;
	}

	addSelect(...columns: string[]): this {
		this.state.selects.push(...columns);
		return this;
	}

	distinct(): this {
		this.state.distinct = true;
		return this;
	}

	// ============= WHERE =============

	where(
		column: string,
		operatorOrValue: unknown,
		value?: unknown,
	): this {
		const [operator, val] =
			value === undefined
				? ["=", operatorOrValue]
				: [String(operatorOrValue), value];

		this.state.wheres.push({
			type: "and",
			column,
			operator,
			value: val,
		});
		return this;
	}

	orWhere(
		column: string,
		operatorOrValue: unknown,
		value?: unknown,
	): this {
		const [operator, val] =
			value === undefined
				? ["=", operatorOrValue]
				: [String(operatorOrValue), value];

		this.state.wheres.push({
			type: "or",
			column,
			operator,
			value: val,
		});
		return this;
	}

	whereRaw(sql: string, params?: unknown[]): this {
		this.state.wheres.push({
			type: "and",
			raw: sql,
			rawParams: params,
		});
		return this;
	}

	whereIn(column: string, values: unknown[]): this {
		this.state.wheres.push({
			type: "and",
			column,
			operator: "IN",
			value: values,
		});
		return this;
	}

	whereNotIn(column: string, values: unknown[]): this {
		this.state.wheres.push({
			type: "and",
			column,
			operator: "NOT IN",
			value: values,
		});
		return this;
	}

	whereNull(column: string): this {
		this.state.wheres.push({
			type: "and",
			column,
			operator: "IS NULL",
		});
		return this;
	}

	whereNotNull(column: string): this {
		this.state.wheres.push({
			type: "and",
			column,
			operator: "IS NOT NULL",
		});
		return this;
	}

	whereBetween(column: string, min: unknown, max: unknown): this {
		this.state.wheres.push({
			type: "and",
			column,
			operator: "BETWEEN",
			value: [min, max],
		});
		return this;
	}

	// ============= JOIN =============

	join(table: string, on: string, type: "INNER" | "LEFT" | "RIGHT" = "INNER"): this {
		this.state.joins.push({ type, table, on });
		return this;
	}

	leftJoin(table: string, on: string): this {
		return this.join(table, on, "LEFT");
	}

	rightJoin(table: string, on: string): this {
		return this.join(table, on, "RIGHT");
	}

	crossJoin(table: string): this {
		this.state.joins.push({ type: "CROSS", table, on: "" });
		return this;
	}

	// ============= GROUP BY / HAVING =============

	groupBy(...columns: string[]): this {
		this.state.groupBys.push(...columns);
		return this;
	}

	having(raw: string, params?: unknown[]): this {
		this.state.havings.push(raw);
		if (params) {
			// HAVING with params is more complex; for now, just support raw SQL
		}
		return this;
	}

	// ============= ORDER BY =============

	orderBy(column: string, direction: "ASC" | "DESC" = "ASC"): this {
		this.state.orders.push({ column, direction });
		return this;
	}

	orderByDesc(column: string): this {
		return this.orderBy(column, "DESC");
	}

	// ============= LIMIT / OFFSET =============

	limit(n: number): this {
		this.state.limitVal = n;
		return this;
	}

	offset(n: number): this {
		this.state.offsetVal = n;
		return this;
	}

	// ============= LOCKING =============

	lockForShare(): this {
		this.state.lockMode = "share";
		return this;
	}

	lockForUpdate(): this {
		this.state.lockMode = "update";
		return this;
	}

	// ============= TERMINAL METHODS =============

	/**
	 * Fetch all rows
	 */
	async get(): Promise<T[]> {
		const { sql, params } = this.compiler.compileSelect(this.state);
		const rows = await this.db.raw<Record<string, unknown>>(sql, params);
		return rows.map((row) =>
			this.rowTransformer ? this.rowTransformer(row) : (row as T),
		);
	}

	/**
	 * Fetch first row
	 */
	async first(): Promise<T | null> {
		const results = await this.limit(1).get();
		return results.length > 0 ? results[0] : null;
	}

	/**
	 * Fetch first row or throw
	 */
	async firstOrFail(): Promise<T> {
		const result = await this.first();
		if (!result) {
			throw new Error(`No record found for query`);
		}
		return result;
	}

	/**
	 * Find by primary key (assumes 'id' column)
	 */
	async find(id: unknown): Promise<T | null> {
		return this.where("id", id).first();
	}

	/**
	 * Find by primary key or throw
	 */
	async findOrFail(id: unknown): Promise<T> {
		const result = await this.find(id);
		if (!result) {
			throw new Error(`Record with id ${id} not found`);
		}
		return result;
	}

	/**
	 * Count rows
	 */
	async count(column = "*"): Promise<number> {
		const { sql, params } = this.compiler.compileCount(this.state, column);
		const rows = await this.db.raw<{ count: string | number }>(sql, params);
		return Number(rows[0]?.count ?? 0);
	}

	/**
	 * Check if any rows exist
	 */
	async exists(): Promise<boolean> {
		const count = await this.count();
		return count > 0;
	}

	/**
	 * Pluck a single column
	 */
	async pluck<K extends keyof T>(column: K): Promise<T[K][]> {
		const results = await this.select(String(column)).get();
		return results.map((row) => row[column]);
	}

	/**
	 * Get a single column value
	 */
	async value<K extends keyof T>(column: K): Promise<T[K] | null> {
		const result = await this.select(String(column)).first();
		return result ? result[column] : null;
	}

	/**
	 * Paginate results
	 */
	async paginate(
		page: number,
		limit: number,
	): Promise<PaginationResult<T>> {
		const offset = (page - 1) * limit;
		const [data, total] = await Promise.all([
			this.clone().offset(offset).limit(limit).get(),
			this.clone().count(),
		]);

		return {
			data,
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		};
	}

	/**
	 * Insert a single row
	 */
	async insert(data: Partial<T>): Promise<T> {
		const { sql, params } = this.compiler.compileInsert(
			this.state.table,
			data as Record<string, unknown>,
		);

		if (this.db.getDriver() === "postgresql") {
			const rows = await this.db.raw<Record<string, unknown>>(sql, params);
			return (this.rowTransformer ? this.rowTransformer(rows[0]) : rows[0]) as T;
		}

		// SQLite / MySQL
		await this.db.raw(sql, params);
		const lastId = await this.getLastInsertId();
		const row = await this.db.raw<Record<string, unknown>>(
			`SELECT * FROM ${this.state.table} WHERE id = ?`,
			[lastId],
		);
		return (this.rowTransformer ? this.rowTransformer(row[0]) : row[0]) as T;
	}

	/**
	 * Insert multiple rows
	 */
	async insertMany(items: Partial<T>[]): Promise<T[]> {
		const results: T[] = [];
		for (const item of items) {
			const result = await this.insert(item);
			results.push(result);
		}
		return results;
	}

	/**
	 * Update rows matching the query
	 */
	async update(data: Partial<T>): Promise<number> {
		const { sql, params } = this.compiler.compileUpdate(
			this.state,
			data as Record<string, unknown>,
		);

		if (this.db.getDriver() === "postgresql") {
			const rows = await this.db.raw<Record<string, unknown>>(sql, params);
			return rows.length;
		}

		// SQLite / MySQL don't have RETURNING, use changes() if available
		await this.db.raw(sql, params);
		return 0; // TODO: get affected row count from Bun.SQL
	}

	/**
	 * Delete rows matching the query
	 */
	async delete(): Promise<number> {
		const { sql, params } = this.compiler.compileDelete(this.state);
		await this.db.raw(sql, params);
		return 0; // TODO: get affected row count from Bun.SQL
	}

	/**
	 * Get last insert ID (SQLite/MySQL only)
	 */
	private async getLastInsertId(): Promise<number | string> {
		const driver = this.db.getDriver();
		if (driver === "sqlite") {
			const row = await this.db.raw<{ id: number }>(
				"SELECT last_insert_rowid() as id",
			);
			return row[0].id;
		}
		if (driver === "mysql") {
			const row = await this.db.raw<{ id: number }>(
				"SELECT LAST_INSERT_ID() as id",
			);
			return row[0].id;
		}
		throw new Error("Unexpected driver");
	}
}

/**
 * Factory function to create a query builder
 */
export function query<T extends Record<string, unknown> = Record<string, unknown>>(
	db: Database,
	table: string,
): OrmQueryBuilder<T> {
	return new OrmQueryBuilder<T>(db, table);
}
