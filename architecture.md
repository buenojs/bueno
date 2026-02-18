# Bueno Framework Architecture

**A Bun-Native Full-Stack Framework**

---

## Executive Summary

Bueno is a high-performance, full-stack web framework built exclusively for Bun v1.3+. Unlike cross-runtime frameworks, Bueno deeply integrates with Bun's native APIs (`bun:sql`, `Bun.serve()`, `Bun.redis`, `Bun.s3`) to provide maximum performance and developer experience. It combines the best ideas from Hono (routing, RPC, middleware), Nest (modularity, dependency injection), and Next.js (full-stack integration, file routing) while staying true to Bun's philosophy of "batteries included."

**Design Principles:**
- **Bun-Exclusive:** No multi-runtime support. Embrace Bun's unique features without compromise.
- **Zero Configuration:** TypeScript, JSX, databases, and frontend bundling work out of the box.
- **Performance First:** Direct use of Bun's native APIs without abstraction overhead.
- **Progressive Enhancement:** Start simple, add complexity only when needed.
- **Type-Safe Everything:** Full type inference from routes to database queries to RPC clients.

---

## 1. Core Architecture Layers

### Layer 1: Foundation (Bun Runtime Integration)

**Purpose:** Direct integration with Bun v1.3's built-in capabilities

**Components:**

#### 1.1 HTTP Server Engine
- Wraps `Bun.serve()` with enhanced routing capabilities
- Native support for HTTP/2, WebSocket, and Server-Sent Events
- Built-in compression and request deduplication
- Connection pooling and keep-alive management
- Zero-copy file serving using `Bun.file()`

#### 1.2 Database Layer (`BuenoDB`)
- Unified interface over `bun:sql` (PostgreSQL, MySQL, SQLite)
- Automatic driver detection from connection string
- Connection pooling with configurable limits
- Query pipelining for batch operations
- Transaction support with nested transactions
- Type generation from database schema
- Migration system with rollback support

#### 1.3 Caching Layer (`BuenoCache`)
- Built on `Bun.redis` native client
- Key-value storage with TTL support
- Pub/sub for distributed events
- Cache-aside and write-through patterns
- Distributed locking primitives
- Session storage backend

#### 1.4 Storage Layer (`BuenoStorage`)
- S3-compatible storage using `Bun.s3`
- Presigned URL generation
- Streaming uploads/downloads
- Multi-part upload support
- Local filesystem fallback for development

#### 1.5 Security Primitives
- Password hashing using `Bun.password` (argon2, bcrypt)
- CSRF token generation via `Bun.CSRF`
- Secret management with `Bun.secrets` (OS keychain integration)
- JWT signing and verification
- Rate limiting with token bucket algorithm

---

### Layer 2: Router & Request Processing

**Purpose:** Ultra-fast request routing with type-safe context

**Components:**

#### 2.1 Smart Router System
- **RegExpRouter:** Compiled regex patterns for maximum speed
- **TreeRouter:** Radix tree for deeply nested routes
- **LinearRouter:** Simple array matching for <10 routes
- **Auto-selection:** Automatically choose optimal router based on route count/complexity

#### 2.2 Route Definition API
```
HTTP Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD
Path Patterns: /users/:id, /files/*, /api/:version/users/:id
Route Groups: app.route('/api', apiRoutes)
Nested Routes: Support for modular route composition
```

#### 2.3 Context System (`BuenoContext`)
- Request wrapper with helper methods
- Response builder with chaining
- Variable storage (type-safe `c.set()` / `c.get()`)
- Validator integration
- Database/cache/storage access
- User/session management

#### 2.4 Middleware Pipeline
- Async middleware with `await next()`
- Context mutation with type inference
- Early termination support
- Error boundary handling
- Built-in middleware:
  - CORS
  - Logger
  - Auth (JWT, Session, API Key)
  - Rate Limiter
  - Request ID
  - Compression
  - Security Headers
  - CSRF Protection

---

### Layer 3: Type Safety & Validation

**Purpose:** End-to-end type safety from request to response

**Components:**

#### 3.1 Schema Validation System
- **Multi-validator support:** Zod, Valibot, ArkType, Typia, TypeBox
- **Standard Schema API:** Common interface for all validators
- **Validation targets:** JSON body, Query params, Route params, Headers, Form data, Cookies
- **Custom validators:** Framework-agnostic validation interface

#### 3.2 Type Inference Engine
- Automatic type extraction from validators
- Union types for multiple status codes
- Optional/required field inference
- Generic constraints for type safety

#### 3.3 Database Type System
- Generate TypeScript types from SQL schema
- Infer result types from queries
- Type-safe query builders (optional)
- Prepared statement typing

---

