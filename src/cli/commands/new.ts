/**
 * New Command
 *
 * Create a new Bueno project
 */

import { defineCommand } from './index';
import { getOption, hasFlag, getOptionValues, type ParsedArgs } from '../core/args';
import { cliConsole, colors, printTable } from '../core/console';
import { prompt, confirm, select, isInteractive } from '../core/prompt';
import { spinner, runTasks, type TaskOptions } from '../core/spinner';
import {
	fileExists,
	writeFile,
	createDirectory,
	copyDirectory,
	joinPaths,
} from '../utils/fs';
import { kebabCase } from '../utils/strings';
import { CLIError, CLIErrorType } from '../index';
import {
	getDockerfileTemplate,
	getDockerignoreTemplate,
	getDockerComposeTemplate,
	getDockerEnvTemplate,
} from '../templates/docker';
import {
	type DeployPlatform,
	getDeployTemplate,
	getDeployFilename,
	getDeployPlatformName,
} from '../templates/deploy';

/**
 * Project templates
 */
type ProjectTemplate = 'default' | 'minimal' | 'fullstack' | 'api';

/**
 * Frontend frameworks
 */
type FrontendFramework = 'react' | 'vue' | 'svelte' | 'solid';

/**
 * Database drivers
 */
type DatabaseDriver = 'sqlite' | 'postgresql' | 'mysql';

/**
 * Project configuration
 */
interface ProjectConfig {
	name: string;
	template: ProjectTemplate;
	framework: FrontendFramework;
	database: DatabaseDriver;
	skipInstall: boolean;
	skipGit: boolean;
	docker: boolean;
	deploy: DeployPlatform[];
}

/**
 * Validate project name
 */
function validateProjectName(name: string): boolean | string {
	if (!name || name.length === 0) {
		return 'Project name is required';
	}

	if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
		return 'Project name can only contain letters, numbers, hyphens, and underscores';
	}

	if (name.startsWith('-') || name.startsWith('_')) {
		return 'Project name cannot start with a hyphen or underscore';
	}

	if (name.length > 100) {
		return 'Project name is too long (max 100 characters)';
	}

	return true;
}

/**
 * Get package.json template
 */
function getPackageJsonTemplate(config: ProjectConfig): string {
	const dependencies: Record<string, string> = {
		bueno: '^0.1.0',
	};

	const devDependencies: Record<string, string> = {
		'@types/bun': 'latest',
		typescript: '^5.3.0',
	};

	if (config.template === 'fullstack' || config.template === 'default') {
		dependencies.zod = '^4.0.0';
	}

	const scripts: Record<string, string> = {
		dev: 'bun run --watch server/main.ts',
		build: 'bun build ./server/main.ts --outdir ./dist --target bun',
		start: 'bun run dist/main.js',
		test: 'bun test',
	};

	if (config.template === 'fullstack') {
		scripts['dev:frontend'] = 'bun run --watch client/index.html';
	}

	return JSON.stringify(
		{
			name: kebabCase(config.name),
			version: '0.1.0',
			type: 'module',
			scripts,
			dependencies,
			devDependencies,
		},
		null,
		2,
	);
}

/**
 * Get tsconfig.json template
 */
function getTsConfigTemplate(): string {
	return JSON.stringify(
		{
			compilerOptions: {
				target: 'ESNext',
				module: 'ESNext',
				moduleResolution: 'bundler',
				strict: true,
				skipLibCheck: true,
				esModuleInterop: true,
				allowSyntheticDefaultImports: true,
				jsx: 'react-jsx',
				paths: {
					bueno: ['./node_modules/bueno/dist/index.d.ts'],
				},
			},
			include: ['server/**/*', 'client/**/*'],
			exclude: ['node_modules', 'dist'],
		},
		null,
		2,
	);
}

/**
 * Get main.ts template
 */
