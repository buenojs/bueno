/**
 * Docker Templates
 *
 * Template functions for generating Docker-related files
 */

/**
 * Get Dockerfile template
 * 
 * Multi-stage build using oven/bun image for production
 */
export function getDockerfileTemplate(projectName: string, database?: string): string {
	return `# ${projectName} - Production Dockerfile
# Multi-stage build for optimized production image

# Stage 1: Install dependencies
FROM oven/bun:1 AS deps

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Stage 2: Build the application
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install all dependencies (including devDependencies for build)
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Stage 3: Production image
FROM oven/bun:1 AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV BUN_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 bunjs \\
    && adduser --system --uid 1001 --ingroup bunjs bunuser

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy config files if they exist
COPY --from=builder /app/bueno.config.ts* ./

# Set proper ownership
RUN chown -R bunuser:bunjs /app

# Switch to non-root user
USER bunuser

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["bun", "run", "dist/main.js"]
`;
}

/**
 * Get .dockerignore template
 * 
 * Patterns to exclude from Docker build context
 */
export function getDockerignoreTemplate(): string {
	return `# Dependencies
node_modules/

# Build output
dist/

# Environment files
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Git
.git/
.gitignore

# Docker
Dockerfile
docker-compose*.yml
.dockerignore

# Test files
tests/
coverage/
*.test.ts
*.spec.ts

# Documentation
*.md
!README.md

# Database files (local)
*.db
*.sqlite
*.sqlite3

# Logs
*.log
logs/

# Misc
.editorconfig
.eslintrc*
.prettierrc*
tsconfig.json
`;
}

/**
 * Get docker-compose.yml template
 * 
 * Local development setup with optional database services
 */
export function getDockerComposeTemplate(projectName: string, database?: string): string {
	const kebabName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
	
	let databaseServices = '';
	let dependsOn = '';

	if (database === 'postgresql') {
		databaseServices = `
  # PostgreSQL Database
  postgres:
    image: postgres:16-alpine
    container_name: ${kebabName}-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: \${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: \${POSTGRES_DB:-${kebabName}}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "\${POSTGRES_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-postgres} -d \${POSTGRES_DB:-${kebabName}}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - bueno-network

`;
		dependsOn = `
    depends_on:
      postgres:
        condition: service_healthy
`;
	} else if (database === 'mysql') {
		databaseServices = `
  # MySQL Database
  mysql:
    image: mysql:8.0
    container_name: ${kebabName}-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: \${MYSQL_ROOT_PASSWORD:-root}
      MYSQL_USER: \${MYSQL_USER:-mysql}
      MYSQL_PASSWORD: \${MYSQL_PASSWORD:-mysql}
      MYSQL_DATABASE: \${MYSQL_DATABASE:-${kebabName}}
    volumes:
      - mysql_data:/var/lib/mysql
    ports:
      - "\${MYSQL_PORT:-3306}:3306"
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p\${MYSQL_ROOT_PASSWORD:-root}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - bueno-network

`;
		dependsOn = `
    depends_on:
      mysql:
        condition: service_healthy
`;
	}

	const volumes = database === 'postgresql' 
		? `\nvolumes:
  postgres_data:
    driver: local
`
		: database === 'mysql'
		? `\nvolumes:
  mysql_data:
    driver: local
`
		: '';

	const databaseEnv = database === 'postgresql'
		? `      DATABASE_URL: postgresql://\${POSTGRES_USER:-postgres}:\${POSTGRES_PASSWORD:-postgres}@postgres:5432/\${POSTGRES_DB:-${kebabName}}
`
		: database === 'mysql'
		? `      DATABASE_URL: mysql://\${MYSQL_USER:-mysql}:\${MYSQL_PASSWORD:-mysql}@mysql:3306/\${MYSQL_DATABASE:-${kebabName}}
`
		: '';

	return `# ${projectName} - Docker Compose for Local Development
# Usage: docker-compose up -d

services:
  # Application Service
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ${kebabName}-app
    restart: unless-stopped
    ports:
      - "\${APP_PORT:-3000}:3000"
    environment:
      NODE_ENV: production
      BUN_ENV: production
${databaseEnv}${dependsOn}    networks:
      - bueno-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
${databaseServices}networks:
  bueno-network:
    driver: bridge
${volumes}
`;
}

/**
 * Get Docker environment variables template
 * 
 * Environment variables for Docker Compose
 */
export function getDockerEnvTemplate(projectName: string, database?: string): string {
	const kebabName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
	
	let dbEnv = '';
	
	if (database === 'postgresql') {
		dbEnv = `
# PostgreSQL Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=${kebabName}
POSTGRES_PORT=5432
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/${kebabName}
`;
	} else if (database === 'mysql') {
		dbEnv = `
# MySQL Configuration
MYSQL_ROOT_PASSWORD=root
MYSQL_USER=mysql
MYSQL_PASSWORD=mysql
MYSQL_DATABASE=${kebabName}
MYSQL_PORT=3306
DATABASE_URL=mysql://mysql:mysql@localhost:3306/${kebabName}
`;
	}

	return `# ${projectName} - Docker Environment Variables
# Copy this file to .env and update values as needed

# Application
APP_PORT=3000
NODE_ENV=production
${dbEnv}`;
}