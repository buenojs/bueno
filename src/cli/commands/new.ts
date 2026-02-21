/**
 * New Command
 *
 * Create a new Bueno project
 */

import { defineCommand } from './index';
import { getOption, hasFlag, getOptionValues, type ParsedArgs } from '../core/args';
import { cliConsole, colors, printTable } from '../core/console';
import { prompt, select, isInteractive } from '../core/prompt';
import { spinner, runTasks, type TaskOptions } from '../core/spinner';
import {
	fileExists,
	writeFile,
	createDirectory,
	joinPaths,
} from '../utils/fs';
import { kebabCase } from '../utils/strings';
import { getBuenoDependency } from '../utils/version';
import { CLIError, CLIErrorType } from '../index';
import {
	type DeployPlatform,
	getDeployTemplate,
	getDeployFilename,
	getDeployPlatformName,
} from '../templates';
import {
	type ProjectTemplate,
	type ProjectConfig,
	type FrontendFramework,
	type DatabaseDriver,
	getTemplateOptions,
	getDatabaseOptions,
	getFrontendOptions,
} from '../templates';

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
function getPackageJsonTemplate(config: ProjectConfig, template: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> }): string {
	const dependencies: Record<string, string> = {
		...getBuenoDependency(),
		...(template.dependencies || {}),
	};
	
	// If using link, don't add @buenojs/bueno to dependencies
	if (config.link) {
		delete dependencies['@buenojs/bueno'];
	}

	const devDependencies: Record<string, string> = {
		'@types/bun': 'latest',
		typescript: '^5.3.0',
		...(template.devDependencies || {}),
	};

	const scripts: Record<string, string> = {
		dev: 'bun run --watch server/main.ts',
		build: 'bun build ./server/main.ts --outdir ./dist --target bun',
		start: 'bun run dist/main.js',
		test: 'bun test',
		...(template.scripts || {}),
	};

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
						'@buenojs/bueno': ['./node_modules/@buenojs/bueno/dist/index.d.ts'],
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
 * Get .env.example template
 */
function getEnvExampleTemplate(config: ProjectConfig): string {
	if (config.database === 'none' || config.database === 'sqlite') {
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
	const templateDescriptions: Record<ProjectTemplate, string> = {
		default: 'Standard project with modules and database',
		minimal: 'Bare minimum project structure',
		fullstack: 'Full-stack project with SSR and frontend',
		api: 'API-only project without frontend',
		website: 'Static website with SSG',
	};

	return `# ${config.name}

A Bueno application - ${templateDescriptions[config.template]}.

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

- [Bueno Documentation](https://bueno.github.io)
- [Bun Documentation](https://bun.sh/docs)
`;
}

/**
 * Get bueno.config.ts template
 */
function getConfigTemplate(config: ProjectConfig): string {
	let dbConfig = 'undefined';
	
	if (config.database === 'sqlite') {
		dbConfig = `{ url: 'sqlite:./data.db' }`;
	} else if (config.database === 'postgresql') {
		dbConfig = `{ url: process.env.DATABASE_URL ?? 'postgresql://localhost/${kebabCase(config.name)}' }`;
	} else if (config.database === 'mysql') {
		dbConfig = `{ url: process.env.DATABASE_URL ?? 'mysql://localhost/${kebabCase(config.name)}' }`;
	}

	return `import { defineConfig } from '@buenojs/bueno';

export default defineConfig({
  server: {
    port: 3000,
    host: 'localhost',
  },

  ${config.database !== 'none' ? `database: ${dbConfig},` : ''}

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
 * Create project files
 */
async function createProjectFiles(
	projectPath: string,
	config: ProjectConfig,
	templateResult: { files: { path: string; content: string }[]; directories: string[]; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> },
): Promise<void> {
	const tasks: TaskOptions[] = [];

	// Create directories
	tasks.push({
		text: 'Creating project structure',
		task: async () => {
			// Base directories
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
			
			// Template-specific directories
			for (const dir of templateResult.directories) {
				await createDirectory(joinPaths(projectPath, dir));
			}
		},
	});

	// Create package.json
	tasks.push({
		text: 'Creating package.json',
		task: async () => {
			await writeFile(
				joinPaths(projectPath, 'package.json'),
				getPackageJsonTemplate(config, templateResult),
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

	// Create template-specific files
	for (const file of templateResult.files) {
		tasks.push({
			text: `Creating ${file.path}`,
			task: async () => {
				await writeFile(
					joinPaths(projectPath, file.path),
					file.content,
				);
			},
		});
	}

	// Create bueno.config.ts (not for website template)
	if (config.template !== 'website') {
		tasks.push({
			text: 'Creating bueno.config.ts',
			task: async () => {
				await writeFile(
					joinPaths(projectPath, 'bueno.config.ts'),
					getConfigTemplate(config),
				);
			},
		});
	}

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
	if (config.docker && config.template !== 'website') {
		tasks.push({
			text: 'Creating Dockerfile',
			task: async () => {
				await writeFile(
					joinPaths(projectPath, 'Dockerfile'),
					getDockerfileTemplate(config.name, config.database === 'none' ? undefined : config.database),
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
					getDockerComposeTemplate(config.name, config.database === 'none' ? undefined : config.database),
				);
			},
		});

		tasks.push({
			text: 'Creating .env.docker',
			task: async () => {
				await writeFile(
					joinPaths(projectPath, '.env.docker'),
					getDockerEnvTemplate(config.name, config.database === 'none' ? undefined : config.database),
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
					getDeployTemplate(platform, config.name, config.database === 'none' ? 'sqlite' : config.database),
				);
			},
		});
	}

	await runTasks(tasks);
}

// Import docker templates
import {
	getDockerfileTemplate,
	getDockerignoreTemplate,
	getDockerComposeTemplate,
	getDockerEnvTemplate,
} from '../templates';

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
	const link = hasFlag(args, 'link');
	
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
				getTemplateOptions(),
				{ default: 'default' },
			);
		}

		// Only ask for framework if template supports it
		if ((template === 'fullstack' || template === 'default') && !framework) {
			framework = await select<FrontendFramework>(
				'Select a frontend framework:',
				getFrontendOptions(),
				{ default: 'react' },
			);
		}

		// Website template doesn't need database or frontend selection
		if (template !== 'website' && !database) {
			database = await select<DatabaseDriver>(
				'Select a database:',
				getDatabaseOptions(),
				{ default: 'sqlite' },
			);
		}
	}

	// Set defaults
	template = template || 'default';
	framework = framework || 'react';
	database = database || 'sqlite';

	// For website template, override database and framework
	const isWebsite = template === 'website';

	const config: ProjectConfig = {
		name,
		template,
		framework: isWebsite ? 'none' : framework,
		database: isWebsite ? 'none' : database,
		skipInstall,
		skipGit,
		docker,
		deploy,
		link,
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
		['Framework', isWebsite ? 'N/A (Static Site)' : framework],
		['Database', isWebsite ? 'N/A' : database],
		['Docker', docker ? colors.green('Yes') : colors.red('No')],
		['Deploy', deploy.length > 0 ? colors.green(deploy.map(getDeployPlatformName).join(', ')) : colors.red('None')],
		['Install dependencies', skipInstall ? colors.red('No') : colors.green('Yes')],
		['Use local package', link ? colors.green('Yes (bun link)') : colors.red('No')],
	];

	printTable(['Setting', 'Value'], rows);
	cliConsole.log('');

	// Get the appropriate template function
	const { getProjectTemplate } = await import('../templates');
	const templateFn = getProjectTemplate(template);
	const templateResult = templateFn(config);

	// Create project
	cliConsole.subheader('Creating project files...');
	await createProjectFiles(projectPath, config, templateResult);

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
		
		// Link local @buenojs/bueno if --link flag is set
		if (link) {
			cliConsole.subheader('Linking local @buenojs/bueno...');
			const linkSpinner = spinner('Running bun link @buenojs/bueno...');

			try {
				const proc = Bun.spawn(['bun', 'link', '@buenojs/bueno'], {
					cwd: projectPath,
					stdout: 'pipe',
					stderr: 'pipe',
				});

				const exitCode = await proc.exited;

				if (exitCode === 0) {
					linkSpinner.success('Local @buenojs/bueno linked successfully');
				} else {
					linkSpinner.warn('Failed to link @buenojs/bueno. Make sure you have run `bun link` in the bueno directory first.');
				}
			} catch {
				linkSpinner.warn('Failed to link @buenojs/bueno. Make sure you have run `bun link` in the bueno directory first.');
			}
		}
	}

	// Git initialization - now disabled by default (removed)
	// Users can run `git init` manually if needed

	// Show success message
	cliConsole.log('');
	cliConsole.success(`Project created successfully!`);
	cliConsole.log('');
	cliConsole.log('Next steps:');
	cliConsole.log(`  ${colors.cyan(`cd ${kebabCase(name)}`)}`);
	
	if (isWebsite) {
		cliConsole.log(`  ${colors.cyan('bun run dev')} - Start development server`);
		cliConsole.log(`  ${colors.cyan('bun run build')} - Build static site`);
	} else {
		cliConsole.log(`  ${colors.cyan('bun run dev')}`);
	}
	
	cliConsole.log('');
	cliConsole.log(`Documentation: ${colors.dim('https://github.com/sivaraj/bueno')}`);
}

// Import the template function getter dynamically
async function importTemplateFn(template: ProjectTemplate) {
	const { getProjectTemplate } = await import('../templates');
	return getProjectTemplate(template);
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
				description: 'Project template (default, minimal, fullstack, api, website)',
			},
			{
				name: 'framework',
				alias: 'f',
				type: 'string',
				description: 'Frontend framework (react, vue, svelte, solid, none)',
			},
			{
				name: 'database',
				alias: 'd',
				type: 'string',
				description: 'Database driver (sqlite, postgresql, mysql, none)',
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
				description: 'Skip git initialization (deprecated - git init is no longer automatic)',
			},
			{
				name: 'docker',
				type: 'boolean',
				default: false,
				description: 'Include Docker configuration (Dockerfile, docker-compose.yml)',
			},
			{
				name: 'link',
				type: 'boolean',
				default: false,
				description: 'Use local @buenojs/bueno via bun link (for development)',
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
			'bueno new my-website --template website',
			'bueno new my-app --docker',
			'bueno new my-app --docker --database postgresql',
			'bueno new my-app --deploy render',
			'bueno new my-app --deploy fly',
			'bueno new my-app --deploy render --deploy fly',
			'bueno new my-app --docker --deploy render',
			'bueno new my-app --docker --database postgresql --deploy render',
			'bueno new my-app -y',
			'bueno new my-app --link',
		],
	},
	handleNew,
);