### Layer 4: RPC System (Type-Safe API Client)

**Purpose:** Automatically generate fully-typed API clients

**Components:**

#### 4.1 Type Export System
- Export route types: `export type AppType = typeof app`
- Namespace isolation for multiple API versions
- Monorepo support with workspace types

#### 4.2 Client Generator
- `bc<AppType>()` creates typed client (bueno-client)
- Method inference: `client.api.users.$get()`
- Parameter typing from validators
- Response typing from handlers
- Status code branching

#### 4.3 Runtime Features
- Automatic request serialization
- Response deserialization
- Error handling with typed errors
- Request/response interceptors
- Retry logic with exponential backoff

#### 4.4 Advanced Features
- **Context Extraction:** `tryGetContext()` helper
- **URL Type Safety:** Generic base URL parameter
- **Request Deduplication:** Automatic caching of identical requests
- **Optimistic Updates:** Client-side state management integration

---

### Layer 5: Frontend Integration

**Purpose:** Seamless full-stack development experience

**Components:**

#### 5.1 Development Server
- Serve `.html` files with `Bun.serve()`
- Automatic bundling of React/Vue/Svelte/Solid
- TypeScript/JSX transpilation (zero config)
- CSS imports and bundling
- Asset handling (images, fonts, etc.)
- Hot Module Replacement (HMR)
- Browser console streaming to terminal

#### 5.2 Production Bundler
- Code splitting by route
- Tree shaking and dead code elimination
- Minification and compression
- Source map generation
- CSS extraction and optimization
- Asset optimization (image compression, etc.)

#### 5.3 Rendering Strategies
- **SPA (Single Page Application):** Client-side rendering only
- **SSR (Server-Side Rendering):** Render on request
- **SSG (Static Site Generation):** Pre-render at build time
- **ISR (Incremental Static Regeneration):** Hybrid SSG + SSR
- **Island Architecture:** Partial hydration for performance

#### 5.4 File-Based Routing (Optional)
- Next.js-style routing: `pages/api/users/[id].ts`
- Layout nesting: `_layout.tsx` for shared layouts
- API routes: Automatic endpoint generation
- Middleware: `_middleware.ts` for route-level middleware
- Dynamic imports: Code splitting by route

---

### Layer 6: Module System (Nest-Inspired)

**Purpose:** Large application organization with modularity and DI

**Components:**

#### 6.1 Module Definition
- `@Module()` decorator for module metadata
- Import/export system for module composition
- Provider registration (services, repositories)
- Controller registration (route handlers)
- Global modules for shared services

#### 6.2 Dependency Injection
- Constructor injection
- Property injection
- Interface-based injection with tokens
- Scope management (singleton, request, transient)
- Circular dependency resolution
- Lazy loading support

#### 6.3 Provider System
- **Services:** Business logic layer
- **Repositories:** Database access layer
- **Guards:** Authorization checks
- **Interceptors:** Response transformation
- **Pipes:** Data transformation and validation
- **Filters:** Exception handling

#### 6.4 Lifecycle Hooks
- `onModuleInit()`: Module initialization
- `onApplicationBootstrap()`: App startup
- `onModuleDestroy()`: Module cleanup
- `beforeApplicationShutdown()`: Graceful shutdown
- Request lifecycle hooks

---

### Layer 7: Testing & Observability

**Purpose:** Built-in testing and production monitoring

**Components:**

#### 7.1 Testing Framework
- Integration with `bun:test`
- Test context helpers
- Mock database/cache/storage
- Request/response testing utilities
- Snapshot testing for API responses
- Test fixtures and factories
- Coverage reporting

#### 7.2 Logging System
- Structured logging with JSON output
- Log levels (debug, info, warn, error)
- Context-aware logging (request ID, user ID)
- Performance metrics logging
- Integration with external log aggregators

#### 7.3 Metrics & Tracing
- Request duration tracking
- Database query performance
- Cache hit/miss ratios
- Memory and CPU usage
- Distributed tracing support (OpenTelemetry)
- Health check endpoints

---

## 2. Application Structure

### Standard Project Layout

