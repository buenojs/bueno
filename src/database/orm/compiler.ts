/**
 * SQL Query Compiler
 *
 * Converts a QueryState into SQL strings and parameters,
 * handling driver differences (PostgreSQL $1 vs SQLite/MySQL ?)
 */

export type SqlDialect = "postgresql" | "mysql" | "sqlite";

export interface CompiledQuery {
	sql: string;
	params: unknown[];
}

export interface WhereClause {
	type: "and" | "or";
	column?: string;
	operator?: string;
	value?: unknown;
	raw?: string;
	rawParams?: unknown[];
	nested?: WhereClause[];
}

export interface OrderClause {
	column: string;
	direction: "ASC" | "DESC";
}

export interface JoinClause {
	type: "INNER" | "LEFT" | "RIGHT" | "CROSS";
	table: string;
	on: string;
}

export interface QueryState {
	table: string;
	alias?: string;
	selects: string[];
	wheres: WhereClause[];
	orders: OrderClause[];
	joins: JoinClause[];
	limitVal?: number;
	offsetVal?: number;
	groupBys: string[];
	havings: string[];
	distinct: boolean;
	lockMode?: "share" | "update";
}

export class QueryCompiler {
	private paramIndex = 0;
	private params: unknown[] = [];

	constructor(private dialect: SqlDialect) {}

	/**
	 * Reset state for a new compilation
	 */
	private reset(): void {
		this.paramIndex = 0;
		this.params = [];
	}

	/**
	 * Add a parameter and return the placeholder for this dialect
	 */
	private addParam(value: unknown): string {
		this.params.push(value);
		if (this.dialect === "postgresql") {
			return `$${++this.paramIndex}`;
		}
		this.paramIndex++;
		return "?";
	}

	/**
	 * Compile a SELECT query
	 */
	compileSelect(state: QueryState): CompiledQuery {
		this.reset();
		const parts: string[] = [];

		// SELECT
		const cols = state.selects.length > 0 ? state.selects.join(", ") : "*";
		const distinct = state.distinct ? "DISTINCT " : "";
		parts.push(`SELECT ${distinct}${cols}`);

		// FROM
		const alias = state.alias ? ` AS ${state.alias}` : "";
		parts.push(`FROM ${state.table}${alias}`);

		// JOINs
		for (const j of state.joins) {
			parts.push(`${j.type} JOIN ${j.table} ON ${j.on}`);
		}

		// WHERE
		if (state.wheres.length > 0) {
			parts.push(`WHERE ${this.compileWheres(state.wheres)}`);
		}

		// GROUP BY
		if (state.groupBys.length > 0) {
			parts.push(`GROUP BY ${state.groupBys.join(", ")}`);
		}

		// HAVING
		if (state.havings.length > 0) {
			parts.push(`HAVING ${state.havings.join(" AND ")}`);
		}

		// ORDER BY
		if (state.orders.length > 0) {
			const orderStr = state.orders
				.map((o) => `${o.column} ${o.direction}`)
				.join(", ");
			parts.push(`ORDER BY ${orderStr}`);
		}

		// LIMIT / OFFSET
		if (state.limitVal !== undefined) {
			parts.push(`LIMIT ${this.addParam(state.limitVal)}`);
		}
		if (state.offsetVal !== undefined) {
			parts.push(`OFFSET ${this.addParam(state.offsetVal)}`);
		}

		// Locking
		if (state.lockMode === "update") parts.push("FOR UPDATE");
		if (state.lockMode === "share") parts.push("FOR SHARE");

		return { sql: parts.join(" "), params: [...this.params] };
	}

