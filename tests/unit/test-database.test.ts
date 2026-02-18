import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
	createTestDatabase,
	TestDatabase,
	assertTableRowCount,
	assertTableHasRow,
	assertTableNotHasRow,
	assertTableExists,
	assertTableNotExists,
	assertTableValue,
} from '../../src/testing/index.ts';

describe('TestDatabase', () => {
	test('should create in-memory database', async () => {
		const db = new TestDatabase();
		await db.connect();
		expect(db.isConnected).toBe(true);
		await db.close();
		expect(db.isConnected).toBe(false);
	});

	test('should create database with schema', async () => {
		const db = await createTestDatabase({
			schema: {
				users: {
					id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
					name: 'TEXT NOT NULL',
					email: 'TEXT UNIQUE',
				},
			},
		});

		const tables = await db.getTables();
		expect(tables).toContain('users');
		await db.close();
	});

	test('should create database with seed data', async () => {
		const db = await createTestDatabase({
			schema: {
				users: {
					id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
					name: 'TEXT NOT NULL',
				},
			},
			seed: {
				users: [{ name: 'Alice' }, { name: 'Bob' }],
			},
		});

		const users = await db.query<{ name: string }>('SELECT * FROM users');
		expect(users).toHaveLength(2);
		expect(users[0].name).toBe('Alice');
		expect(users[1].name).toBe('Bob');
		await db.close();
	});

	test('should execute queries', async () => {
		const db = await createTestDatabase({
			schema: {
				items: {
					id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
					value: 'TEXT',
				},
			},
		});

		await db.execute('INSERT INTO items (value) VALUES (?)', ['test1']);
		await db.execute('INSERT INTO items (value) VALUES (?)', ['test2']);

		const items = await db.query('SELECT * FROM items');
		expect(items).toHaveLength(2);

		const oneItem = await db.queryOne<{ value: string }>(
			'SELECT * FROM items WHERE value = ?',
			['test1'],
		);
		expect(oneItem?.value).toBe('test1');

		await db.close();
	});

	test('should track operations', async () => {
		const db = await createTestDatabase({
			schema: {
				test: { id: 'INTEGER PRIMARY KEY', value: 'TEXT' },
			},
		});

		await db.query('SELECT * FROM test');
		await db.execute('INSERT INTO test (id, value) VALUES (1, ?)', ['x']);

		// Note: createTestDatabase internally calls execute() to create the table, adding 1 operation
		expect(db.operations).toHaveLength(3);
		expect(db.operations[0].type).toBe('execute'); // schema creation
		expect(db.operations[1].type).toBe('query');
		expect(db.operations[2].type).toBe('execute');
		expect(db.operations[2].sql).toContain('INSERT');

		await db.close();
	});

	test('should support transactions', async () => {
		const db = await createTestDatabase({
			schema: {
				accounts: {
					id: 'INTEGER PRIMARY KEY',
					balance: 'INTEGER',
				},
			},
			seed: {
				accounts: [{ id: 1, balance: 100 }],
			},
		});

		await db.transaction(async (tx) => {
			await tx.execute('UPDATE accounts SET balance = balance - 10 WHERE id = 1');
			await tx.execute('UPDATE accounts SET balance = balance + 10 WHERE id = 1');
		});

		const account = await db.queryOne<{ balance: number }>(
			'SELECT * FROM accounts WHERE id = 1',
		);
		expect(account?.balance).toBe(100);

		await db.close();
	});

	test('should rollback failed transactions', async () => {
		const db = await createTestDatabase({
			schema: {
				items: {
					id: 'INTEGER PRIMARY KEY',
					value: 'TEXT UNIQUE',
				},
			},
			seed: {
				items: [{ id: 1, value: 'unique' }],
			},
		});

		try {
			await db.transaction(async (tx) => {
				await tx.execute('INSERT INTO items (id, value) VALUES (2, ?)', ['new']);
				// This will fail due to unique constraint
				await tx.execute('INSERT INTO items (id, value) VALUES (3, ?)', ['unique']);
			});
		} catch {
			// Expected
		}

		const items = await db.query('SELECT * FROM items');
		expect(items).toHaveLength(1); // Only original item, transaction rolled back

		await db.close();
	});

	test('should reset database', async () => {
		const db = await createTestDatabase({
			schema: {
				users: { id: 'INTEGER PRIMARY KEY', name: 'TEXT' },
			},
			seed: {
				users: [{ id: 1, name: 'Test' }],
			},
		});

		expect(await db.getTables()).toContain('users');

		await db.reset();

		// Check operations BEFORE calling getTables() (which internally calls query())
		expect(db.operations).toHaveLength(0);
		expect(await db.getTables()).toHaveLength(0);

		await db.close();
	});

	test('should truncate tables', async () => {
		const db = await createTestDatabase({
			schema: {
				users: { id: 'INTEGER PRIMARY KEY', name: 'TEXT' },
			},
			seed: {
				users: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
			},
		});

		await db.truncate('users');
		const count = await db.count('users');
		expect(count).toBe(0);

		await db.close();
	});

	test('should use schema builder helpers', async () => {
		const db = await createTestDatabase();

		await db.createTable('posts', {
			id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
			title: 'TEXT NOT NULL',
			body: 'TEXT',
		});

		expect(await db.getTables()).toContain('posts');

		await db.dropTable('posts');
		expect(await db.getTables()).not.toContain('posts');

		await db.close();
	});

	test('assertions should work', async () => {
		const db = await createTestDatabase({
			schema: {
				users: { id: 'INTEGER PRIMARY KEY', name: 'TEXT', email: 'TEXT' },
			},
			seed: {
				users: [
					{ id: 1, name: 'Alice', email: 'alice@test.com' },
					{ id: 2, name: 'Bob', email: 'bob@test.com' },
				],
			},
		});

		await assertTableRowCount(db, 'users', 2);
		await assertTableHasRow(db, 'users', 'name = ?', ['Alice']);
		await assertTableNotHasRow(db, 'users', 'name = ?', ['Charlie']);
		await assertTableExists(db, 'users');
		await assertTableValue(db, 'users', 'email', 'name = ?', 'alice@test.com', ['Alice']);

		await db.close();
	});

	test('assertTableNotExists should work', async () => {
		const db = await createTestDatabase();

		await assertTableNotExists(db, 'nonexistent');

		await db.close();
	});
});

describe('TestDatabase with beforeEach/afterEach', () => {
	let db: TestDatabase;

	beforeEach(async () => {
		db = await createTestDatabase({
			schema: {
				users: {
					id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
					name: 'TEXT NOT NULL',
					email: 'TEXT UNIQUE',
				},
			},
		});
	});

	afterEach(async () => {
		await db.close();
	});

	test('should have empty users table at start', async () => {
		const count = await db.count('users');
		expect(count).toBe(0);
	});

	test('should insert users', async () => {
		await db.execute('INSERT INTO users (name, email) VALUES (?, ?)', [
			'Alice',
			'alice@test.com',
		]);
		const count = await db.count('users');
		expect(count).toBe(1);
	});

	test('should be isolated between tests', async () => {
		// This test should start fresh, not affected by previous test
		const count = await db.count('users');
		expect(count).toBe(0);
	});
});