```
my-bueno-app/
├── server/
│   ├── main.ts                    # Application entry point
│   ├── app.module.ts              # Root module
│   │
│   ├── modules/                   # Feature modules
│   │   ├── users/
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   ├── users.repository.ts
│   │   │   └── dto/
│   │   │       ├── create-user.dto.ts
│   │   │       └── update-user.dto.ts
│   │   │
│   │   ├── posts/
│   │   │   └── ... (similar structure)
│   │   │
│   │   └── auth/
│   │       ├── auth.module.ts
│   │       ├── auth.controller.ts
│   │       ├── auth.service.ts
│   │       ├── guards/
│   │       │   └── jwt.guard.ts
│   │       └── strategies/
│   │           └── jwt.strategy.ts
│   │
│   ├── common/                    # Shared utilities
│   │   ├── middleware/
│   │   ├── decorators/
│   │   ├── filters/
│   │   └── interceptors/
│   │
│   ├── config/                    # Configuration
│   │   ├── database.config.ts
│   │   ├── cache.config.ts
│   │   └── app.config.ts
│   │
│   ├── database/                  # Database assets
│   │   ├── migrations/
│   │   ├── seeds/
│   │   └── schema.ts
│   │
│   └── types/                     # Type definitions
│       └── app.types.ts
│
├── client/                        # Frontend application
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── api/
│   │   │   └── client.ts         # RPC client
│   │   ├── components/
│   │   ├── pages/
│   │   └── styles/
│   └── public/
│
├── shared/                        # Shared between client/server
│   └── types/
│
├── tests/                         # E2E and integration tests
│   ├── integration/
│   └── e2e/
│
├── bueno.config.ts                 # Framework configuration
└── package.json
```

---

## 3. Feature Matrix

### Core Features (MVP)

| Category | Features |
|----------|----------|
| **HTTP** | GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS |
| **Routing** | Path params, Query params, Wildcards, RegExp patterns, Route groups |
| **Request** | JSON, Form data, File uploads, Streaming, Headers, Cookies |
| **Response** | JSON, HTML, Text, Stream, File, Redirect, Status codes |
| **Validation** | Zod, Valibot, ArkType, Typia, Custom validators |
| **Database** | PostgreSQL, MySQL, SQLite via `bun:sql` |
| **Caching** | Redis via `Bun.redis` |
| **Storage** | S3-compatible via `Bun.s3` |
| **Auth** | JWT, Sessions, API Keys, OAuth helpers |
| **Security** | CORS, CSRF, Rate limiting, Secure headers, Password hashing |
| **WebSocket** | Connection upgrade, Pub/sub, Per-connection data |
| **Middleware** | Async pipeline, Context mutation, Error boundaries |
| **Testing** | `bun:test` integration, Mocking, Fixtures |

### Advanced Features (Post-MVP)

| Category | Features |
|----------|----------|
| **Modules** | Dependency injection, Module system, Providers |
| **Frontend** | Dev server, HMR, Bundling, SSR/SSG/ISR |
| **RPC** | Type-safe client generation, Status code branching |
| **CLI** | Project scaffolding, Code generation, Migrations |
| **Observability** | Structured logging, Metrics, Tracing |
| **Deployment** | Single-file executables, Docker images, Cloud platforms |
| **GraphQL** | Optional GraphQL server integration |
| **Queues** | Background job processing with Redis |

---

## 4. Configuration System

### bueno.config.ts

```typescript
export default {
  // Server configuration
  server: {
    port: 3000,
    hostname: 'localhost',
    development: {
      hmr: true,
      console: true,
    },
  },

  // Database configuration
  database: {
    url: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
    migrations: './database/migrations',
    seeds: './database/seeds',
  },

  // Cache configuration
  cache: {
    url: process.env.REDIS_URL,
    ttl: 3600,
    keyPrefix: 'bueno:',
  },

  // Storage configuration
  storage: {
    driver: 's3',
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION,
  },

  // Auth configuration
  auth: {
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: '7d',
    },
    session: {
      secret: process.env.SESSION_SECRET,
      maxAge: 86400,
    },
  },

  // Frontend configuration
  frontend: {
    entry: './client/index.html',
    outDir: './dist/public',
    ssr: true,
    ssg: ['/', '/about'],
  },

  // Module configuration
  modules: {
    autoImport: true,
    lazyLoad: false,
  },
}
```

---

## 5. Key Design Decisions

### 5.1 Bun-Exclusive (No Multi-Runtime)
**Decision:** Build exclusively for Bun v1.3+, no Node.js or Deno support.

**Rationale:**
- Unlock maximum performance by using Bun's native APIs directly
- Avoid abstraction layers that slow down development and runtime
- Smaller bundle size (no runtime detection code)
- Simpler codebase and documentation

**Trade-offs:**
- Cannot run on other runtimes
- Smaller ecosystem initially
- Requires Bun installation

### 5.2 Zero Configuration Philosophy
**Decision:** Sensible defaults for everything, configuration only when needed.

**Rationale:**
- TypeScript/JSX work out of the box (Bun transpiles natively)
- Database connections auto-detect driver from URL scheme
- Hot reload enabled in development automatically
- Frontend bundling requires zero config
- Production builds optimized by default

**Trade-offs:**
- Less flexibility for edge cases
- May need escape hatches for advanced users

