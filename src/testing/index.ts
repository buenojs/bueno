/**
 * Testing Utilities
 *
 * Helper functions for testing Bueno applications with bun:test.
 * Provides request/response testing utilities, mocking, and fixtures.
 */

import { Context } from "../context";
import type { Middleware } from "../middleware";
import type { Router } from "../router";

// ============= Types =============

export interface TestRequestOptions {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
	headers?: Record<string, string>;
	query?: Record<string, string>;
	body?: unknown;
	cookies?: Record<string, string>;
}

export interface TestResponse {
	status: number;
	headers: Headers;
	body: unknown;
	text: string;
	json: () => Promise<unknown>;
}

export interface TestContext {
	request: Request;
	response: Response | null;
	context: Context | null;
}

// ============= Test Request Builder =============

/**
 * Create a test request
 */
export function createTestRequest(
	path: string,
	options: TestRequestOptions = {},
): Request {
	const {
		method = "GET",
		headers = {},
		query = {},
		body,
		cookies = {},
	} = options;

	// Build URL with query params
	const url = new URL(`http://localhost${path}`);
	for (const [key, value] of Object.entries(query)) {
		url.searchParams.set(key, value);
	}

	// Build headers
	const requestHeaders = new Headers(headers);

	// Add cookies
	if (Object.keys(cookies).length > 0) {
		const cookieString = Object.entries(cookies)
			.map(([k, v]) => `${k}=${v}`)
			.join("; ");
		requestHeaders.set("Cookie", cookieString);
	}

	// Build body
	let requestBody:
		| string
		| ArrayBuffer
		| FormData
		| URLSearchParams
		| undefined;
	if (body !== undefined) {
		if (typeof body === "string") {
			requestBody = body;
			if (!requestHeaders.has("Content-Type")) {
				requestHeaders.set("Content-Type", "text/plain");
			}
		} else if (body instanceof FormData) {
			requestBody = body;
		} else if (body instanceof URLSearchParams) {
			requestBody = body;
			if (!requestHeaders.has("Content-Type")) {
				requestHeaders.set("Content-Type", "application/x-www-form-urlencoded");
			}
		} else {
			requestBody = JSON.stringify(body);
			if (!requestHeaders.has("Content-Type")) {
				requestHeaders.set("Content-Type", "application/json");
			}
		}
	}

	return new Request(url.toString(), {
		method,
		headers: requestHeaders,
		body: requestBody,
	});
}

// ============= Test Response Helpers =============

/**
 * Create a test response wrapper
 */
export async function createTestResponse(
	response: Response,
): Promise<TestResponse> {
	const clone = response.clone();
	let body: unknown = null;

	try {
		const contentType = response.headers.get("Content-Type") || "";
		if (contentType.includes("application/json")) {
			body = await response.json();
		} else {
			body = await response.text();
		}
	} catch {
		body = null;
	}

	return {
		status: response.status,
		headers: response.headers,
		body,
		text: await clone.text(),
		json: async () => response.json(),
	};
}

// ============= App Tester =============

export class AppTester {
	private router: Router;

	constructor(router: Router) {
		this.router = router;
	}

	/**
	 * Make a test request to the app
	 */
	async request(
		path: string,
		options?: TestRequestOptions,
	): Promise<TestResponse> {
		const request = createTestRequest(path, options);
		const url = new URL(request.url);

		const match = this.router.match(request.method as "GET", url.pathname);

		if (!match) {
			return createTestResponse(new Response("Not Found", { status: 404 }));
		}

		const context = new Context(request, match.params);

		// Handle middleware
		if (match.middleware && match.middleware.length > 0) {
			const { compose } = await import("../middleware");
			const pipeline = compose(match.middleware as Middleware[]);
			const response = await pipeline(
				context,
				async () => match.handler(context) as Response,
			);
			return createTestResponse(response);
		}

		const response = await match.handler(context);
		return createTestResponse(response as Response);
	}

	/**
	 * GET request helper
	 */
	async get(
		path: string,
		options?: Omit<TestRequestOptions, "method" | "body">,
	): Promise<TestResponse> {
		return this.request(path, { ...options, method: "GET" });
	}

	/**
	 * POST request helper
	 */
	async post(
		path: string,
		body?: unknown,
		options?: Omit<TestRequestOptions, "method" | "body">,
	): Promise<TestResponse> {
		return this.request(path, { ...options, method: "POST", body });
	}

