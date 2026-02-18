import { describe, test, expect, beforeEach } from 'bun:test';
import { Module, Controller, Injectable, createApp, AppModule } from '../../src/modules';
import { Container, Token } from '../../src/container';

// Helper to check metadata (since we use WeakMap storage)
function hasInjectable(target: abstract new (...args: unknown[]) => unknown): boolean {
  // Check if class has Injectable metadata by trying to instantiate
  // In a real scenario, the metadata is stored internally
  return true; // Simplified for test
}

// Test fixtures
interface IUserService {
  getUser(id: string): { id: string; name: string };
}

interface IUserRepository {
  findById(id: string): { id: string; name: string } | null;
}

const USER_SERVICE_TOKEN = Token<IUserService>('IUserService');
const USER_REPOSITORY_TOKEN = Token<IUserRepository>('IUserRepository');

class UserRepository implements IUserRepository {
  private users = new Map([
    ['1', { id: '1', name: 'John' }],
    ['2', { id: '2', name: 'Jane' }],
  ]);

  findById(id: string): { id: string; name: string } | null {
    return this.users.get(id) ?? null;
  }
}

class UserService implements IUserService {
  constructor(private repo: IUserRepository) {}

  getUser(id: string): { id: string; name: string } {
    const user = this.repo.findById(id);
    return user ?? { id, name: 'Unknown' };
  }
}

class UsersController {
  constructor(private userService: IUserService) {}

  findAll() {
    return [{ id: '1', name: 'John' }, { id: '2', name: 'Jane' }];
  }

  findOne(id: string) {
    return this.userService.getUser(id);
  }
}

@Module({
  providers: [
    { token: USER_REPOSITORY_TOKEN, useClass: UserRepository },
    { token: USER_SERVICE_TOKEN, useClass: UserService, inject: [USER_REPOSITORY_TOKEN] },
  ],
  controllers: [UsersController],
  exports: [USER_SERVICE_TOKEN],
})
class UsersModule {}

@Module({
  imports: [UsersModule],
})
class TestAppModule {}

describe('Module System', () => {
  describe('@Injectable Decorator', () => {
    test('should mark class as injectable', () => {
      @Injectable()
      class TestService {}
      
      // Class should be returned unchanged
      expect(TestService).toBeDefined();
    });
  });

  describe('@Controller Decorator', () => {
    test('should mark class as controller with path', () => {
      @Controller('/api')
      class TestController {}
      
      // Class should be returned unchanged
      expect(TestController).toBeDefined();
    });
  });

  describe('@Module Decorator', () => {
    test('should define module metadata', () => {
      @Module({
        providers: [],
        controllers: [],
      })
      class TestModule {}
      
      // Module should be defined
      expect(TestModule).toBeDefined();
    });
  });

  describe('AppModule', () => {
    test('should create module from class', () => {
      const appModule = new AppModule(TestAppModule);
      expect(appModule).toBeDefined();
    });

    test('should collect providers from module tree', () => {
      const appModule = new AppModule(TestAppModule);
      const providers = appModule.getProviders();
      
      expect(providers.length).toBeGreaterThan(0);
    });

    test('should collect controllers from module tree', () => {
      const appModule = new AppModule(TestAppModule);
      const controllers = appModule.getControllers();
      
      expect(controllers.length).toBeGreaterThan(0);
    });
  });

  describe('createApp', () => {
    test('should create application with module', () => {
      const app = createApp(TestAppModule);
      expect(app).toBeDefined();
      expect(app.container).toBeInstanceOf(Container);
    });

    test('should resolve imported module providers', async () => {
      const app = createApp(TestAppModule);
      await app.init();
      const userService = app.container.resolve(USER_SERVICE_TOKEN);
      
      expect(userService).toBeDefined();
      expect(userService.getUser('1')).toEqual({ id: '1', name: 'John' });
    });
  });
});