### 5.3 Type-Safety First
**Decision:** Full type inference from routes to RPC clients to database queries.

**Rationale:**
- Catch errors at compile time, not runtime
- Better autocomplete and IntelliSense
- Self-documenting APIs
- Easier refactoring

**Trade-offs:**
- More complex type system
- Steeper learning curve for TypeScript beginners
- Slower TypeScript compilation in large projects

### 5.4 Progressive Complexity
**Decision:** Simple apps stay simple, complex apps get powerful features.

**Rationale:**
- Start with basic HTTP server in 10 lines of code
- Add database when needed (one line of config)
- Enable modules/DI only for large applications
- Frontend is optional

**Trade-offs:**
- Need to document multiple "levels" of framework usage
- Users might not discover advanced features

### 5.5 Batteries Included
**Decision:** Core features built-in (database, cache, storage, auth, testing).

**Rationale:**
- Faster development (no hunting for packages)
- Better performance (native implementations)
- Consistent APIs across features
- Easier upgrades (no dependency hell)

**Trade-offs:**
- Larger framework size
- Less flexibility in choosing implementations
- Framework must maintain more code

---

## 6. Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Cold Start** | <50ms | Time from `bun run` to first request handled |
| **Request Throughput** | >100k req/s | Simple "Hello World" endpoint |
| **Database Query** | <5ms p99 | Single row SELECT with connection pool |
| **RPC Client Overhead** | <1ms | Client wrapper vs direct fetch |
| **Hot Reload** | <100ms | Time from file save to server reload |
| **Memory Usage** | <50MB | Idle server with all features enabled |
| **Bundle Size** | <2MB | Framework code without dependencies |

---

## 7. Roadmap

### Phase 1: Core (v0.1-0.3)
- HTTP server with routing
- Middleware system
- Context API
- Database integration (`bun:sql`)
- Validation (Zod integration)
- Basic testing utilities

### Phase 2: Full-Stack (v0.4-0.6)
- Frontend dev server
- Hot Module Replacement
- RPC client generation
- Cache layer (Redis)
- Storage layer (S3)
- Auth middleware (JWT, Sessions)

### Phase 3: Enterprise (v0.7-0.9)
- Module system with DI
- File-based routing
- SSR/SSG support
- CLI for scaffolding
- Production bundler
- Observability (logging, metrics)

### Phase 4: v1.0
- Full documentation
- Migration guides
- Performance benchmarks
- Production-ready stability
- Plugin system
- Ecosystem integrations

---

## 8. Success Metrics

**Adoption:**
- 10k+ GitHub stars in first year
- 100+ community plugins
- Used by 1k+ production applications

**Performance:**
- Top 3 in TechEmpower benchmarks for Bun category
- Faster than Express/Fastify on Bun
- Comparable to raw `Bun.serve()` performance

**Developer Experience:**
- <5 minutes from install to production deploy
- <10 lines of code for basic CRUD API
- 90%+ TypeScript type coverage
- <100ms hot reload times

---

## 9. Ecosystem & Extensions

### Official Packages
- `@bueno/cli` - Project scaffolding and code generation
- `@bueno/devtools` - Browser extension for debugging
- `@bueno/graphql` - GraphQL server integration
- `@bueno/queues` - Background job processing
- `@bueno/admin` - Auto-generated admin panel
- `@bueno/docs` - API documentation generator

### Community Extensions
- Database ORMs (Drizzle, Prisma adapters)
- Authentication providers (Auth0, Clerk, etc.)
- Payment integrations (Stripe, PayPal)
- Email services (SendGrid, Resend)
- Monitoring (Sentry, DataDog)

---

## 10. Migration & Compatibility

### From Hono
- Similar routing API (easy mental model)
- Middleware pattern compatible
- RPC concepts transferable
- Validation system similar

### From Express
- Middleware pattern similar
- Route handler signatures compatible
- Request/response helpers familiar

### From Nest
- Module system nearly identical
- Dependency injection compatible
- Decorator-based approach similar
- Provider pattern transferable

### From Next.js
- File-based routing optional
- SSR/SSG concepts similar
- API routes pattern compatible
- Full-stack integration familiar

---

## Conclusion

Bueno is designed to be the fastest, most developer-friendly full-stack framework for Bun. By embracing Bun's native capabilities and avoiding multi-runtime abstractions, Bueno achieves performance that rivals raw `Bun.serve()` while providing the structure and features needed for production applications.

The architecture balances simplicity for small projects with power for enterprise applications, using progressive enhancement to ensure developers only pay for what they use. With built-in database, caching, storage, and authentication, Bueno provides everything needed to build and deploy modern web applications—all in one cohesive package.
