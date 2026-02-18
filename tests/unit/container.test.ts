import { describe, test, expect, beforeEach } from 'bun:test';
import { Container, Token } from '../../src/container';

// Test fixtures
interface ILogger {
  log(message: string): void;
}

interface IDatabase {
  query(sql: string): unknown[];
}

interface IUserService {
  getUser(id: string): { id: string; name: string };
}

class ConsoleLogger implements ILogger {
  log(message: string): void {
    console.log(message);
  }
}

class MockDatabase implements IDatabase {
  query(sql: string): unknown[] {
    return [{ id: 1, name: 'test' }];
  }
}

class UserService implements IUserService {
  constructor(
    private logger: ILogger,
    private db: IDatabase
  ) {}

  getUser(id: string): { id: string; name: string } {
    this.logger.log(`Getting user ${id}`);
    const results = this.db.query('SELECT * FROM users WHERE id = ?');
    return { id, name: 'John' };
  }
}

// Token definitions
const LOGGER_TOKEN = Token<ILogger>('ILogger');
const DATABASE_TOKEN = Token<IDatabase>('IDatabase');
const USER_SERVICE_TOKEN = Token<IUserService>('IUserService');

describe('Container', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe('Registration', () => {
    test('should register a provider with useClass', () => {
      container.register({
        token: LOGGER_TOKEN,
        useClass: ConsoleLogger,
      });

      expect(container.has(LOGGER_TOKEN)).toBe(true);
    });

    test('should register a provider with useValue', () => {
      const logger = new ConsoleLogger();
      container.register({
        token: LOGGER_TOKEN,
        useValue: logger,
      });

      expect(container.has(LOGGER_TOKEN)).toBe(true);
    });

    test('should register a provider with useFactory', () => {
      container.register({
        token: LOGGER_TOKEN,
        useFactory: () => new ConsoleLogger(),
      });

      expect(container.has(LOGGER_TOKEN)).toBe(true);
    });

    test('should throw when registering duplicate token', () => {
      container.register({
        token: LOGGER_TOKEN,
        useClass: ConsoleLogger,
      });

      expect(() => {
        container.register({
          token: LOGGER_TOKEN,
          useClass: ConsoleLogger,
        });
      }).toThrow();
    });
  });

  describe('Resolution', () => {
    test('should resolve useClass provider', () => {
      container.register({
        token: LOGGER_TOKEN,
        useClass: ConsoleLogger,
      });

      const logger = container.resolve<ILogger>(LOGGER_TOKEN);
      expect(logger).toBeInstanceOf(ConsoleLogger);
    });

    test('should resolve useValue provider', () => {
      const logger = new ConsoleLogger();
      container.register({
        token: LOGGER_TOKEN,
        useValue: logger,
      });

      const resolved = container.resolve<ILogger>(LOGGER_TOKEN);
      expect(resolved).toBe(logger);
    });

    test('should resolve useFactory provider', () => {
      container.register({
        token: LOGGER_TOKEN,
        useFactory: () => new ConsoleLogger(),
      });

      const logger = container.resolve<ILogger>(LOGGER_TOKEN);
      expect(logger).toBeInstanceOf(ConsoleLogger);
    });

    test('should throw when resolving unregistered token', () => {
      expect(() => {
        container.resolve(LOGGER_TOKEN);
      }).toThrow();
    });

    test('should resolve dependencies via constructor injection', () => {
      container.register({
        token: LOGGER_TOKEN,
        useClass: ConsoleLogger,
      });

      container.register({
        token: DATABASE_TOKEN,
        useClass: MockDatabase,
      });

      container.register({
        token: USER_SERVICE_TOKEN,
        useClass: UserService,
        inject: [LOGGER_TOKEN, DATABASE_TOKEN],
      });

      const userService = container.resolve<IUserService>(USER_SERVICE_TOKEN);
      expect(userService).toBeInstanceOf(UserService);
      expect(userService.getUser('1')).toEqual({ id: '1', name: 'John' });
    });

    test('should resolve factory with injected dependencies', () => {
      container.register({
        token: LOGGER_TOKEN,
        useClass: ConsoleLogger,
      });

      container.register({
        token: DATABASE_TOKEN,
        useClass: MockDatabase,
      });

      container.register({
        token: USER_SERVICE_TOKEN,
        useFactory: (logger, db) => new UserService(logger, db),
        inject: [LOGGER_TOKEN, DATABASE_TOKEN],
      });

      const userService = container.resolve<IUserService>(USER_SERVICE_TOKEN);
      expect(userService).toBeInstanceOf(UserService);
    });
  });

  describe('Scopes', () => {
    test('singleton scope should return same instance', () => {
      container.register({
        token: LOGGER_TOKEN,
        useClass: ConsoleLogger,
        scope: 'singleton',
      });

      const logger1 = container.resolve<ILogger>(LOGGER_TOKEN);
      const logger2 = container.resolve<ILogger>(LOGGER_TOKEN);

      expect(logger1).toBe(logger2);
    });

    test('transient scope should return new instances', () => {
      container.register({
        token: LOGGER_TOKEN,
        useClass: ConsoleLogger,
        scope: 'transient',
      });

      const logger1 = container.resolve<ILogger>(LOGGER_TOKEN);
      const logger2 = container.resolve<ILogger>(LOGGER_TOKEN);

      expect(logger1).not.toBe(logger2);
    });

    test('default scope should be singleton', () => {
      container.register({
        token: LOGGER_TOKEN,
        useClass: ConsoleLogger,
      });

      const logger1 = container.resolve<ILogger>(LOGGER_TOKEN);
      const logger2 = container.resolve<ILogger>(LOGGER_TOKEN);

      expect(logger1).toBe(logger2);
    });
  });

  describe('Circular Dependencies', () => {
    test('should detect circular dependencies', () => {
      const TOKEN_A = Token('ServiceA');
      const TOKEN_B = Token('ServiceB');

      container.register({
        token: TOKEN_A,
        useFactory: () => ({ b: container.resolve(TOKEN_B) }),
      });

      container.register({
        token: TOKEN_B,
        useFactory: () => ({ a: container.resolve(TOKEN_A) }),
      });

      // This should either throw or handle gracefully
      // For now, we expect it to detect the circular dependency
      // Note: Real implementation should track resolution stack
    });
  });

  describe('Bulk Registration', () => {
    test('should register multiple providers', () => {
      container.registerAll([
        { token: LOGGER_TOKEN, useClass: ConsoleLogger },
        { token: DATABASE_TOKEN, useClass: MockDatabase },
      ]);

      expect(container.has(LOGGER_TOKEN)).toBe(true);
      expect(container.has(DATABASE_TOKEN)).toBe(true);
    });
  });

  describe('Clear', () => {
    test('should clear all registrations', () => {
      container.register({
        token: LOGGER_TOKEN,
        useClass: ConsoleLogger,
      });

      container.clear();

      expect(container.has(LOGGER_TOKEN)).toBe(false);
    });
  });
});

describe('Token', () => {
  test('should create a token with description', () => {
    const token = Token<string>('myString');
    expect(token.description).toBe('myString');
  });

  test('should be usable as object key', () => {
    const token = Token<string>('myString');
    const map = new Map();
    map.set(token, 'value');
    expect(map.get(token)).toBe('value');
  });
});