	/**
	 * PUT request helper
	 */
	async put(
		path: string,
		body?: unknown,
		options?: Omit<TestRequestOptions, "method" | "body">,
	): Promise<TestResponse> {
		return this.request(path, { ...options, method: "PUT", body });
	}

	/**
	 * PATCH request helper
	 */
	async patch(
		path: string,
		body?: unknown,
		options?: Omit<TestRequestOptions, "method" | "body">,
	): Promise<TestResponse> {
		return this.request(path, { ...options, method: "PATCH", body });
	}

	/**
	 * DELETE request helper
	 */
	async delete(
		path: string,
		options?: Omit<TestRequestOptions, "method">,
	): Promise<TestResponse> {
		return this.request(path, { ...options, method: "DELETE" });
	}
}

/**
 * Create an app tester
 */
export function createTester(router: Router): AppTester {
	return new AppTester(router);
}

// ============= Mock Helpers =============

/**
 * Create a mock context for testing handlers directly
 */
export function createMockContext(
	path: string,
	options: TestRequestOptions = {},
): Context {
	const request = createTestRequest(path, options);
	return new Context(request, {});
}

/**
 * Create a mock context with params
 */
export function createMockContextWithParams(
	path: string,
	params: Record<string, string>,
	options: TestRequestOptions = {},
): Context {
	const request = createTestRequest(path, options);
	return new Context(request, params);
}

// ============= Assertion Helpers =============

/**
 * Assert response status
 */
export function assertStatus(response: TestResponse, expected: number): void {
	if (response.status !== expected) {
		throw new Error(`Expected status ${expected}, got ${response.status}`);
	}
}

/**
 * Assert response is OK (2xx)
 */
export function assertOK(response: TestResponse): void {
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`Expected OK status, got ${response.status}`);
	}
}

/**
 * Assert response is JSON
 */
export function assertJSON(response: TestResponse): void {
	const contentType = response.headers.get("Content-Type");
	if (!contentType?.includes("application/json")) {
		throw new Error(`Expected JSON response, got ${contentType}`);
	}
}

/**
 * Assert response body
 */
export function assertBody(response: TestResponse, expected: unknown): void {
	if (JSON.stringify(response.body) !== JSON.stringify(expected)) {
		throw new Error(
			`Expected body ${JSON.stringify(expected)}, got ${JSON.stringify(response.body)}`,
		);
	}
}

/**
 * Assert response has header
 */
export function assertHeader(
	response: TestResponse,
	name: string,
	value?: string,
): void {
	const headerValue = response.headers.get(name);
	if (!headerValue) {
		throw new Error(`Expected header ${name} to be present`);
	}
	if (value && headerValue !== value) {
		throw new Error(
			`Expected header ${name} to be ${value}, got ${headerValue}`,
		);
	}
}

/**
 * Assert redirect
 */
export function assertRedirect(
	response: TestResponse,
	location?: string,
): void {
	if (response.status < 300 || response.status >= 400) {
		throw new Error(`Expected redirect status, got ${response.status}`);
	}
	if (location) {
		assertHeader(response, "Location", location);
	}
}

// ============= Snapshot Helpers =============

/**
 * Create a snapshot of response for testing
 */
export function snapshotResponse(response: TestResponse): object {
	return {
		status: response.status,
		headers: Object.fromEntries(response.headers.entries()),
		body: response.body,
	};
}

// ============= Fixture Factory =============

/**
 * Create a test fixture factory
 */
export class FixtureFactory {
	private sequences: Map<string, number> = new Map();

	/**
	 * Generate a unique ID
	 */
	id(prefix = "test"): string {
		const seq = (this.sequences.get(prefix) ?? 0) + 1;
		this.sequences.set(prefix, seq);
		return `${prefix}_${seq}`;
	}

	/**
	 * Generate a unique email
	 */
	email(domain = "test.com"): string {
		return `${this.id("email")}@${domain}`;
	}

	/**
	 * Generate a unique UUID
	 */
	uuid(): string {
		return crypto.randomUUID();
	}

	/**
	 * Reset all sequences
	 */
	reset(): void {
		this.sequences.clear();
	}
}

export function createFixtureFactory(): FixtureFactory {
	return new FixtureFactory();
}

// ============= Wait/Timeout Helpers =============

/**
 * Wait for a condition to be true
 */
export async function waitFor(
	condition: () => boolean | Promise<boolean>,
	timeout = 5000,
	interval = 50,
): Promise<void> {
	const start = Date.now();

	while (Date.now() - start < timeout) {
		if (await condition()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, interval));
	}

	throw new Error("Timeout waiting for condition");
}

