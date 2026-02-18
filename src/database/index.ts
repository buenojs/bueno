/**
 * Database Layer
 *
 * Unified interface over Bun.SQL supporting PostgreSQL, MySQL, and SQLite.
 * Uses Bun 1.3+ native SQL client with tagged template literals.
 */

// ============= Types =============

export type DatabaseDriver = "postgresql" | "mysql" | "sqlite";

/**
 * Database metrics for observability
 */
export interface DatabaseMetrics {
	queries: number; // SELECT operations
	inserts: number;
	updates: number;
	deletes: number;
	errors: number;
	avgLatency: number; // in milliseconds
	totalLatency: number;
	slowQueries: number; // queries exceeding slowQueryThreshold
	totalOperations: number;
}

export interface DatabaseConfig {
	url: string;
	driver?: DatabaseDriver;
	pool?: {
		max?: number;
		idleTimeout?: number;
		maxLifetime?: number;
		connectionTimeout?: number;
	};
	tls?:
		| boolean
		| {
				rejectUnauthorized?: boolean;
				ca?: string;
				key?: string;
				cert?: string;
		  };
	bigint?: boolean;
	prepare?: boolean;
	enableMetrics?: boolean; // Enable metrics collection (default: true)
	slowQueryThreshold?: number; // Threshold in ms to flag slow queries (default: 100)
}

export interface QueryResult {
	rows: unknown[];
	rowCount: number;
	insertId?: number | string;
}

export interface Transaction {
	query<T>(strings: TemplateStringsArray, ...params: unknown[]): Promise<T[]>;
	queryOne<T>(
		strings: TemplateStringsArray,
		...params: unknown[]
	): Promise<T | null>;
	execute(
		strings: TemplateStringsArray,
		...params: unknown[]
	): Promise<QueryResult>;
}

/**
 * Query event types for event emission
 */
export type QueryEventType = "query:start" | "query:end" | "query:error";

/**
 * Query event data
 */
export interface QueryEvent {
	type: QueryEventType;
	sql?: string;
	params?: unknown[];
	latency?: number;
	error?: Error;
	operationType?: "query" | "insert" | "update" | "delete" | "other";
}

/**
 * Query event listener
 */
export type QueryEventListener = (event: QueryEvent) => void;

// ============= Driver Detection =============

/**
 * Detect database driver from connection string
 */
export function detectDriver(url: string): DatabaseDriver {
	if (url.startsWith("mysql://") || url.startsWith("mysql2://")) {
		return "mysql";
	}
	if (
		url.startsWith("sqlite://") ||
		url.startsWith("file://") ||
		url.startsWith("file:") ||
		url === ":memory:" ||
		url.endsWith(".db") ||
		url.endsWith(".sqlite") ||
		url.endsWith(".sqlite3")
	) {
		return "sqlite";
	}
	// PostgreSQL is the default
	return "postgresql";
}

// ============= SQL Fragment Builder =============

/**
 * Build SQL fragment for inserts/updates
 */
function buildInsertFragment(data: Record<string, unknown>): {
	columns: string;
	values: string;
	params: unknown[];
} {
	const keys = Object.keys(data);
	const params: unknown[] = [];
	const placeholders: string[] = [];

	for (const key of keys) {
		params.push(data[key]);
		placeholders.push("?");
	}

	return {
		columns: `(${keys.join(", ")})`,
		values: `(${placeholders.join(", ")})`,
		params,
	};
}

/**
 * Build SET clause for updates
 */
function buildSetFragment(data: Record<string, unknown>): {
	clause: string;
	params: unknown[];
} {
	const keys = Object.keys(data);
	const params: unknown[] = [];
	const sets: string[] = [];

	for (const key of keys) {
		params.push(data[key]);
		sets.push(`${key} = ?`);
	}

	return {
		clause: sets.join(", "),
		params,
	};
}

/**
 * Detect operation type from SQL string
 */
function detectOperationType(sql: string): "query" | "insert" | "update" | "delete" | "other" {
	const normalizedSql = sql.trim().toUpperCase();
	if (normalizedSql.startsWith("SELECT")) return "query";
	if (normalizedSql.startsWith("INSERT")) return "insert";
	if (normalizedSql.startsWith("UPDATE")) return "update";
	if (normalizedSql.startsWith("DELETE")) return "delete";
	return "other";
}