function getMainTemplate(config: ProjectConfig): string {
	if (config.template === 'minimal') {
		return `import { createServer } from 'bueno';

const app = createServer();

app.router.get('/', () => {
  return { message: 'Hello, Bueno!' };
});

await app.listen(3000);
`;
	}

	return `import { createApp, Module, Controller, Get, Injectable } from 'bueno';
import type { Context } from 'bueno';

// Services
@Injectable()
export class AppService {
  findAll() {
    return { message: 'Welcome to Bueno!', items: [] };
  }
}

// Controllers
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  findAll(ctx: Context) {
    return this.appService.findAll();
  }

  @Get('health')
  health(ctx: Context) {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}

// Module
@Module({
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

// Bootstrap
const app = createApp(AppModule);
await app.listen(3000);
`;
}

/**
 * Get bueno.config.ts template
 */
function getConfigTemplate(config: ProjectConfig): string {
	const dbConfig = config.database === 'sqlite'
		? `{ url: 'sqlite:./data.db' }`
		: `{ url: process.env.DATABASE_URL ?? '${config.database}://localhost/${kebabCase(config.name)}' }`;

	return `import { defineConfig } from 'bueno';

export default defineConfig({
  server: {
    port: 3000,
    host: 'localhost',
  },

  database: ${dbConfig},

  logger: {
    level: 'info',
    pretty: true,
  },

  health: {
    enabled: true,
    healthPath: '/health',
    readyPath: '/ready',
  },
});
`;
}

/**
 * Get .env.example template
 */
function getEnvExampleTemplate(config: ProjectConfig): string {
	if (config.database === 'sqlite') {
		return `# Bueno Environment Variables
NODE_ENV=development
`;
	}

	return `# Bueno Environment Variables
NODE_ENV=development
DATABASE_URL=${config.database}://user:password@localhost:5432/${kebabCase(config.name)}
`;
}

/**
 * Get .gitignore template
 */
function getGitignoreTemplate(): string {
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

# Logs
*.log
logs/

# Database
*.db
*.sqlite
*.sqlite3

# Test coverage
coverage/
`;
}

/**
 * Get README.md template
 */
function getReadmeTemplate(config: ProjectConfig): string {
	return `# ${config.name}

A Bueno application.

## Getting Started

\`\`\`bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build

# Start production server
bun run start
\`\`\`

## Project Structure

\`\`\`
├── server/           # Server-side code
│   ├── main.ts       # Entry point
│   ├── modules/      # Feature modules
│   └── database/     # Database files
├── client/           # Client-side code (if applicable)
├── tests/            # Test files
└── bueno.config.ts   # Configuration
\`\`\`

## Learn More

- [Bueno Documentation](https://github.com/sivaraj/bueno#readme)
- [Bun Documentation](https://bun.sh/docs)
`;
}

/**
 * Create project files
 */