/**
 * Sleep for a duration
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============= Test Cache =============

/**
 * Cache operation record for testing
 */
export interface CacheOperation {
	type: "get" | "set" | "delete" | "has" | "clear";
	key?: string;
	value?: unknown;
	timestamp: number;
}

/**
 * Cache statistics for testing
 */
export interface CacheStats {
	hits: number;
	misses: number;
	sets: number;
	deletes: number;
	keyCount: number;
}

/**
 * TestCache - A cache implementation specifically for testing purposes.
 * Wraps an in-memory cache with operation tracking and test utilities.
 */
export class TestCache {
	private store = new Map<string, unknown>();
	private _operations: CacheOperation[] = [];
	private _stats = {
		hits: 0,
		misses: 0,
		sets: 0,
		deletes: 0,
	};

	/**
	 * Get the list of all operations performed on this cache
	 */
	get operations(): ReadonlyArray<CacheOperation> {
		return this._operations;
	}

	/**
	 * Get a value from the cache
	 */
	async get<T = unknown>(key: string): Promise<T | null> {
		const value = this.store.get(key);
		this._operations.push({
			type: "get",
			key,
			value: value ?? null,
			timestamp: Date.now(),
		});

		if (value !== undefined) {
			this._stats.hits++;
			return value as T;
		}

		this._stats.misses++;
		return null;
	}

	/**
	 * Set a value in the cache
	 */
	async set<T>(key: string, value: T): Promise<void> {
		this.store.set(key, value);
		this._stats.sets++;
		this._operations.push({
			type: "set",
			key,
			value,
			timestamp: Date.now(),
		});
	}

	/**
	 * Delete a value from the cache
	 */
	async delete(key: string): Promise<boolean> {
		const existed = this.store.delete(key);
		this._stats.deletes++;
		this._operations.push({
			type: "delete",
			key,
			timestamp: Date.now(),
		});
		return existed;
	}

	/**
	 * Check if a key exists in the cache
	 */
	async has(key: string): Promise<boolean> {
		const exists = this.store.has(key);
		this._operations.push({
			type: "has",
			key,
			value: exists,
			timestamp: Date.now(),
		});
		return exists;
	}

	/**
	 * Clear all keys from the cache
	 */
	async clearAll(): Promise<void> {
		this.store.clear();
		this._operations.push({
			type: "clear",
			timestamp: Date.now(),
		});
	}

	/**
	 * Get cache statistics
	 */
	getStats(): CacheStats {
		return {
			...this._stats,
			keyCount: this.store.size,
		};
	}

	/**
	 * Get all keys in the cache
	 */
	getKeys(): string[] {
		return Array.from(this.store.keys());
	}

	/**
	 * Get all key-value pairs in the cache
	 */
	getEntries(): [string, unknown][] {
		return Array.from(this.store.entries());
	}

	/**
	 * Set multiple entries at once
	 */
	async setMany(entries: Record<string, unknown>): Promise<void> {
		for (const [key, value] of Object.entries(entries)) {
			await this.set(key, value);
		}
	}

	/**
	 * Get a value without affecting hit/miss statistics
	 */
	peek<T = unknown>(key: string): T | null {
		const value = this.store.get(key);
		return value !== undefined ? (value as T) : null;
	}

	/**
	 * Reset the cache completely - clear all data, stats, and operations
	 */
	reset(): void {
		this.store.clear();
		this._operations = [];
		this._stats = {
			hits: 0,
			misses: 0,
			sets: 0,
			deletes: 0,
		};
	}
}

/**
 * Create a new TestCache instance, optionally with initial data
 */
export async function createTestCache(initialData?: Record<string, unknown>): Promise<TestCache> {
	const cache = new TestCache();
	if (initialData) {
		await cache.setMany(initialData);
	}
	return cache;
}

// ============= Cache Assertions =============

/**
 * Assert that a key exists in the cache
 */
export function assertCacheHas(cache: TestCache, key: string): void {
	const keys = cache.getKeys();
	if (!keys.includes(key)) {
		throw new Error(
			`Expected cache to have key "${key}". Available keys: [${keys.join(", ")}]`,
		);
	}
}

/**
 * Assert that a key does not exist in the cache
 */
export function assertCacheNotHas(cache: TestCache, key: string): void {
	const keys = cache.getKeys();
	if (keys.includes(key)) {
		throw new Error(`Expected cache to NOT have key "${key}"`);
	}
}