// ============= Database Class =============

export class Database {
	private config: DatabaseConfig;
	private driver: DatabaseDriver;
	private sql: unknown = null;
	private _isConnected = false;

	// Metrics tracking
	private enableMetrics: boolean;
	private slowQueryThreshold: number;
	private metrics: DatabaseMetrics = {
		queries: 0,
		inserts: 0,
		updates: 0,
		deletes: 0,
		errors: 0,
		avgLatency: 0,
		totalLatency: 0,
		slowQueries: 0,
		totalOperations: 0,
	};

	// Event listeners
	private eventListeners: Map<QueryEventType, Set<QueryEventListener>> = new Map();

	constructor(config: DatabaseConfig | string) {
		this.config = typeof config === "string" ? { url: config } : config;
		this.driver = this.config.driver ?? detectDriver(this.config.url);
		this.enableMetrics = this.config.enableMetrics ?? true;
		this.slowQueryThreshold = this.config.slowQueryThreshold ?? 100;
	}

	/**
	 * Get current timestamp in milliseconds
	 */
	private getTimestamp(): number {
		// Use Bun.nanoseconds() if available, otherwise performance.now()
		try {
			return Bun.nanoseconds() / 1_000_000;
		} catch {
			return performance.now();
		}
	}

	/**
	 * Get current metrics snapshot
	 */
	getMetrics(): DatabaseMetrics {
		return { ...this.metrics };
	}

	/**
	 * Reset metrics counters
	 */
	resetMetrics(): void {
		this.metrics = {
			queries: 0,
			inserts: 0,
			updates: 0,
			deletes: 0,
			errors: 0,
			avgLatency: 0,
			totalLatency: 0,
			slowQueries: 0,
			totalOperations: 0,
		};
	}

	/**
	 * Update metrics counters
	 */
	private updateMetrics(
		operationType: "query" | "insert" | "update" | "delete" | "other",
		latency: number,
		error?: boolean,
	): void {
		if (!this.enableMetrics) return;

		this.metrics.totalOperations++;
		this.metrics.totalLatency += latency;
		this.metrics.avgLatency = this.metrics.totalLatency / this.metrics.totalOperations;

		if (latency > this.slowQueryThreshold) {
			this.metrics.slowQueries++;
		}

		if (error) {
			this.metrics.errors++;
		}

		switch (operationType) {
			case "query":
				this.metrics.queries++;
				break;
			case "insert":
				this.metrics.inserts++;
				break;
			case "update":
				this.metrics.updates++;
				break;
			case "delete":
				this.metrics.deletes++;
				break;
		}
	}

	/**
	 * Emit a query event to all listeners
	 */
	private emitEvent(event: QueryEvent): void {
		const listeners = this.eventListeners.get(event.type);
		if (listeners) {
			for (const listener of listeners) {
				try {
					listener(event);
				} catch (e) {
					// Don't let listener errors affect query execution
					console.error("Database event listener error:", e);
				}
			}
		}
	}

	/**
	 * Subscribe to query events
	 */
	on(eventType: QueryEventType, listener: QueryEventListener): void {
		if (!this.eventListeners.has(eventType)) {
			this.eventListeners.set(eventType, new Set());
		}
		this.eventListeners.get(eventType)?.add(listener);
	}

	/**
	 * Unsubscribe from query events
	 */
	off(eventType: QueryEventType, listener: QueryEventListener): void {
		this.eventListeners.get(eventType)?.delete(listener);
	}

	/**
	 * Remove all event listeners
	 */
	removeAllListeners(eventType?: QueryEventType): void {
		if (eventType) {
			this.eventListeners.delete(eventType);
		} else {
			this.eventListeners.clear();
		}
	}

	/**
	 * Get the driver type
	 */
	getDriver(): DatabaseDriver {
		return this.driver;
	}

