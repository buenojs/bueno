import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database, detectDriver, createConnection, QueryBuilder } from '../../src/database';
import { query } from '../../src/database/orm/builder';

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

  describe('createConnection', () => {
    test('should create and connect to database', async () => {
      const db = await createConnection({ url: ':memory:' });
      expect(db.isConnected).toBe(true);
      await db.close();
    });
  });
});