/**
 * Assert a cached value matches expected
 */
export function assertCacheValue<T = unknown>(
	cache: TestCache,
	key: string,
	expected: T,
): void {
	const value = cache.peek<T>(key);
	if (value === null) {
		throw new Error(`Expected cache to have key "${key}"`);
	}
	if (JSON.stringify(value) !== JSON.stringify(expected)) {
		throw new Error(
			`Expected cache value for "${key}" to be ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
		);
	}
}

/**
 * Assert cache statistics match expected values
 */
export function assertCacheStats(
	cache: TestCache,
	expected: Partial<CacheStats>,
): void {
	const stats = cache.getStats();

	for (const [key, value] of Object.entries(expected)) {
		const actualValue = stats[key as keyof CacheStats];
		if (actualValue !== value) {
			throw new Error(
				`Expected cache stat "${key}" to be ${value}, got ${actualValue}`,
			);
		}
	}
}

// ============= Test Database =============

/**
 * Schema definition for test database
 */
export interface TestDatabaseSchema {
	[table: string]: {
		[column: string]: string; // Column definition, e.g., "INTEGER PRIMARY KEY"
	};
}

/**
 * Seed data for test database
 */
export interface TestDatabaseSeed {
	[table: string]: Record<string, unknown>[];
}

/**
 * Options for creating a test database
 */
export interface TestDatabaseOptions {
	schema?: TestDatabaseSchema;
	seed?: TestDatabaseSeed;
}

/**
 * Database operation record for testing
 */
export interface DatabaseOperation {
	type: "query" | "execute" | "transaction";
	sql: string;
	params?: unknown[];
	timestamp: number;
}

/**
 * TestDatabase - An in-memory SQLite database for testing purposes.
 * Provides operation tracking, transaction support, and test utilities.
 */
export class TestDatabase {
	private sql: unknown = null;
	private _operations: DatabaseOperation[] = [];
	private _isConnected = false;
	private _schema: TestDatabaseSchema = {};

	/**
	 * Get the list of all operations performed on this database
	 */
	get operations(): ReadonlyArray<DatabaseOperation> {
		return this._operations;
	}

	/**
	 * Connect to the in-memory SQLite database
	 */
	async connect(): Promise<void> {
		if (this._isConnected) return;

		try {
			const { SQL } = await import("bun");
			this.sql = new SQL(":memory:", { adapter: "sqlite" });
			this._isConnected = true;
		} catch (error) {
			throw new Error(
				`Failed to connect to test database: ${error instanceof Error ? error.message : String(error)}`,
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
	 * Execute a SQL query and return results
	 */
	async query<T = unknown>(sqlString: string, params: unknown[] = []): Promise<T[]> {
		this.ensureConnection();

		this._operations.push({
			type: "query",
			sql: sqlString,
			params,
			timestamp: Date.now(),
		});

		const sql = this.sql as {
			unsafe: (query: string, params?: unknown[]) => Promise<T[]>;
		};

		return sql.unsafe(sqlString, params);
	}

	/**
	 * Execute a query and return a single row
	 */
	async queryOne<T = unknown>(sqlString: string, params: unknown[] = []): Promise<T | null> {
		const results = await this.query<T>(sqlString, params);
		return results.length > 0 ? results[0] : null;
	}

	/**
	 * Execute a statement (INSERT, UPDATE, DELETE)
	 */
	async execute(sqlString: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number; insertId?: number | string }> {
		this.ensureConnection();

		this._operations.push({
			type: "execute",
			sql: sqlString,
			params,
			timestamp: Date.now(),
		});

		const sql = this.sql as {
			unsafe: (query: string, params?: unknown[]) => Promise<unknown[]>;
		};

		const results = await sql.unsafe(sqlString, params);

		// For SQLite, try to get the last insert ID
		const lastIdResult = await sql.unsafe("SELECT last_insert_rowid() as id");
		const insertId = lastIdResult[0] as { id: number | string } | undefined;

		return {
			rows: results,
			rowCount: results.length,
			insertId: insertId?.id,
		};
	}

	/**
	 * Run operations in a transaction
	 */
	async transaction<T>(callback: (db: TestDatabase) => Promise<T>): Promise<T> {
		this.ensureConnection();

		this._operations.push({
			type: "transaction",
			sql: "BEGIN TRANSACTION",
			timestamp: Date.now(),
		});

		const sql = this.sql as {
			unsafe: (query: string, params?: unknown[]) => Promise<unknown[]>;
		};

		try {
			await sql.unsafe("BEGIN TRANSACTION");
			const result = await callback(this);
			await sql.unsafe("COMMIT");
			return result;
		} catch (error) {
			await sql.unsafe("ROLLBACK");
			throw error;
		}
	}

	/**
	 * Rollback all changes (useful between tests when using savepoints)
	 */
	async rollback(): Promise<void> {
		this.ensureConnection();

		const sql = this.sql as {
			unsafe: (query: string) => Promise<unknown[]>;
		};

		await sql.unsafe("ROLLBACK");
	}

	/**
	 * Close the database connection
	 */
	async close(): Promise<void> {
		if (!this._isConnected) return;

		const sql = this.sql as {
			close: () => Promise<void>;
		};

		if (sql.close) {
			await sql.close();
		}

		this.sql = null;
		this._isConnected = false;
	}

	/**
	 * Get all tables in the database
	 */
	async getTables(): Promise<string[]> {
		const result = await this.query<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
		);
		return result.map((row) => row.name);
	}

	/**
	 * Seed database with initial data
	 */
	async seed(tables: TestDatabaseSeed): Promise<void> {
		for (const [table, rows] of Object.entries(tables)) {
			for (const row of rows) {
				const keys = Object.keys(row);
				const values = Object.values(row);
				const placeholders = values.map(() => "?").join(", ");
				const columns = keys.join(", ");

				await this.execute(
					`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
					values,
				);
			}
		}
	}

	/**
	 * Drop all tables and reset state
	 */
	async reset(): Promise<void> {
		const tables = await this.getTables();

		for (const table of tables) {
			await this.execute(`DROP TABLE IF EXISTS ${table}`);
		}

		this._operations = [];
		this._schema = {};
	}

	/**
	 * Create a table from column definitions
	 */
	async createTable(name: string, columns: Record<string, string>): Promise<void> {
		const columnDefs = Object.entries(columns)
			.map(([colName, def]) => `${colName} ${def}`)
			.join(", ");

		await this.execute(`CREATE TABLE ${name} (${columnDefs})`);
		this._schema[name] = columns;
	}

	/**
	 * Drop a table
	 */
	async dropTable(name: string): Promise<void> {
		await this.execute(`DROP TABLE IF EXISTS ${name}`);
		delete this._schema[name];
	}

	/**
	 * Clear all rows from a table (truncate)
	 */
	async truncate(name: string): Promise<void> {
		await this.execute(`DELETE FROM ${name}`);
	}

	/**
	 * Get the current schema
	 */
	getSchema(): TestDatabaseSchema {
		return { ...this._schema };
	}

	/**
	 * Get table info
	 */
	async getTableInfo(table: string): Promise<{ cid: number; name: string; type: string; notnull: number; dflt_value: unknown; pk: number }[]> {
		return this.query(`PRAGMA table_info(${table})`);
	}

	/**
	 * Count rows in a table
	 */
	async count(table: string, where?: string, params: unknown[] = []): Promise<number> {
		const sql = where
			? `SELECT COUNT(*) as count FROM ${table} WHERE ${where}`
			: `SELECT COUNT(*) as count FROM ${table}`;

		const result = await this.queryOne<{ count: number | string }>(sql, params);
		return Number(result?.count ?? 0);
	}

	/**
	 * Check if a row exists
	 */
	async exists(table: string, where: string, params: unknown[] = []): Promise<boolean> {
		const count = await this.count(table, where, params);
		return count > 0;
	}

	/**
	 * Clear operation history
	 */
	clearOperations(): void {
		this._operations = [];
	}

	/**
	 * Ensure connection is established
	 */
	private ensureConnection(): void {
		if (!this._isConnected || !this.sql) {
			throw new Error("TestDatabase not connected. Call connect() first.");
		}
	}
}