async function createProjectFiles(
	projectPath: string,
	config: ProjectConfig,
): Promise<void> {
	const tasks: TaskOptions[] = [];

	// Create directories
	tasks.push({
		text: 'Creating project structure',
		task: async () => {
			await createDirectory(joinPaths(projectPath, 'server', 'modules', 'app'));
			await createDirectory(joinPaths(projectPath, 'server', 'common', 'middleware'));
			await createDirectory(joinPaths(projectPath, 'server', 'common', 'guards'));
			await createDirectory(joinPaths(projectPath, 'server', 'common', 'interceptors'));
			await createDirectory(joinPaths(projectPath, 'server', 'common', 'pipes'));
			await createDirectory(joinPaths(projectPath, 'server', 'common', 'filters'));
			await createDirectory(joinPaths(projectPath, 'server', 'database', 'migrations'));
			await createDirectory(joinPaths(projectPath, 'server', 'config'));
			await createDirectory(joinPaths(projectPath, 'tests', 'unit'));
			await createDirectory(joinPaths(projectPath, 'tests', 'integration'));
		},
	});

	// Create package.json
	tasks.push({
		text: 'Creating package.json',
		task: async () => {
			await writeFile(
				joinPaths(projectPath, 'package.json'),
				getPackageJsonTemplate(config),
			);
		},
	});

	// Create tsconfig.json
	tasks.push({
		text: 'Creating tsconfig.json',
		task: async () => {
			await writeFile(
				joinPaths(projectPath, 'tsconfig.json'),
				getTsConfigTemplate(),
			);
		},
	});

	// Create main.ts
	tasks.push({
		text: 'Creating server/main.ts',
		task: async () => {
			await writeFile(
				joinPaths(projectPath, 'server', 'main.ts'),
				getMainTemplate(config),
			);
		},
	});

	// Create bueno.config.ts
	tasks.push({
		text: 'Creating bueno.config.ts',
		task: async () => {
			await writeFile(
				joinPaths(projectPath, 'bueno.config.ts'),
				getConfigTemplate(config),
			);
		},
	});

	// Create .env.example
	tasks.push({
		text: 'Creating .env.example',
		task: async () => {
			await writeFile(
				joinPaths(projectPath, '.env.example'),
				getEnvExampleTemplate(config),
			);
		},
	});

	// Create .gitignore
	tasks.push({
		text: 'Creating .gitignore',
		task: async () => {
			await writeFile(
				joinPaths(projectPath, '.gitignore'),
				getGitignoreTemplate(),
			);
		},
	});

	// Create README.md
	tasks.push({
		text: 'Creating README.md',
		task: async () => {
			await writeFile(
				joinPaths(projectPath, 'README.md'),
				getReadmeTemplate(config),
			);
		},
	});

	// Create Docker files if enabled
	if (config.docker) {
		tasks.push({
			text: 'Creating Dockerfile',
			task: async () => {
				await writeFile(
					joinPaths(projectPath, 'Dockerfile'),
					getDockerfileTemplate(config.name, config.database),
				);
			},
		});

		tasks.push({
			text: 'Creating .dockerignore',
			task: async () => {
				await writeFile(
					joinPaths(projectPath, '.dockerignore'),
					getDockerignoreTemplate(),
				);
			},
		});

		tasks.push({
			text: 'Creating docker-compose.yml',
			task: async () => {
				await writeFile(
					joinPaths(projectPath, 'docker-compose.yml'),
					getDockerComposeTemplate(config.name, config.database),
				);
			},
		});

		tasks.push({
			text: 'Creating .env.docker',
			task: async () => {
				await writeFile(
					joinPaths(projectPath, '.env.docker'),
					getDockerEnvTemplate(config.name, config.database),
				);
			},
		});
	}

	// Create deployment configuration files
	for (const platform of config.deploy) {
		const filename = getDeployFilename(platform);
		tasks.push({
			text: `Creating ${filename} for ${getDeployPlatformName(platform)}`,
			task: async () => {
				await writeFile(
					joinPaths(projectPath, filename),
					getDeployTemplate(platform, config.name, config.database),
				);
			},
		});
	}

	await runTasks(tasks);
}

/**
 * Handle new command
 */