	/**
	 * Connect to the database using Bun.SQL
	 */
	async connect(): Promise<void> {
		if (this._isConnected) return;

		try {
			// Import Bun's native SQL
			const { SQL } = await import("bun");

			const options: Record<string, unknown> = {};

			// Set adapter explicitly if needed
			if (this.driver === "sqlite") {
				options.adapter = "sqlite";
				// Handle file paths
				if (
					!this.config.url.startsWith("sqlite://") &&
					!this.config.url.startsWith("file:") &&
					this.config.url !== ":memory:"
				) {
					options.filename = this.config.url;
				}
			}

			// Pool configuration
			if (this.config.pool) {
				if (this.config.pool.max) options.max = this.config.pool.max;
				if (this.config.pool.idleTimeout)
					options.idleTimeout = this.config.pool.idleTimeout;
				if (this.config.pool.maxLifetime)
					options.maxLifetime = this.config.pool.maxLifetime;
				if (this.config.pool.connectionTimeout)
					options.connectionTimeout = this.config.pool.connectionTimeout;
			}

			// TLS configuration
			if (this.config.tls !== undefined) {
				options.tls = this.config.tls;
			}

			// BigInt support
			if (this.config.bigint !== undefined) {
				options.bigint = this.config.bigint;
			}

			// Prepared statements
			if (this.config.prepare !== undefined) {
				options.prepare = this.config.prepare;
			}

			// Create connection
			if (
				Object.keys(options).length > 0 &&
				!this.config.url.startsWith("sqlite://")
			) {
				this.sql = new SQL(this.config.url, options);
			} else {
				this.sql = new SQL(this.config.url);
			}

			this._isConnected = true;
		} catch (error) {
			throw new Error(
				`Failed to connect to database: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Check if connected
	 */
	get isConnected(): boolean {
		return this._isConnected;
	}

	/**
	 * Get the underlying Bun.SQL instance
	 */
	getSql(): unknown {
		return this.sql;
	}

	/**
	 * Execute a raw SQL query using tagged template literal
	 */
	async query<T = unknown>(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<T[]> {
		this.ensureConnection();

		const sql = strings.join("?");
		const operationType = detectOperationType(sql);
		const startTime = this.getTimestamp();

		// Emit query:start event
		this.emitEvent({
			type: "query:start",
			sql,
			params: values,
			operationType,
		});

		try {
			const sqlFn = this.sql as (
				strings: TemplateStringsArray,
				...values: unknown[]
			) => Promise<T[]>;

			const results = await sqlFn(strings, ...values);
			const latency = this.getTimestamp() - startTime;

			// Update metrics
			this.updateMetrics(operationType, latency, false);

			// Emit query:end event
			this.emitEvent({
				type: "query:end",
				sql,
				params: values,
				latency,
				operationType,
			});

			return results;
		} catch (error) {
			const latency = this.getTimestamp() - startTime;

			// Update metrics with error
			this.updateMetrics(operationType, latency, true);

			// Emit query:error event
			this.emitEvent({
				type: "query:error",
				sql,
				params: values,
				latency,
				error: error instanceof Error ? error : new Error(String(error)),
				operationType,
			});

			throw error;
		}
	}

	/**
	 * Execute a query and return a single row
	 */
	async queryOne<T = unknown>(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<T | null> {
		const results = await this.query<T>(strings, ...values);
		return results.length > 0 ? results[0] : null;
	}

	/**
	 * Execute a query that doesn't return rows
	 */
	async execute(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<QueryResult> {
		this.ensureConnection();

		const sql = strings.join("?");
		const operationType = detectOperationType(sql);
		const startTime = this.getTimestamp();

		// Emit query:start event
		this.emitEvent({
			type: "query:start",
			sql,
			params: values,
			operationType,
		});

		try {
			const sqlFn = this.sql as (
				strings: TemplateStringsArray,
				...values: unknown[]
			) => Promise<unknown[]>;

			// For INSERT with RETURNING
			const results = await sqlFn(strings, ...values);
			const latency = this.getTimestamp() - startTime;

			// Update metrics
			this.updateMetrics(operationType, latency, false);

			// Emit query:end event
			this.emitEvent({
				type: "query:end",
				sql,
				params: values,
				latency,
				operationType,
			});

			return {
				rows: results,
				rowCount: results.length,
			};
		} catch (error) {
			const latency = this.getTimestamp() - startTime;

			// Update metrics with error
			this.updateMetrics(operationType, latency, true);

			// Emit query:error event
			this.emitEvent({
				type: "query:error",
				sql,
				params: values,
				latency,
				error: error instanceof Error ? error : new Error(String(error)),
				operationType,
			});

			throw error;
		}
	}

	/**
	 * Execute raw SQL string (unsafe)
	 */
	async raw<T = unknown>(
		sqlString: string,
		params: unknown[] = [],
	): Promise<T[]> {
		this.ensureConnection();

		const operationType = detectOperationType(sqlString);
		const startTime = this.getTimestamp();

		// Emit query:start event
		this.emitEvent({
			type: "query:start",
			sql: sqlString,
			params,
			operationType,
		});

		try {
			const sql = this.sql as {
				unsafe: (query: string, params?: unknown[]) => Promise<T[]>;
			};

			let results: T[];

			if (sql.unsafe) {
				// For SQLite, convert $1, $2 to ? placeholders
				if (this.driver === "sqlite") {
					let query = sqlString;
					let i = 1;
					while (query.includes(`$${i}`)) {
						query = query.replace(`$${i}`, "?");
						i++;
					}
					results = await sql.unsafe(query, params);
				} else {
					results = await sql.unsafe(sqlString, params);
				}
			} else {
				throw new Error("Raw SQL not supported");
			}

			const latency = this.getTimestamp() - startTime;

			// Update metrics
			this.updateMetrics(operationType, latency, false);

			// Emit query:end event
			this.emitEvent({
				type: "query:end",
				sql: sqlString,
				params,
				latency,
				operationType,
			});

			return results;
		} catch (error) {
			const latency = this.getTimestamp() - startTime;

			// Update metrics with error
			this.updateMetrics(operationType, latency, true);

			// Emit query:error event
			this.emitEvent({
				type: "query:error",
				sql: sqlString,
				params,
				latency,
				error: error instanceof Error ? error : new Error(String(error)),
				operationType,
			});

			throw error;
		}
	}

	/**
	 * Execute a transaction
	 */
	async transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
		this.ensureConnection();

		const sql = this.sql as {
			begin: <R>(fn: (tx: unknown) => Promise<R>) => Promise<R>;
		};

		return sql.begin(async (tx) => {
			const txWrapper: Transaction = {
				query: async <T>(
					strings: TemplateStringsArray,
					...values: unknown[]
				): Promise<T[]> => {
					const t = tx as (
						strings: TemplateStringsArray,
						...values: unknown[]
					) => Promise<T[]>;
					return t(strings, ...values);
				},
				queryOne: async <T>(
					strings: TemplateStringsArray,
					...values: unknown[]
				): Promise<T | null> => {
					const results = await txWrapper.query<T>(strings, ...values);
					return results.length > 0 ? results[0] : null;
				},
				execute: async (
					strings: TemplateStringsArray,
					...values: unknown[]
				): Promise<QueryResult> => {
					const t = tx as (
						strings: TemplateStringsArray,
						...values: unknown[]
					) => Promise<unknown[]>;
					const results = await t(strings, ...values);
					return { rows: results, rowCount: results.length };
				},
			};

			return callback(txWrapper);
		});
	}

	/**
	 * Begin a distributed transaction (2PC)
	 */
	async beginDistributed<T>(
		name: string,
		callback: (tx: Transaction) => Promise<T>,
	): Promise<T> {
		this.ensureConnection();

		const sql = this.sql as {
			beginDistributed: <R>(
				name: string,
				fn: (tx: unknown) => Promise<R>,
			) => Promise<R>;
		};

		if (!sql.beginDistributed) {
			throw new Error(
				"Distributed transactions not supported for this database",
			);
		}

		return sql.beginDistributed(name, async (tx) => {
			const txWrapper: Transaction = {
				query: async <T>(
					strings: TemplateStringsArray,
					...values: unknown[]
				): Promise<T[]> => {
					const t = tx as (
						strings: TemplateStringsArray,
						...values: unknown[]
					) => Promise<T[]>;
					return t(strings, ...values);
				},
				queryOne: async <T>(
					strings: TemplateStringsArray,
					...values: unknown[]
				): Promise<T | null> => {
					const results = await txWrapper.query<T>(strings, ...values);
					return results.length > 0 ? results[0] : null;
				},
				execute: async (
					strings: TemplateStringsArray,
					...values: unknown[]
				): Promise<QueryResult> => {
					const t = tx as (
						strings: TemplateStringsArray,
						...values: unknown[]
					) => Promise<unknown[]>;
					const results = await t(strings, ...values);
					return { rows: results, rowCount: results.length };
				},
			};

			return callback(txWrapper);
		});
	}

	/**
	 * Commit a distributed transaction
	 */
	async commitDistributed(name: string): Promise<void> {
		const sql = this.sql as {
			commitDistributed: (name: string) => Promise<void>;
		};

		if (sql.commitDistributed) {
			await sql.commitDistributed(name);
		}
	}

	/**
	 * Rollback a distributed transaction
	 */
	async rollbackDistributed(name: string): Promise<void> {
		const sql = this.sql as {
			rollbackDistributed: (name: string) => Promise<void>;
		};

		if (sql.rollbackDistributed) {
			await sql.rollbackDistributed(name);
		}
	}

	/**
	 * Reserve a connection from the pool
	 */
	async reserve(): Promise<ReservedConnection> {
		this.ensureConnection();

		const sql = this.sql as {
			reserve: () => Promise<unknown>;
		};

		if (!sql.reserve) {
			throw new Error("Connection reservation not supported");
		}

		const reserved = await sql.reserve();
		return new ReservedConnection(reserved);
	}

	/**
	 * Close the connection
	 */
	async close(options?: { timeout?: number }): Promise<void> {
		if (!this._isConnected) return;

		const sql = this.sql as {
			close: (options?: { timeout?: number }) => Promise<void>;
		};

		if (sql.close) {
			await sql.close(options);
		}

		this.sql = null;
		this._isConnected = false;
	}

	/**
	 * Get values format
	 */
	async values(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<unknown[][]> {
		this.ensureConnection();

		const sql = this.sql as (
			strings: TemplateStringsArray,
			...values: unknown[]
		) => { values: () => Promise<unknown[][]> };

		return sql(strings, ...values).values();
	}

	/**
	 * Get raw format (Buffer arrays)
	 */
	async rawFormat(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<Buffer[][]> {
		this.ensureConnection();

		const sql = this.sql as (
			strings: TemplateStringsArray,
			...values: unknown[]
		) => { raw: () => Promise<Buffer[][]> };

		return sql(strings, ...values).raw();
	}

	/**
	 * Execute a simple query (multiple statements allowed)
	 */
	async simple(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<unknown[]> {
		this.ensureConnection();

		const sql = this.sql as (
			strings: TemplateStringsArray,
			...values: unknown[]
		) => { simple: () => Promise<unknown[]> };

		return sql(strings, ...values).simple();
	}

	/**
	 * Execute SQL from a file
	 */
	async file(path: string, params: unknown[] = []): Promise<unknown[]> {
		this.ensureConnection();

		const sql = this.sql as {
			file: (path: string, params?: unknown[]) => Promise<unknown[]>;
		};

		if (sql.file) {
			return sql.file(path, params);
		}

		throw new Error("File execution not supported");
	}

	/**
	 * Ensure connection is established
	 */
	private ensureConnection(): void {
		if (!this._isConnected || !this.sql) {
			throw new Error("Database not connected. Call connect() first.");
		}
	}
}

// ============= Reserved Connection =============

export class ReservedConnection {
	private connection: unknown;

	constructor(connection: unknown) {
		this.connection = connection;
	}

	async query<T>(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<T[]> {
		const conn = this.connection as (
			strings: TemplateStringsArray,
			...values: unknown[]
		) => Promise<T[]>;
		return conn(strings, ...values);
	}

	async queryOne<T>(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<T | null> {
		const results = await this.query<T>(strings, ...values);
		return results.length > 0 ? results[0] : null;
	}

	release(): void {
		const conn = this.connection as { release: () => void };
		if (conn.release) {
			conn.release();
		}
	}

	[Symbol.dispose](): void {
		this.release();
	}
}

// ============= Connection Factory =============

/**
 * Create a database connection
 */
export async function createConnection(
	config: DatabaseConfig | string,
): Promise<Database> {
	const db = new Database(config);
	await db.connect();
	return db;
}

// ============= Query Builder =============

/**
 * Simple query builder for common operations
 */
export class QueryBuilder<T = unknown> {
	private db: Database;
	private tableName: string;

	constructor(db: Database, tableName: string) {
		this.db = db;
		this.tableName = tableName;
	}

	/**
	 * Select all rows
	 */
	async all(): Promise<T[]> {
		return this.db.raw<T>(`SELECT * FROM ${this.tableName}`);
	}

	/**
	 * Find by ID
	 */
	async findById(id: number | string): Promise<T | null> {
		const results = await this.db.raw<T>(
			`SELECT * FROM ${this.tableName} WHERE id = $1`,
			[id],
		);
		return results.length > 0 ? results[0] : null;
	}

	/**
	 * Find by field
	 */
	async findBy(field: string, value: unknown): Promise<T[]> {
		// Note: Field name needs to be safely inserted
		const sql = `SELECT * FROM ${this.tableName} WHERE ${field} = $1`;
		return this.db.raw<T>(sql, [value]);
	}

	/**
	 * Find one by field
	 */
	async findOneBy(field: string, value: unknown): Promise<T | null> {
		const results = await this.findBy(field, value);
		return results.length > 0 ? results[0] : null;
	}

	/**
	 * Insert a row
	 */
	async insert(data: Partial<T>): Promise<T> {
		const keys = Object.keys(data);
		const values = Object.values(data);

		const columns = keys.join(", ");
		const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");

		const result = await this.db.raw<T>(
			`INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) RETURNING *`,
			values,
		);

		return result[0];
	}

	/**
	 * Bulk insert
	 */
	async insertMany(items: Partial<T>[]): Promise<T[]> {
		if (items.length === 0) return [];

		const results: T[] = [];

		for (const item of items) {
			const result = await this.insert(item);
			results.push(result);
		}

		return results;
	}

	/**
	 * Update by ID
	 */
	async updateById(id: number | string, data: Partial<T>): Promise<T | null> {
		const keys = Object.keys(data);
		const values = Object.values(data);

		const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");

		const result = await this.db.raw<T>(
			`UPDATE ${this.tableName} SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
			[...values, id],
		);

		return result.length > 0 ? result[0] : null;
	}