/**
 * Create a new TestDatabase instance, optionally with schema and seed data
 */
export async function createTestDatabase(options: TestDatabaseOptions = {}): Promise<TestDatabase> {
	const db = new TestDatabase();
	await db.connect();

	// Create schema
	if (options.schema) {
		for (const [table, columns] of Object.entries(options.schema)) {
			await db.createTable(table, columns);
		}
	}

	// Seed data
	if (options.seed) {
		await db.seed(options.seed);
	}

	return db;
}

// ============= Database Assertions =============

/**
 * Assert row count in a table
 */
export async function assertTableRowCount(
	db: TestDatabase,
	table: string,
	expected: number,
): Promise<void> {
	const count = await db.count(table);
	if (count !== expected) {
		throw new Error(
			`Expected table "${table}" to have ${expected} rows, but found ${count}`,
		);
	}
}

/**
 * Assert a row exists in a table
 */
export async function assertTableHasRow(
	db: TestDatabase,
	table: string,
	condition: string,
	params: unknown[] = [],
): Promise<void> {
	const exists = await db.exists(table, condition, params);
	if (!exists) {
		throw new Error(
			`Expected table "${table}" to have a row matching: ${condition}`,
		);
	}
}

/**
 * Assert a row does not exist in a table
 */
export async function assertTableNotHasRow(
	db: TestDatabase,
	table: string,
	condition: string,
	params: unknown[] = [],
): Promise<void> {
	const exists = await db.exists(table, condition, params);
	if (exists) {
		throw new Error(
			`Expected table "${table}" to NOT have a row matching: ${condition}`,
		);
	}
}