async function handleNew(args: ParsedArgs): Promise<void> {
	// Get project name
	let name = args.positionals[0];
	const useDefaults = hasFlag(args, 'yes') || hasFlag(args, 'y');

	// Interactive prompts if no name provided
	if (!name && isInteractive()) {
		name = await prompt('Project name:', {
			validate: validateProjectName,
		});
	}

	if (!name) {
		throw new CLIError(
			'Project name is required. Usage: bueno new <project-name>',
			CLIErrorType.INVALID_ARGS,
		);
	}

	const validation = validateProjectName(name);
	if (validation !== true) {
		throw new CLIError(validation as string, CLIErrorType.INVALID_ARGS);
	}

	// Get options
	let template = getOption(args, 'template', {
		name: 'template',
		alias: 't',
		type: 'string',
		description: '',
	}) as ProjectTemplate;

	let framework = getOption(args, 'framework', {
		name: 'framework',
		alias: 'f',
		type: 'string',
		description: '',
	}) as FrontendFramework;

	let database = getOption(args, 'database', {
		name: 'database',
		alias: 'd',
		type: 'string',
		description: '',
	}) as DatabaseDriver;

	const skipInstall = hasFlag(args, 'skip-install');
	const skipGit = hasFlag(args, 'skip-git');
	const docker = hasFlag(args, 'docker');
	
	// Get deployment platforms (can be specified multiple times)
	const deployPlatforms = getOptionValues(args, 'deploy');
	const validPlatforms: DeployPlatform[] = ['render', 'fly', 'railway'];
	const deploy: DeployPlatform[] = [];
	
	for (const platform of deployPlatforms) {
		if (validPlatforms.includes(platform as DeployPlatform)) {
			if (!deploy.includes(platform as DeployPlatform)) {
				deploy.push(platform as DeployPlatform);
			}
		} else {
			throw new CLIError(
				`Invalid deployment platform: ${platform}. Valid options are: ${validPlatforms.join(', ')}`,
				CLIErrorType.INVALID_ARGS,
			);
		}
	}

	// Interactive prompts for missing options
	if (!useDefaults && isInteractive()) {
		if (!template) {
			template = await select<ProjectTemplate>(
				'Select a template:',
				[
					{ value: 'default', name: 'Default - Standard project with modules and database' },
					{ value: 'minimal', name: 'Minimal - Bare minimum project structure' },
					{ value: 'fullstack', name: 'Fullstack - Full-stack project with SSR and auth' },
					{ value: 'api', name: 'API - API-only project without frontend' },
				],
				{ default: 'default' },
			);
		}

		if ((template === 'fullstack' || template === 'default') && !framework) {
			framework = await select<FrontendFramework>(
				'Select a frontend framework:',
				[
					{ value: 'react', name: 'React' },
					{ value: 'vue', name: 'Vue' },
					{ value: 'svelte', name: 'Svelte' },
					{ value: 'solid', name: 'Solid' },
				],
				{ default: 'react' },
			);
		}

		if (!database) {
			database = await select<DatabaseDriver>(
				'Select a database:',
				[
					{ value: 'sqlite', name: 'SQLite - Local file-based database' },
					{ value: 'postgresql', name: 'PostgreSQL - Production-ready relational database' },
					{ value: 'mysql', name: 'MySQL - Popular relational database' },
				],
				{ default: 'sqlite' },
			);
		}
	}

	// Set defaults
	template = template || 'default';
	framework = framework || 'react';
	database = database || 'sqlite';

	const config: ProjectConfig = {
		name,
		template,
		framework,
		database,
		skipInstall,
		skipGit,
		docker,
		deploy,
	};

	// Check if directory exists
	const projectPath = joinPaths(process.cwd(), kebabCase(name));
	if (await fileExists(projectPath)) {
		throw new CLIError(
			`Directory already exists: ${kebabCase(name)}`,
			CLIErrorType.FILE_EXISTS,
		);
	}

	// Display project info
	cliConsole.header(`Creating a new Bueno project: ${colors.cyan(name)}`);

	const rows = [
		['Template', template],
		['Framework', framework],
		['Database', database],
		['Docker', docker ? colors.green('Yes') : colors.red('No')],
		['Deploy', deploy.length > 0 ? colors.green(deploy.map(getDeployPlatformName).join(', ')) : colors.red('None')],
		['Install dependencies', skipInstall ? colors.red('No') : colors.green('Yes')],
		['Initialize git', skipGit ? colors.red('No') : colors.green('Yes')],
	];

	printTable(['Setting', 'Value'], rows);
	cliConsole.log('');

	// Create project
	cliConsole.subheader('Creating project files...');
	await createProjectFiles(projectPath, config);

	// Install dependencies
	if (!skipInstall) {
		cliConsole.subheader('Installing dependencies...');
		const installSpinner = spinner('Running bun install...');

		try {
			const proc = Bun.spawn(['bun', 'install'], {
				cwd: projectPath,
				stdout: 'pipe',
				stderr: 'pipe',
			});

			const exitCode = await proc.exited;

			if (exitCode === 0) {
				installSpinner.success('Dependencies installed');
			} else {
				installSpinner.warn('Failed to install dependencies. Run `bun install` manually.');
			}
		} catch {
			installSpinner.warn('Failed to install dependencies. Run `bun install` manually.');
		}
	}

	// Initialize git
	if (!skipGit) {
		cliConsole.subheader('Initializing git repository...');
		const gitSpinner = spinner('Running git init...');

		try {
			const proc = Bun.spawn(['git', 'init'], {
				cwd: projectPath,
				stdout: 'pipe',
				stderr: 'pipe',
			});

			const exitCode = await proc.exited;

			if (exitCode === 0) {
				// Add all files
				Bun.spawn(['git', 'add', '.'], { cwd: projectPath });
				Bun.spawn(['git', 'commit', '-m', 'Initial commit from Bueno CLI'], {
					cwd: projectPath,
				});
				gitSpinner.success('Git repository initialized');
			} else {
				gitSpinner.warn('Failed to initialize git. Run `git init` manually.');
			}
		} catch {
			gitSpinner.warn('Failed to initialize git. Run `git init` manually.');
		}
	}

	// Show success message
	cliConsole.log('');
	cliConsole.success(`Project created successfully!`);
	cliConsole.log('');
	cliConsole.log('Next steps:');
	cliConsole.log(`  ${colors.cyan(`cd ${kebabCase(name)}`)}`);
	cliConsole.log(`  ${colors.cyan('bun run dev')}`);
	cliConsole.log('');
	cliConsole.log(`Documentation: ${colors.dim('https://github.com/sivaraj/bueno')}`);
}

