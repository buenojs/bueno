import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database, detectDriver, createConnection, QueryBuilder, table } from '../../src/database';

describe('Database', () => {
  // Use SQLite for testing (no external dependencies)
  const testDbPath = ':memory:';
  
  describe('detectDriver', () => {
    test('should detect postgresql from URL', () => {
      expect(detectDriver('postgresql://user:pass@localhost/db')).toBe('postgresql');
    });

    test('should detect mysql from URL', () => {
      expect(detectDriver('mysql://user:pass@localhost/db')).toBe('mysql');
    });

    test('should detect sqlite from file path', () => {
      expect(detectDriver('./test.db')).toBe('sqlite');
      expect(detectDriver('/path/to/test.db')).toBe('sqlite');
    });

    test('should detect sqlite from sqlite:// URL', () => {
      expect(detectDriver('sqlite://./test.db')).toBe('sqlite');
    });
  });

  describe('Database (SQLite)', () => {
    let db: Database;

    beforeEach(async () => {
      db = new Database({ url: testDbPath });
      await db.connect();
      
      // Create test table using raw SQL
      await db.raw(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE
        )
      `);
    });

    afterEach(async () => {
      await db.close();
    });

    test('should connect to database', () => {
      expect(db.isConnected).toBe(true);
    });

    test('should execute queries with tagged template', async () => {
      await db.raw("INSERT INTO users (name, email) VALUES ('John', 'john@example.com')");
      
      const count = await db.queryOne<{ count: number }>`SELECT COUNT(*) as count FROM users`;
      expect(count?.count).toBe(1);
    });

    test('should query multiple rows', async () => {
      await db.raw("INSERT INTO users (name, email) VALUES ('John', 'john@example.com')");
      await db.raw("INSERT INTO users (name, email) VALUES ('Jane', 'jane@example.com')");
      
      const users = await db.query<{ id: number; name: string; email: string }>`SELECT * FROM users ORDER BY name`;
      
      expect(users.length).toBe(2);
      expect(users[0].name).toBe('Jane');
      expect(users[1].name).toBe('John');
    });

    test('should query single row', async () => {
      await db.raw("INSERT INTO users (name, email) VALUES ('John', 'john@example.com')");
      
      const user = await db.queryOne<{ id: number; name: string; email: string }>`
        SELECT * FROM users WHERE name = ${'John'}
      `;
      
      expect(user).not.toBeNull();
      expect(user?.name).toBe('John');
    });

    test('should handle transactions', async () => {
      await db.transaction(async (tx) => {
        await tx.execute`INSERT INTO users (name, email) VALUES (${'John'}, ${'john@example.com'})`;
      });
      
      const count = await db.queryOne<{ count: number }>`SELECT COUNT(*) as count FROM users`;
      expect(count?.count).toBe(1);
    });

    test('should rollback on error', async () => {
      try {
        await db.transaction(async (tx) => {
          await tx.execute`INSERT INTO users (name, email) VALUES (${'John'}, ${'john@example.com'})`;
          throw new Error('Test error');
        });
      } catch (e) {
        // Expected
      }
      
      const count = await db.queryOne<{ count: number }>`SELECT COUNT(*) as count FROM users`;
      expect(count?.count).toBe(0);
    });
  });

  describe('QueryBuilder', () => {
    let db: Database;
    let users: QueryBuilder<{ id: number; name: string; email: string }>;

    beforeEach(async () => {
      db = new Database({ url: testDbPath });
      await db.connect();
      
      await db.raw(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE
        )
      `);
      
      users = table<{ id: number; name: string; email: string }>(db, 'users');
    });

    afterEach(async () => {
      await db.close();
    });

    test('should insert and find by id', async () => {
      const inserted = await users.insert({ name: 'John', email: 'john@example.com' });
      expect(inserted.name).toBe('John');
      
      const found = await users.findById(inserted.id);
      expect(found?.name).toBe('John');
    });

    test('should count rows', async () => {
      await users.insert({ name: 'John', email: 'john@example.com' });
      await users.insert({ name: 'Jane', email: 'jane@example.com' });
      
      const count = await users.count();
      expect(count).toBe(2);
    });

    test('should delete by id', async () => {
      const inserted = await users.insert({ name: 'John', email: 'john@example.com' });
      
      const deleted = await users.deleteById(inserted.id);
      expect(deleted).toBe(true);
      
      const found = await users.findById(inserted.id);
      expect(found).toBeNull();
    });

    test('should update by id', async () => {
      const inserted = await users.insert({ name: 'John', email: 'john@example.com' });
      
      const updated = await users.updateById(inserted.id, { name: 'Johnny' });
      expect(updated?.name).toBe('Johnny');
    });

    test('should paginate results', async () => {
      for (let i = 0; i < 25; i++) {
        await users.insert({ name: `User${i}`, email: `user${i}@example.com` });
      }
      
      const page1 = await users.paginate(1, 10);
      expect(page1.data.length).toBe(10);
      expect(page1.total).toBe(25);
      expect(page1.totalPages).toBe(3);
      
      const page3 = await users.paginate(3, 10);
      expect(page3.data.length).toBe(5);
    });
  });

  describe('createConnection', () => {
    test('should create and connect to database', async () => {
      const db = await createConnection({ url: ':memory:' });
      expect(db.isConnected).toBe(true);
      await db.close();
    });
  });
});