/**
 * Assert table exists in database
 */
export async function assertTableExists(db: TestDatabase, table: string): Promise<void> {
	const tables = await db.getTables();
	if (!tables.includes(table)) {
		throw new Error(
			`Expected table "${table}" to exist. Available tables: [${tables.join(", ")}]`,
		);
	}
}

/**
 * Assert table does not exist in database
 */
export async function assertTableNotExists(db: TestDatabase, table: string): Promise<void> {
	const tables = await db.getTables();
	if (tables.includes(table)) {
		throw new Error(`Expected table "${table}" to NOT exist`);
	}
}

/**
 * Assert a specific value in a table
 */
export async function assertTableValue<T = unknown>(
	db: TestDatabase,
	table: string,
	column: string,
	condition: string,
	expected: T,
	params: unknown[] = [],
): Promise<void> {
	const sql = `SELECT ${column} as value FROM ${table} WHERE ${condition} LIMIT 1`;
	const result = await db.queryOne<{ value: T }>(sql, params);

	if (!result) {
		throw new Error(
			`Expected to find a row in "${table}" matching: ${condition}`,
		);
	}

	if (JSON.stringify(result.value) !== JSON.stringify(expected)) {
		throw new Error(
			`Expected ${column} to be ${JSON.stringify(expected)}, got ${JSON.stringify(result.value)}`,
		);
	}
}
// ============= Test Storage =============

import { mkdir, rm, readdir, stat as fsStat, copyFile, rename, unlink } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { tmpdir } from "node:os";

/**
 * Storage operation record for testing
 */
export interface StorageOperation {
	type: "write" | "read" | "delete" | "exists" | "list" | "stat" | "copy" | "move" | "clear";
	path?: string;
	src?: string;
	dest?: string;
	size?: number;
	timestamp: number;
}

/**
 * File stats returned by TestStorage
 */
export interface StorageFileStats {
	size: number;
	created: number;
	modified: number;
}

/**
 * Options for creating a test storage
 */
export interface TestStorageOptions {
	basePath?: string;
}

/**
 * TestStorage - A mock file storage for testing purposes.
 * Uses a temporary directory for file operations with operation tracking.
 */
export class TestStorage {
	private _basePath: string;
	private _operations: StorageOperation[] = [];
	private _initialized = false;

	/**
	 * Get the base path of the storage
	 */
	get basePath(): string {
		return this._basePath;
	}

	/**
	 * Get the list of all operations performed on this storage
	 */
	get operations(): ReadonlyArray<StorageOperation> {
		return this._operations;
	}

	constructor(basePath: string) {
		this._basePath = basePath;
	}

	/**
	 * Initialize the storage (create base directory)
	 */
	async init(): Promise<void> {
		if (this._initialized) return;
		await mkdir(this._basePath, { recursive: true });
		this._initialized = true;
	}

	/**
	 * Write content to a file
	 * @param path - Relative path within storage
	 * @param content - String or binary content
	 */
	async write(path: string, content: string | Uint8Array | ArrayBuffer): Promise<void> {
		await this.ensureInitialized();
		const fullPath = this.resolvePath(path);
		
		// Ensure parent directory exists
		const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
		if (parentDir) {
			await mkdir(parentDir, { recursive: true });
		}

		// Write content using Bun.file()
		const file = Bun.file(fullPath);
		const writer = file.writer();
		
		if (typeof content === "string") {
			writer.write(content);
		} else if (content instanceof Uint8Array) {
			writer.write(content);
		} else if (content instanceof ArrayBuffer) {
			writer.write(new Uint8Array(content));
		}
		
		await writer.end();

		const size = typeof content === "string" 
			? new TextEncoder().encode(content).length 
			: content.byteLength;

		this._operations.push({
			type: "write",
			path,
			size,
			timestamp: Date.now(),
		});
	}

