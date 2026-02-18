/**
 * Cloud Platform Deployment Templates
 *
 * Template functions for generating deployment configuration files
 * for various cloud platforms (Render, Fly.io, Railway)
 */

/**
 * Valid deployment platforms
 */
export type DeployPlatform = 'render' | 'fly' | 'railway';

/**
 * Get Render.com deployment configuration (render.yaml)
 *
 * Blueprint format for Render.com with web service and optional database
 */
export function getRenderYamlTemplate(projectName: string, database?: string): string {
	const kebabName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
	
	let databaseSection = '';
	let envVars = '';

	if (database === 'postgresql') {
		databaseSection = `
  # PostgreSQL Database
  - type: pserv
    name: ${kebabName}-db
    env: docker
    region: oregon
    plan: starter
    envVars:
      - key: POSTGRES_USER
        generateValue: true
      - key: POSTGRES_PASSWORD
        generateValue: true
      - key: POSTGRES_DB
        value: ${kebabName}
    disk:
      name: postgres-data
      mountPath: /var/lib/postgresql/data
      sizeGB: 10

`;
		envVars = `
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: ${kebabName}-db
          property: connectionString
      - key: NODE_ENV
        value: production
      - key: BUN_ENV
        value: production
`;
	} else if (database === 'mysql') {
		databaseSection = `
  # MySQL Database (using Render's managed MySQL)
  - type: pserv
    name: ${kebabName}-db
    env: docker
    region: oregon
    plan: starter
    envVars:
      - key: MYSQL_ROOT_PASSWORD
        generateValue: true
      - key: MYSQL_USER
        generateValue: true
      - key: MYSQL_PASSWORD
        generateValue: true
      - key: MYSQL_DATABASE
        value: ${kebabName}
    disk:
      name: mysql-data
      mountPath: /var/lib/mysql
      sizeGB: 10

`;
		envVars = `
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: ${kebabName}-db
          property: connectionString
      - key: NODE_ENV
        value: production
      - key: BUN_ENV
        value: production
`;
	} else {
		envVars = `
    envVars:
      - key: NODE_ENV
        value: production
      - key: BUN_ENV
        value: production
`;
	}

	return `# ${projectName} - Render.com Deployment Configuration
# https://render.com/docs/blueprint-spec

services:
  # Web Service
  - type: web
    name: ${kebabName}
    env: docker
    region: oregon
    plan: starter
    branch: main
    dockerfilePath: ./Dockerfile
    # dockerContext: .
    numInstances: 1
    healthCheckPath: /health
${envVars}    # Auto-deploy on push to main branch
    autoDeploy: true
${databaseSection}
# Blueprint metadata
metadata:
  name: ${projectName}
  description: A Bueno application deployed on Render
`;
}

/**
 * Get Fly.io deployment configuration (fly.toml)
 *
 * Fly.io app configuration with HTTP service and auto-scaling
 */
export function getFlyTomlTemplate(projectName: string): string {
	const kebabName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

	return `# ${projectName} - Fly.io Deployment Configuration
# https://fly.io/docs/reference/configuration/

app = "${kebabName}"
primary_region = "sea"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  BUN_ENV = "production"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

[http_service.concurrency]
  type = "connections"
  hard_limit = 100
  soft_limit = 80

[[http_service.checks]]
  grace_period = "10s"
  interval = "30s"
  method = "GET"
  timeout = "5s"
  path = "/health"

  [http_service.checks.headers]
    Content-Type = "application/json"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512

[[mounts]]
  source = "data"
  destination = "/app/data"
  initial_size = "1GB"

# Scale configuration
# Use: fly scale count 2  # Scale to 2 machines
# Use: fly scale vm shared-cpu-2x --memory 1024  # Upgrade VM

# Secrets (set via: fly secrets set KEY=VALUE)
# DATABASE_URL=your-database-url
# Any other sensitive environment variables
`;
}

/**
 * Get Railway deployment configuration (railway.toml)
 *
 * Railway configuration with builder settings and health checks
 */
export function getRailwayTomlTemplate(projectName: string): string {
	const kebabName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

	return `# ${projectName} - Railway Deployment Configuration
# https://docs.railway.app/reference/config-as-code

[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "bun run dist/main.js"
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3

# Environment variables
# Set these in Railway dashboard or via CLI:
# railway variables set NODE_ENV=production
# railway variables set DATABASE_URL=your-database-url

[[services]]
name = "${kebabName}"

[services.variables]
NODE_ENV = "production"
BUN_ENV = "production"
PORT = "3000"

# Health check configuration
[[services.healthchecks]]
path = "/health"
interval = 30
timeout = 10
threshold = 3

# Resource configuration
# Adjust in Railway dashboard or via CLI:
# railway up --memory 512 --cpu 0.5

# Scaling configuration
# Use Railway's autoscaling in dashboard:
# Min instances: 0 (scale to zero)
# Max instances: 3
# Target CPU: 70%
# Target Memory: 80%
`;
}

/**
 * Get deployment template for a specific platform
 */
export function getDeployTemplate(
	platform: DeployPlatform,
	projectName: string,
	database?: string,
): string {
	switch (platform) {
		case 'render':
			return getRenderYamlTemplate(projectName, database);
		case 'fly':
			return getFlyTomlTemplate(projectName);
		case 'railway':
			return getRailwayTomlTemplate(projectName);
		default:
			throw new Error(`Unknown deployment platform: ${platform}`);
	}
}

/**
 * Get the filename for a deployment configuration
 */
export function getDeployFilename(platform: DeployPlatform): string {
	switch (platform) {
		case 'render':
			return 'render.yaml';
		case 'fly':
			return 'fly.toml';
		case 'railway':
			return 'railway.toml';
		default:
			throw new Error(`Unknown deployment platform: ${platform}`);
	}
}

/**
 * Get deployment platform display name
 */
export function getDeployPlatformName(platform: DeployPlatform): string {
	switch (platform) {
		case 'render':
			return 'Render.com';
		case 'fly':
			return 'Fly.io';
		case 'railway':
			return 'Railway';
		default:
			return platform;
	}
}