	/**
	 * Delete by ID
	 */
	async deleteById(id: number | string): Promise<boolean> {
		const result = await this.db.raw(
			`DELETE FROM ${this.tableName} WHERE id = $1 RETURNING id`,
			[id],
		);
		return result.length > 0;
	}

	/**
	 * Count rows
	 */
	async count(where?: string, params: unknown[] = []): Promise<number> {
		const sql = where
			? `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${where}`
			: `SELECT COUNT(*) as count FROM ${this.tableName}`;

		const result = await this.db.raw<{ count: number | string }>(sql, params);
		return Number(result[0]?.count ?? 0);
	}

	/**
	 * Check if exists
	 */
	async exists(where: string, params: unknown[] = []): Promise<boolean> {
		const count = await this.count(where, params);
		return count > 0;
	}

	/**
	 * Paginate results
	 */
	async paginate(
		page: number,
		limit: number,
		where?: string,
		params: unknown[] = [],
	): Promise<{
		data: T[];
		total: number;
		page: number;
		limit: number;
		totalPages: number;
	}> {
		const offset = (page - 1) * limit;

		const whereClause = where ? `WHERE ${where}` : "";

		const [data, countResult] = await Promise.all([
			this.db.raw<T>(
				`SELECT * FROM ${this.tableName} ${whereClause} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
				[...params, limit, offset],
			),
			this.db.raw<{ count: number | string }>(
				`SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`,
				params,
			),
		]);

		const total = Number(countResult[0]?.count ?? 0);

		return {
			data,
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		};
	}
}

/**
 * Create a query builder for a table
 */
export function table<T = unknown>(
	db: Database,
	tableName: string,
): QueryBuilder<T> {
	return new QueryBuilder<T>(db, tableName);
}

// ============= SQL Helpers =============

/**
 * Create a SQL fragment for safe table/column names
 */
export function sqlFragment(name: string): string {
	// Escape identifiers
	return name.replace(/"/g, '""');
}

/**
 * Build an IN clause
 */
export function buildInClause(values: unknown[]): {
	placeholder: string;
	params: unknown[];
} {
	const placeholders = values.map(() => "?").join(", ");
	return {
		placeholder: `(${placeholders})`,
		params: values,
	};
}

// Re-export schema and migrations
export * from "./schema";
export * from "./migrations";