	/**
	 * Read content from a file
	 * @param path - Relative path within storage
	 * @returns File content as string or null if not found
	 */
	async read(path: string): Promise<string | null> {
		await this.ensureInitialized();
		const fullPath = this.resolvePath(path);
		const file = Bun.file(fullPath);

		this._operations.push({
			type: "read",
			path,
			timestamp: Date.now(),
		});

		if (!(await file.exists())) {
			return null;
		}

		return file.text();
	}

	/**
	 * Read content from a file as ArrayBuffer
	 * @param path - Relative path within storage
	 * @returns File content as ArrayBuffer or null if not found
	 */
	async readBytes(path: string): Promise<ArrayBuffer | null> {
		await this.ensureInitialized();
		const fullPath = this.resolvePath(path);
		const file = Bun.file(fullPath);

		this._operations.push({
			type: "read",
			path,
			timestamp: Date.now(),
		});

		if (!(await file.exists())) {
			return null;
		}

		return file.arrayBuffer();
	}

	/**
	 * Delete a file
	 * @param path - Relative path within storage
	 * @returns True if file was deleted, false if it didn't exist
	 */
	async delete(path: string): Promise<boolean> {
		await this.ensureInitialized();
		const fullPath = this.resolvePath(path);
		const file = Bun.file(fullPath);

		const exists = await file.exists();
		if (exists) {
			await unlink(fullPath);
		}

		this._operations.push({
			type: "delete",
			path,
			timestamp: Date.now(),
		});

		return exists;
	}

	/**
	 * Check if a file exists
	 * @param path - Relative path within storage
	 */
	async exists(path: string): Promise<boolean> {
		await this.ensureInitialized();
		const fullPath = this.resolvePath(path);
		const file = Bun.file(fullPath);
		const exists = await file.exists();

		this._operations.push({
			type: "exists",
			path,
			timestamp: Date.now(),
		});

		return exists;
	}

	/**
	 * List files in storage
	 * @param prefix - Optional prefix to filter files
	 * @returns Array of relative file paths
	 */
	async list(prefix?: string): Promise<string[]> {
		await this.ensureInitialized();
		const files: string[] = [];

		const scanDir = async (dir: string): Promise<void> => {
			try {
				const entries = await readdir(dir, { withFileTypes: true });
				for (const entry of entries) {
					const fullPath = join(dir, entry.name);
					if (entry.isDirectory()) {
						await scanDir(fullPath);
					} else if (entry.isFile()) {
						const relativePath = relative(this._basePath, fullPath);
						if (!prefix || relativePath.startsWith(prefix)) {
							files.push(relativePath);
						}
					}
				}
			} catch {
				// Directory doesn't exist or can't be read
			}
		};

		await scanDir(this._basePath);

		this._operations.push({
			type: "list",
			path: prefix,
			timestamp: Date.now(),
		});

		return files.sort();
	}

	/**
	 * Get file stats
	 * @param path - Relative path within storage
	 * @returns File stats or null if not found
	 */
	async stat(path: string): Promise<StorageFileStats | null> {
		await this.ensureInitialized();
		const fullPath = this.resolvePath(path);
		const file = Bun.file(fullPath);

		if (!(await file.exists())) {
			this._operations.push({
				type: "stat",
				path,
				timestamp: Date.now(),
			});
			return null;
		}

		const stats = await fsStat(fullPath);

		this._operations.push({
			type: "stat",
			path,
			size: stats.size,
			timestamp: Date.now(),
		});

		return {
			size: stats.size,
			created: stats.birthtimeMs,
			modified: stats.mtimeMs,
		};
	}

	/**
	 * Copy a file
	 * @param src - Source path (relative)
	 * @param dest - Destination path (relative)
	 */
	async copy(src: string, dest: string): Promise<void> {
		await this.ensureInitialized();
		const srcPath = this.resolvePath(src);
		const destPath = this.resolvePath(dest);

		// Ensure parent directory exists for destination
		const parentDir = destPath.substring(0, destPath.lastIndexOf("/"));
		if (parentDir) {
			await mkdir(parentDir, { recursive: true });
		}

		await copyFile(srcPath, destPath);

		const stats = await fsStat(destPath);
		this._operations.push({
			type: "copy",
			src,
			dest,
			size: stats.size,
			timestamp: Date.now(),
		});
	}

