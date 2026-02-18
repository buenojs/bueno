# Bueno

A Bun-Native Full-Stack Framework

[![Build Status](https://img.shields.io/github/actions/workflow/status/buenojs/bueno/ci.yml?branch=main)](https://github.com/buenojs/bueno/actions)
[![Test Coverage](https://img.shields.io/codecov/c/gh/buenojs/bueno)](https://codecov.io/gh/buenojs/bueno)
[![npm version](https://img.shields.io/npm/v/@buenojs/bueno)](https://www.npmjs.com/package/@buenojs/bueno)
[![License](https://img.shields.io/npm/l/@buenojs/bueno)](https://github.com/buenojs/bueno/blob/main/LICENSE)
[![Bun Version](https://img.shields.io/badge/bun-%3E%3D1.3.0-black)](https://bun.sh)
[![Activity](https://img.shields.io/github/commit-activity/m/buenojs/bueno)](https://github.com/buenojs/bueno/graphs/commit-activity)
[![Last Commit](https://img.shields.io/github/last-commit/buenojs/bueno)](https://github.com/buenojs/bueno/commits/main)

## Why Bueno?

Bueno is a **Bun-native** full-stack framework designed from the ground up to leverage Bun's exceptional performance and modern JavaScript capabilities. Bueno embraces Bun's APIs, resulting in:

- **Blazing Fast Performance**: Built on Bun's native HTTP server and optimized runtime
- **Zero Configuration**: Sensible defaults that work out of the box
- **Full-Stack Integration**: Seamless frontend and backend development
- **Type Safety**: End-to-end TypeScript with full type inference
- **Modern DX**: Hot module replacement, fast testing, and intuitive APIs

## Installation

### Quick Start (New Project)

```bash
# Create a new project (recommended)
bunx create-bueno my-app
cd my-app
bun install
bun dev
```

### Add to Existing Project

```bash
# As a dependency
bun add @buenojs/bueno
```

### Global CLI Installation

```bash
# Install globally
bun install -g @buenojs/bueno

# Use CLI commands anywhere
bueno dev
bueno build
```

## Quick Start

```typescript
import { createServer, Router } from '@buenojs/bueno';

const router = new Router();

router.get('/hello', (ctx) => {
  return ctx.json({ message: 'Hello, World!' });
});

const server = createServer();
server.router = router;
server.listen(3000);
```

## CLI Commands

### `bueno new <name>`

Create a new Bueno project.

```bash
bueno new my-app
bueno new my-api --template api
bueno new my-fullstack --template fullstack --framework react
bueno new my-app --database postgresql --docker
```

| Option | Default | Description |
|--------|---------|-------------|
| `--template` | `default` | Project template (`default`, `minimal`, `fullstack`, `api`) |
| `--framework` | `react` | Frontend framework (`react`, `vue`, `svelte`, `solid`) |
| `--database` | `sqlite` | Database type (`sqlite`, `postgresql`, `mysql`) |
| `--docker` | `false` | Generate Docker configuration |
| `--deploy` | - | Deployment target (`render`, `fly`, `railway`) |
| `--skip-install` | `false` | Skip dependency installation |
| `--skip-git` | `false` | Skip git initialization |
| `--yes` | `false` | Use default options |

### `bueno dev`

Start the development server with Hot Module Replacement (HMR).

```bash
bueno dev
bueno dev --port 4000 --host 0.0.0.0
bueno dev --no-hmr --open
```

| Option | Default | Description |
|--------|---------|-------------|
| `-p, --port` | `3000` | Server port |
| `-H, --host` | `localhost` | Server host |
| `--no-hmr` | `false` | Disable Hot Module Replacement |
| `--no-watch` | `false` | Disable file watching |
| `-o, --open` | `false` | Open browser automatically |
| `-c, --config` | `bueno.config.ts` | Configuration file path |

### `bueno build`

Build your application for production.

```bash
bueno build
bueno build --target node --outdir ./dist
bueno build --compile --cross-compile
```

| Option | Default | Description |
|--------|---------|-------------|
| `-t, --target` | `bun` | Build target (`bun`, `node`, `standalone`) |
| `-o, --outdir` | `./dist` | Output directory |
| `--no-minify` | `false` | Disable minification |
| `--sourcemap` | `false` | Generate source maps |
| `--analyze` | `false` | Analyze bundle size |
| `--compile` | `false` | Compile to executable |
| `--cross-compile` | `false` | Cross-compile for other platforms |
| `--executable-name` | `app` | Executable name |

### `bueno start`

Start the production server.

```bash
bueno start
bueno start --port 8080 --workers 4
```

| Option | Default | Description |
|--------|---------|-------------|
| `-p, --port` | `3000` | Server port |
| `-H, --host` | `0.0.0.0` | Server host |
| `-w, --workers` | `1` | Number of worker threads |
| `-c, --config` | `bueno.config.ts` | Configuration file path |

### `bueno generate <type> <name>`

Generate code artifacts (alias: `g`).

```bash
bueno generate controller UserController
bueno g service AuthService --module auth
bueno g dto CreateUserDTO --dry-run
```

| Type | Description |
|------|-------------|
| `controller` | HTTP controller |
| `service` | Injectable service |
| `module` | Feature module |
| `guard` | Authentication/authorization guard |
| `interceptor` | Request/response interceptor |
| `pipe` | Validation/transformation pipe |
| `filter` | Exception filter |
| `dto` | Data Transfer Object |
| `middleware` | Custom middleware |
| `migration` | Database migration |

| Option | Default | Description |
|--------|---------|-------------|
| `-m, --module` | - | Parent module for the artifact |
| `--path` | - | Custom output path |
| `--dry-run` | `false` | Preview without writing |
| `--force` | `false` | Overwrite existing files |

### `bueno migration <action>`

Manage database migrations.

```bash
bueno migration create add_users_table
bueno migration up
bueno migration down --steps 2
bueno migration reset
bueno migration status
```

| Action | Description |
|--------|-------------|
| `create <name>` | Create a new migration |
| `up` | Run pending migrations |
| `down` | Rollback migrations |
| `reset` | Reset database and re-run all migrations |
| `refresh` | Reset and re-seed database |
| `status` | Show migration status |

| Option | Default | Description |
|--------|---------|-------------|
| `-n, --steps` | `1` | Number of migrations to rollback |
| `--dry-run` | `false` | Preview without executing |

### `bueno help`

Display help information.

```bash
bueno help
bueno help dev
bueno generate --help
```

### Global Options

| Option | Description |
|--------|-------------|
| `--help, -h` | Show help |
| `--version, -v` | Show version |
| `--verbose` | Enable verbose output |
| `--quiet` | Suppress output |
| `--no-color` | Disable colored output |

## Core Features

### HTTP & Routing

Bueno provides a powerful and intuitive routing system with full HTTP method support.

```typescript
import { createServer, Router } from '@buenojs/bueno';

const router = new Router();

// All HTTP methods
router.get('/users', getUsers);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.patch('/users/:id', patchUser);
router.delete('/users/:id', deleteUser);

// Path parameters
router.get('/users/:id', (ctx) => {
  const { id } = ctx.params;
  return ctx.json({ userId: id });
});

// Query parameters
router.get('/search', (ctx) => {
  const { q, page, limit } = ctx.query;
  return ctx.json({ query: q, page, limit });
});

// Wildcard routes
router.get('/files/*', (ctx) => {
  const path = ctx.params['*'];
  return ctx.json({ filePath: path });
});

// Route groups
router.group('/api/v1', (api) => {
  api.get('/users', getUsers);
  api.post('/users', createUser);
});

const server = createServer();
server.router = router;
server.listen(3000);
```

### Dependency Injection

Built-in IoC container inspired by NestJS for clean, testable code.

```typescript
import { Container, createToken, Injectable, Inject } from '@buenojs/bueno';

// Create tokens
const ILogger = createToken<Logger>('Logger');
const IUserRepository = createToken<UserRepository>('UserRepository');

// Define injectable services
@Injectable()
class UserRepository {
  constructor(@Inject(ILogger) private logger: Logger) {}
  
  async findById(id: string) {
    this.logger.debug(`Finding user ${id}`);
    // ...
  }
}

// Register and resolve
const container = new Container();
container.register(ILogger, ConsoleLogger);
container.register(IUserRepository, UserRepository);

const repo = container.resolve(IUserRepository);
```

### Middleware

Comprehensive middleware system with built-in utilities and custom middleware support.

#### Built-in Middleware

```typescript
import { 
  logger, 
  cors, 
  requestId, 
  timing, 
  securityHeaders, 
  rateLimit, 
  compression 
} from '@buenojs/bueno/middleware';

const server = createServer();

// Add middleware
server.use(logger());
server.use(cors({ origin: ['https://example.com'] }));
server.use(requestId());
server.use(timing());
server.use(securityHeaders());
server.use(rateLimit({ windowMs: 60000, max: 100 }));
server.use(compression());
```

#### Custom Middleware

```typescript
import { compose, createPipeline } from '@buenojs/bueno/middleware';

// Compose multiple middleware
const apiMiddleware = compose([
  authMiddleware,
  rateLimitMiddleware,
  loggingMiddleware
]);

// Create custom pipeline
const pipeline = createPipeline()
  .use(authMiddleware)
  .use(validationMiddleware)
  .use(handler);

server.use('/api', apiMiddleware);
```

### Modules System

NestJS-inspired modular architecture with decorators.

```typescript
import { Module, Controller, Injectable, Get, Post, Body } from '@buenojs/bueno/modules';

@Injectable()
class UserService {
  private users: User[] = [];
  
  findAll() {
    return this.users;
  }
  
  create(data: CreateUserDTO) {
    const user = { id: crypto.randomUUID(), ...data };
    this.users.push(user);
    return user;
  }
}

@Controller('/users')
class UserController {
  constructor(private userService: UserService) {}
  
  @Get()
  findAll() {
    return this.userService.findAll();
  }
  
  @Post()
  create(@Body() data: CreateUserDTO) {
    return this.userService.create(data);
  }
}

@Module({
  controllers: [UserController],
  providers: [UserService],
})
class UserModule {}
```

### Database

Multi-database support with migrations and schema builder.

```typescript
import { Database, createConnection, SchemaBuilder } from '@buenojs/bueno/database';

// Create connection
const db = createConnection({
  type: 'postgresql', // 'sqlite' | 'mysql' | 'postgresql'
  host: 'localhost',
  port: 5432,
  database: 'myapp',
  username: 'user',
  password: 'pass',
});

// Query builder
const users = await db.table('users')
  .where('active', true)
  .orderBy('created_at', 'desc')
  .limit(10)
  .get();

// Schema builder
const schema = new SchemaBuilder(db);
await schema.createTable('users', (table) => {
  table.uuid('id').primary();
  table.string('email').unique().notNullable();
  table.string('name').notNullable();
  table.timestamp('created_at').default('now()');
  table.index(['email', 'name']);
});
```

### Validation

First-class support for popular validation libraries.

```typescript
import { validate } from '@buenojs/bueno/validation';
import { z } from 'zod';        // Zod
import * as v from 'valibot';  // Valibot
import { type } from 'arktype'; // ArkType

// Zod schema
const UserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
});

// Validate in route
router.post('/users', async (ctx) => {
  const body = await ctx.body();
  const user = validate(body, UserSchema);
  // user is fully typed!
});
```

### Security

Comprehensive security features out of the box.

```typescript
import { 
  hashPassword, 
  verifyPassword,
  createJWT,
  verifyJWT,
  csrf,
  auth,
  rbac,
  apiKey
} from '@buenojs/bueno/security';

// Password hashing
const hashedPassword = await hashPassword('user-password');
const isValid = await verifyPassword(hashedPassword, 'user-password');

// JWT
const token = createJWT({ userId: '123' }, { expiresIn: '1h' });
const payload = verifyJWT(token);

// CSRF protection
server.use(csrf());

// Auth middleware
server.use(auth({ 
  strategy: 'jwt',
  secret: process.env.JWT_SECRET 
}));

// RBAC
server.use(rbac({
  roles: ['admin', 'user', 'guest'],
  permissions: {
    admin: ['*'],
    user: ['read', 'write'],
    guest: ['read']
  }
}));

// API Key middleware
server.use('/api', apiKey({
  header: 'X-API-Key',
  validate: async (key) => await findApiKey(key)
}));
```

### RPC Client

Type-safe API client generation for seamless frontend-backend communication.

```typescript
// server/routes.ts
import { defineRoutes } from '@buenojs/bueno/rpc';

export const routes = defineRoutes((r) => ({
  getUsers: r.get('/users').response<User[]>(),
  getUser: r.get('/users/:id').response<User>(),
  createUser: r.post('/users').body<CreateUserDTO>().response<User>(),
}));

// client/api.ts
import { createClient } from '@buenojs/bueno/rpc';
import { routes } from '../shared/routes';

const api = createClient('http://localhost:3000', routes);

// Fully typed!
const users = await api.getUsers();
const user = await api.getUser({ id: '123' });
const newUser = await api.createUser({ name: 'John', email: 'john@example.com' });
```

### Caching & Sessions

Redis-backed caching and session management.

```typescript
import { Cache, SessionStore, createRedisClient } from '@buenojs/bueno/cache';

// Redis cache
const redis = createRedisClient({ url: 'redis://localhost:6379' });
const cache = new Cache(redis);

await cache.set('user:123', userData, { ttl: 3600 });
const user = await cache.get<User>('user:123');

// Session store
const sessions = new SessionStore(redis);
const session = await sessions.create({ userId: '123' });
const data = await sessions.get(session.id);
await sessions.destroy(session.id);
```

### Distributed Locking

Coordinate distributed operations with Redis or in-memory locks.

```typescript
import { RedisLock, MemoryLock } from '@buenojs/bueno/lock';

// Redis-based distributed lock
const lock = new RedisLock(redis);
await lock.acquire('resource:123', { ttl: 5000 });
try {
  // Critical section
  await processResource();
} finally {
  await lock.release('resource:123');
}

// In-memory lock for single-instance apps
const memoryLock = new MemoryLock();
```

### Static Site Generation (SSG)

Generate static sites with markdown support.

```typescript
import { SSG, markdownParser } from '@buenojs/bueno/ssg';

const ssg = new SSG({
  contentDir: './content',
  outputDir: './dist',
  templates: './templates',
});

// Parse markdown
ssg.parser.use(markdownParser());

// Generate static pages
await ssg.build();
```

### Storage

S3-compatible storage and secrets management.

```typescript
import { Storage, SecretsManager } from '@buenojs/bueno/storage';

// S3-compatible storage
const storage = new Storage({
  provider: 's3',
  bucket: 'my-bucket',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

await storage.upload('uploads/file.pdf', fileBuffer);
const file = await storage.download('uploads/file.pdf');

// Secrets management
const secrets = new SecretsManager({
  provider: 'aws-secrets-manager',
  secretId: 'my-app/secrets',
});

const dbPassword = await secrets.get('DATABASE_PASSWORD');
```

### WebSocket

Real-time communication with WebSocket support.

```typescript
import { WebSocketServer, WebSocketClient, PubSub } from '@buenojs/bueno/websocket';

// Server
const wss = new WebSocketServer({ port: 3001 });

wss.on('connection', (client) => {
  console.log('Client connected');
  
  client.on('message', (data) => {
    // Broadcast to all clients
    wss.broadcast({ type: 'chat', data });
  });
});

// PubSub
const pubsub = new PubSub(redis);
pubsub.subscribe('channel:updates', (message) => {
  wss.broadcast(message);
});

// Client
const ws = new WebSocketClient('ws://localhost:3001');
ws.on('message', (data) => console.log(data));
ws.send({ type: 'chat', message: 'Hello!' });
```

### Logging

Flexible logging with multiple transports.

```typescript
import { Logger, ConsoleTransport, FileTransport } from '@buenojs/bueno/logger';

const logger = new Logger({
  level: 'debug',
  transports: [
    new ConsoleTransport({ colorize: true }),
    new FileTransport({ path: './logs/app.log' }),
  ],
});

logger.info('Server started');
logger.error('Database connection failed', { error: err });
logger.debug('Request received', { method, path });
```

### Health Checks

Built-in health check endpoints for monitoring.

```typescript
import { HealthChecker, DatabaseCheck, CacheCheck, TCPCheck, HTTPCheck } from '@buenojs/bueno/health';

const health = new HealthChecker();

health.addCheck('database', new DatabaseCheck(db));
health.addCheck('redis', new CacheCheck(redis));
health.addCheck('api', new HTTPCheck('https://api.example.com/health'));
health.addCheck('smtp', new TCPCheck('smtp.example.com', 25));

// Health endpoint
router.get('/health', async (ctx) => {
  const result = await health.check();
  return ctx.json(result, result.healthy ? 200 : 503);
});
```

### Testing

Comprehensive testing utilities for unit and integration tests.

```typescript
import { AppTester, mock, assertions } from '@buenojs/bueno/testing';
import { describe, it, expect, beforeEach } from 'bun:test';

describe('UserController', () => {
  let tester: AppTester;
  
  beforeEach(async () => {
    tester = await AppTester.create(AppModule);
  });
  
  it('should create user', async () => {
    const response = await tester
      .post('/users')
      .body({ name: 'John', email: 'john@example.com' })
      .execute();
    
    expect(response.status).toBe(201);
    expect(response.json()).toMatchObject({
      name: 'John',
      email: 'john@example.com'
    });
  });
  
  it('should validate input', async () => {
    const response = await tester
      .post('/users')
      .body({ name: '' }) // Invalid
      .execute();
    
    expect(response.status).toBe(400);
  });
});
```

## Frontend Support

Bueno provides first-class support for modern frontend frameworks with SSR, SSG, and Island Architecture.

### Supported Frameworks

- **React** - Full support with SSR and hydration
- **Vue** - Server-side rendering with Vue 3
- **Svelte** - SvelteKit-like experience
- **Solid** - SolidJS with SSR

### Features

| Feature | Description |
|---------|-------------|
| **SSR** | Server-side rendering for SEO and performance |
| **SSG** | Static site generation at build time |
| **ISR** | Incremental Static Regeneration |
| **Islands** | Interactive components with partial hydration |
| **File-based Routing** | Automatic route generation from file structure |
| **HMR** | Hot module replacement for instant updates |

### Example

```typescript
// client/pages/index.tsx
import { definePage } from '@buenojs/bueno/frontend';

export default definePage({
  async loader() {
    const posts = await fetch('/api/posts').then(r => r.json());
    return { posts };
  },
  
  render({ posts }) {
    return (
      <main>
        <h1>Blog Posts</h1>
        {posts.map(post => (
          <article key={post.id}>
            <h2>{post.title}</h2>
            <p>{post.excerpt}</p>
          </article>
        ))}
      </main>
    );
  }
});
```

## Project Structure

```
my-bueno-app/
├── server/
│   ├── main.ts                    # Application entry point
│   ├── modules/                   # Feature modules
│   │   ├── user/
│   │   │   ├── user.module.ts
│   │   │   ├── user.controller.ts
│   │   │   ├── user.service.ts
│   │   │   └── user.dto.ts
│   │   └── auth/
│   │       ├── auth.module.ts
│   │       ├── auth.controller.ts
│   │       └── auth.guard.ts
│   ├── common/                    # Shared utilities
│   │   ├── middleware/
│   │   ├── decorators/
│   │   └── utils/
│   ├── config/                    # Configuration
│   │   ├── index.ts
│   │   └── database.ts
│   └── database/                  # Database files
│       ├── migrations/
│       ├── seeds/
│       └── schema.ts
├── client/                        # Frontend application
│   ├── pages/                     # File-based routes
│   ├── components/                # UI components
│   ├── layouts/                   # Page layouts
│   └── main.tsx                   # Entry point
├── shared/                        # Shared types and utilities
│   ├── types/
│   └── routes.ts
├── tests/                         # Test files
│   ├── unit/
│   └── integration/
├── bueno.config.ts                # Framework configuration
├── package.json
└── tsconfig.json
```

## NPM Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start development server with watch mode |
| `bun test` | Run test suite |
| `bun test --watch` | Run tests in watch mode |
| `bun test --coverage` | Run tests with coverage |
| `bun build` | Build for production |
| `bun run typecheck` | TypeScript type checking |

## Framework Comparison

Bueno combines the best ideas from popular frameworks while being optimized for Bun:

| Feature | Bueno | Hono | Express | NestJS | Next.js |
|---------|-------|------|---------|--------|---------|
| **Runtime** | Bun | Multi | Node | Node | Node |
| **Router** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **DI Container** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Decorators** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **SSR** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **SSG** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Database** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **WebSocket** | ✅ | ✅ | Plugin | ✅ | ❌ |
| **Validation** | ✅ | ✅ | Plugin | ✅ | ❌ |
| **CLI** | ✅ | ❌ | ❌ | ✅ | ✅ |

**Migration Notes:**
- **From Express**: Similar middleware patterns, but with native async/await and TypeScript
- **From Hono**: Compatible routing API with additional DI and modules system
- **From NestJS**: Familiar decorators and module structure, but Bun-native performance
- **From Next.js**: Similar file-based routing and SSR capabilities, but backend-first approach

## Contributing

We welcome contributions! Please see our [Contributing Guide](https://github.com/buenojs/bueno/blob/main/CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/buenojs/bueno.git
cd bueno

# Install dependencies
bun install

# Run tests
bun test

# Start development
bun dev
```

## Links

- **Documentation**: [https://buenojs.dev](https://buenojs.dev)
- **GitHub**: [https://github.com/buenojs/bueno](https://github.com/buenojs/bueno)
- **Issues**: [https://github.com/buenojs/bueno/issues](https://github.com/buenojs/bueno/issues)
- **npm**: [https://www.npmjs.com/package/@buenojs/bueno](https://www.npmjs.com/package/@buenojs/bueno)

## License

MIT © [Sivaraj D](mailto:sivarajd@gmail.com)