// Register the command
defineCommand(
	{
		name: 'new',
		description: 'Create a new Bueno project',
		positionals: [
			{
				name: 'name',
				required: false,
				description: 'Project name',
			},
		],
		options: [
			{
				name: 'template',
				alias: 't',
				type: 'string',
				description: 'Project template (default, minimal, fullstack, api)',
			},
			{
				name: 'framework',
				alias: 'f',
				type: 'string',
				description: 'Frontend framework (react, vue, svelte, solid)',
			},
			{
				name: 'database',
				alias: 'd',
				type: 'string',
				description: 'Database driver (sqlite, postgresql, mysql)',
			},
			{
				name: 'skip-install',
				type: 'boolean',
				default: false,
				description: 'Skip dependency installation',
			},
			{
				name: 'skip-git',
				type: 'boolean',
				default: false,
				description: 'Skip git initialization',
			},
			{
				name: 'docker',
				type: 'boolean',
				default: false,
				description: 'Include Docker configuration (Dockerfile, docker-compose.yml)',
			},
			{
				name: 'deploy',
				type: 'string',
				description: 'Deployment platform configuration (render, fly, railway). Can be specified multiple times.',
			},
			{
				name: 'yes',
				alias: 'y',
				type: 'boolean',
				default: false,
				description: 'Use default options without prompts',
			},
		],
		examples: [
			'bueno new my-app',
			'bueno new my-api --template api',
			'bueno new my-fullstack --template fullstack --framework react',
			'bueno new my-project --database postgresql',
			'bueno new my-app --docker',
			'bueno new my-app --docker --database postgresql',
			'bueno new my-app --deploy render',
			'bueno new my-app --deploy fly',
			'bueno new my-app --deploy render --deploy fly',
			'bueno new my-app --docker --deploy render',
			'bueno new my-app --docker --database postgresql --deploy render',
			'bueno new my-app -y',
		],
	},
	handleNew,
);