	/**
	 * Move/rename a file
	 * @param src - Source path (relative)
	 * @param dest - Destination path (relative)
	 */
	async move(src: string, dest: string): Promise<void> {
		await this.ensureInitialized();
		const srcPath = this.resolvePath(src);
		const destPath = this.resolvePath(dest);

		// Ensure parent directory exists for destination
		const parentDir = destPath.substring(0, destPath.lastIndexOf("/"));
		if (parentDir) {
			await mkdir(parentDir, { recursive: true });
		}

		await rename(srcPath, destPath);

		this._operations.push({
			type: "move",
			src,
			dest,
			timestamp: Date.now(),
		});
	}

	/**
	 * Delete all files in storage
	 */
	async clear(): Promise<void> {
		await this.ensureInitialized();
		
		try {
			const files = await this.list();
			for (const file of files) {
				const fullPath = this.resolvePath(file);
				await unlink(fullPath);
			}
		} catch {
			// Ignore errors
		}

		this._operations.push({
			type: "clear",
			timestamp: Date.now(),
		});
	}

	/**
	 * Get the base path of the storage
	 */
	getBasePath(): string {
		return this._basePath;
	}

	/**
	 * Reset the storage - clear all files and operations log
	 */
	async reset(): Promise<void> {
		await this.clear();
		this._operations = [];
	}

	/**
	 * Clean up - remove the entire base directory
	 */
	async cleanup(): Promise<void> {
		try {
			await rm(this._basePath, { recursive: true, force: true });
		} catch {
			// Ignore errors
		}
		this._operations = [];
		this._initialized = false;
	}

	/**
	 * Resolve a relative path to full path
	 */
	private resolvePath(path: string): string {
		// Normalize path and remove leading slashes
		const normalizedPath = path.replace(/^\/+/, "");
		return resolve(this._basePath, normalizedPath);
	}

	/**
	 * Ensure storage is initialized
	 */
	private async ensureInitialized(): Promise<void> {
		if (!this._initialized) {
			await this.init();
		}
	}
}

/**
 * Create a new TestStorage instance
 * @param options - Optional configuration
 */
export async function createTestStorage(options: TestStorageOptions = {}): Promise<TestStorage> {
	const basePath = options.basePath ?? await createTempDir("bueno-test-storage-");
	const storage = new TestStorage(basePath);
	await storage.init();
	return storage;
}

/**
 * Create a temporary directory
 */
async function createTempDir(prefix: string): Promise<string> {
	const { mkdtemp } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	return mkdtemp(join(tmpdir(), prefix));
}

// ============= Storage Assertions =============

/**
 * Assert that a file exists in storage
 */
export async function assertFileExists(storage: TestStorage, path: string): Promise<void> {
	const exists = await storage.exists(path);
	if (!exists) {
		const files = await storage.list();
		throw new Error(
			`Expected file "${path}" to exist. Available files: [${files.join(", ")}]`,
		);
	}
}

/**
 * Assert that a file does not exist in storage
 */
export async function assertFileNotExists(storage: TestStorage, path: string): Promise<void> {
	const exists = await storage.exists(path);
	if (exists) {
		throw new Error(`Expected file "${path}" to NOT exist`);
	}
}

/**
 * Assert file content matches expected
 */
export async function assertFileContent(
	storage: TestStorage,
	path: string,
	expected: string,
): Promise<void> {
	const content = await storage.read(path);
	if (content === null) {
		throw new Error(`Expected file "${path}" to exist`);
	}
	if (content !== expected) {
		throw new Error(
			`Expected file content for "${path}" to be:\n${expected}\n\nGot:\n${content}`,
		);
	}
}

/**
 * Assert file size matches expected
 */
export async function assertFileSize(
	storage: TestStorage,
	path: string,
	expectedSize: number,
): Promise<void> {
	const stats = await storage.stat(path);
	if (stats === null) {
		throw new Error(`Expected file "${path}" to exist`);
	}
	if (stats.size !== expectedSize) {
		throw new Error(
			`Expected file "${path}" to have size ${expectedSize}, got ${stats.size}`,
		);
	}
}