	/**
	 * Compile WHERE clauses into SQL
	 */
	private compileWheres(wheres: WhereClause[]): string {
		return wheres
			.map((w, i) => {
				const prefix = i === 0 ? "" : `${w.type.toUpperCase()} `;

				if (w.raw !== undefined) {
					if (w.rawParams) {
						for (const p of w.rawParams) {
							this.params.push(p);
						}
					}
					return `${prefix}(${w.raw})`;
				}

				if (w.nested) {
					return `${prefix}(${this.compileWheres(w.nested)})`;
				}

				if (w.operator === "IN" && Array.isArray(w.value)) {
					const placeholders = w.value
						.map((v) => this.addParam(v))
						.join(", ");
					return `${prefix}${w.column} IN (${placeholders})`;
				}

				if (w.operator === "IS NULL") {
					return `${prefix}${w.column} IS NULL`;
				}

				if (w.operator === "IS NOT NULL") {
					return `${prefix}${w.column} IS NOT NULL`;
				}

				if (w.operator === "BETWEEN") {
					const [min, max] = w.value as [unknown, unknown];
					return `${prefix}${w.column} BETWEEN ${this.addParam(min)} AND ${this.addParam(max)}`;
				}

				return `${prefix}${w.column} ${w.operator} ${this.addParam(w.value)}`;
			})
			.join(" ");
	}

	/**
	 * Compile an INSERT query
	 */
	compileInsert(table: string, data: Record<string, unknown>): CompiledQuery {
		this.reset();
		const keys = Object.keys(data);
		const columns = keys.join(", ");
		const placeholders = keys.map((k) => this.addParam(data[k])).join(", ");

		const returning =
			this.dialect === "postgresql" ? " RETURNING *" : "";
		return {
			sql: `INSERT INTO ${table} (${columns}) VALUES (${placeholders})${returning}`,
			params: [...this.params],
		};
	}

	/**
	 * Compile a batch INSERT query
	 */
	compileBatchInsert(table: string, rows: Record<string, unknown>[]): CompiledQuery {
		this.reset();

		if (rows.length === 0) {
			return { sql: "", params: [] };
		}

		const keys = Object.keys(rows[0]);
		const columns = keys.join(", ");

		const valueRows = rows.map((row) => {
			const placeholders = keys.map((k) => this.addParam(row[k])).join(", ");
			return `(${placeholders})`;
		});

		const returning =
			this.dialect === "postgresql" ? " RETURNING *" : "";
		return {
			sql: `INSERT INTO ${table} (${columns}) VALUES ${valueRows.join(", ")}${returning}`,
			params: [...this.params],
		};
	}

	/**
	 * Compile an UPDATE query
	 */
	compileUpdate(state: QueryState, data: Record<string, unknown>): CompiledQuery {
		this.reset();
		const sets = Object.entries(data)
			.map(([col, val]) => `${col} = ${this.addParam(val)}`)
			.join(", ");

		const whereStr =
			state.wheres.length > 0 ? ` WHERE ${this.compileWheres(state.wheres)}` : "";

		const returning =
			this.dialect === "postgresql" ? " RETURNING *" : "";
		return {
			sql: `UPDATE ${state.table} SET ${sets}${whereStr}${returning}`,
			params: [...this.params],
		};
	}

	/**
	 * Compile a DELETE query
	 */
	compileDelete(state: QueryState): CompiledQuery {
		this.reset();
		const whereStr =
			state.wheres.length > 0 ? ` WHERE ${this.compileWheres(state.wheres)}` : "";
		return {
			sql: `DELETE FROM ${state.table}${whereStr}`,
			params: [...this.params],
		};
	}

	/**
	 * Compile a COUNT query
	 */
	compileCount(state: QueryState, column = "*"): CompiledQuery {
		this.reset();
		const countCol = column === "*" ? "COUNT(*)" : `COUNT(${column})`;
		const parts: string[] = [`SELECT ${countCol}`];

		const alias = state.alias ? ` AS ${state.alias}` : "";
		parts.push(`FROM ${state.table}${alias}`);

		for (const j of state.joins) {
			parts.push(`${j.type} JOIN ${j.table} ON ${j.on}`);
		}

		if (state.wheres.length > 0) {
			parts.push(`WHERE ${this.compileWheres(state.wheres)}`);
		}

		return { sql: parts.join(" "), params: [...this.params] };
	}

	/**
	 * Compile an EXISTS query
	 */
	compileExists(state: QueryState): CompiledQuery {
		const selectCompiled = this.compileSelect({ ...state, selects: ["1"], limitVal: 1 });
		return {
			sql: `SELECT EXISTS(${selectCompiled.sql}) as exists`,
			params: selectCompiled.params,
		};
	}
}
