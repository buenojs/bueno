/**
 * Generate Command
 *
 * Generate code artifacts (controllers, services, modules, etc.)
 */

import { defineCommand } from './index';
import { getOption, hasFlag, type ParsedArgs } from '../core/args';
import { cliConsole, colors } from '../core/console';
import { confirm, isInteractive } from '../core/prompt';
import { spinner } from '../core/spinner';
import {
	fileExists,
	writeFile,
	readFile,
	getProjectRoot,
	isBuenoProject,
	joinPaths,
	processTemplate,
} from '../utils/fs';
import { kebabCase, pascalCase, camelCase } from '../utils/strings';
import { CLIError, CLIErrorType } from '../index';

/**
 * Generator types
 */
type GeneratorType =
	| 'controller'
	| 'service'
	| 'module'
	| 'guard'
	| 'interceptor'
	| 'pipe'
	| 'filter'
	| 'dto'
	| 'middleware'
	| 'migration';

/**
 * Generator aliases
 */
const GENERATOR_ALIASES: Record<string, GeneratorType> = {
	c: 'controller',
	s: 'service',
	m: 'module',
	gu: 'guard',
	i: 'interceptor',
	p: 'pipe',
	f: 'filter',
	d: 'dto',
	mw: 'middleware',
	mi: 'migration',
};

/**
 * Generator configuration
 */
interface GeneratorConfig {
	type: GeneratorType;
	name: string;
	module?: string;
	path?: string;
	dryRun: boolean;
	force: boolean;
}

/**
 * Get template content for a generator type
 */
function getTemplate(type: GeneratorType): string {
	const templates: Record<GeneratorType, string> = {
		controller: `import { Controller, Get, Post, Put, Delete{{#if path}} } from 'bueno'{{/if}}{{#if service}}, { {{pascalCase service}}Service } from './{{kebabCase service}}.service'{{/if}};
import type { Context } from 'bueno';

@Controller('{{path}}')
export class {{pascalCase name}}Controller {
  {{#if service}}
  constructor(private readonly {{camelCase service}}Service: {{pascalCase service}}Service) {}
  {{/if}}

  @Get()
  async findAll(ctx: Context) {
    return { message: '{{pascalCase name}} controller' };
  }

  @Get(':id')
  async findOne(ctx: Context) {
    const id = ctx.params.id;
    return { id, message: '{{pascalCase name}} item' };
  }

  @Post()
  async create(ctx: Context) {
    const body = await ctx.body();
    return { message: 'Created', data: body };
  }

  @Put(':id')
  async update(ctx: Context) {
    const id = ctx.params.id;
    const body = await ctx.body();
    return { id, message: 'Updated', data: body };
  }

  @Delete(':id')
  async remove(ctx: Context) {
    const id = ctx.params.id;
    return { id, message: 'Deleted' };
  }
}
`,
		service: `import { Injectable } from 'bueno';

@Injectable()
export class {{pascalCase name}}Service {
  async findAll() {
    // TODO: Implement findAll
    return [];
  }

  async findOne(id: string) {
    // TODO: Implement findOne
    return { id };
  }

  async create(data: unknown) {
    // TODO: Implement create
    return data;
  }

  async update(id: string, data: unknown) {
    // TODO: Implement update
    return { id, ...data };
  }

  async remove(id: string) {
    // TODO: Implement remove
    return { id };
  }
}
`,
		module: `import { Module } from 'bueno';
import { {{pascalCase name}}Controller } from './{{kebabCase name}}.controller';
import { {{pascalCase name}}Service } from './{{kebabCase name}}.service';

@Module({
  controllers: [{{pascalCase name}}Controller],
  providers: [{{pascalCase name}}Service],
  exports: [{{pascalCase name}}Service],
})
export class {{pascalCase name}}Module {}
`,
		guard: `import { Injectable, type CanActivate, type Context } from 'bueno';

@Injectable()
export class {{pascalCase name}}Guard implements CanActivate {
  async canActivate(ctx: Context): Promise<boolean> {
    // TODO: Implement guard logic
    // Return true to allow access, false to deny
    return true;
  }
}
`,
		interceptor: `import { Injectable, type NestInterceptor, type CallHandler, type Context } from 'bueno';
import type { Observable } from 'rxjs';

@Injectable()
export class {{pascalCase name}}Interceptor implements NestInterceptor {
  async intercept(ctx: Context, next: CallHandler): Promise<Observable<unknown>> {
    // Before handler execution
    console.log('{{pascalCase name}}Interceptor - Before');

    // Call the handler
    const result = await next.handle();

    // After handler execution
    console.log('{{pascalCase name}}Interceptor - After');

    return result;
  }
}
`,
		pipe: `import { Injectable, type PipeTransform, type Context } from 'bueno';

@Injectable()
export class {{pascalCase name}}Pipe implements PipeTransform {
  async transform(value: unknown, ctx: Context): Promise<unknown> {
    // TODO: Implement transformation/validation logic
    // Throw an error to reject the value
    return value;
  }
}
`,
		filter: `import { Injectable, type ExceptionFilter, type Context } from 'bueno';
import type { Response } from 'bueno';

@Injectable()
export class {{pascalCase name}}Filter implements ExceptionFilter {
  async catch(exception: Error, ctx: Context): Promise<Response> {
    // TODO: Implement exception handling
    console.error('{{pascalCase name}}Filter caught:', exception);

    return new Response(
      JSON.stringify({
        statusCode: 500,
        message: 'Internal Server Error',
        error: exception.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
`,
		dto: `/**
 * {{pascalCase name}} DTO
 */
export interface {{pascalCase name}}Dto {
  // TODO: Define properties
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Create {{pascalCase name}} DTO
 */
export interface Create{{pascalCase name}}Dto {
  // TODO: Define required properties for creation
}

/**
 * Update {{pascalCase name}} DTO
 */
export interface Update{{pascalCase name}}Dto extends Partial<Create{{pascalCase name}}Dto> {
  // TODO: Define optional properties for update
}
`,
		middleware: `import type { Middleware, Context, Handler } from 'bueno';

/**
 * {{pascalCase name}} Middleware
 */
export const {{camelCase name}}Middleware: Middleware = async (
  ctx: Context,
  next: Handler
) => {
  // Before handler execution
  console.log('{{pascalCase name}}Middleware - Before');

  // Call the next handler
  const result = await next();

  // After handler execution
  console.log('{{pascalCase name}}Middleware - After');

  return result;
};
`,
		migration: `import { createMigration, type MigrationRunner } from 'bueno';

export default createMigration('{{migrationId}}', '{{migrationName}}')
  .up(async (db: MigrationRunner) => {
    // TODO: Add migration logic
    // Example:
    // await db.createTable({
    //   name: '{{tableName}}',
    //   columns: [
    //     { name: 'id', type: 'uuid', primary: true },
    //     { name: 'created_at', type: 'timestamp', default: 'NOW()' },
    //   ],
    // });
  })
  .down(async (db: MigrationRunner) => {
    // TODO: Add rollback logic
    // Example:
    // await db.dropTable('{{tableName}}');
  });
`,
	};

	return templates[type];
}

/**
 * Get file extension for generator type
 */
function getFileExtension(type: GeneratorType): string {
	return type === 'dto' ? '.dto.ts' : '.ts';
}

/**
 * Get default directory for generator type
 */
function getDefaultDirectory(type: GeneratorType): string {
	switch (type) {
		case 'controller':
		case 'service':
		case 'module':
		case 'dto':
			return 'modules';
		case 'guard':
			return 'common/guards';
		case 'interceptor':
			return 'common/interceptors';
		case 'pipe':
			return 'common/pipes';
		case 'filter':
			return 'common/filters';
		case 'middleware':
			return 'common/middleware';
		case 'migration':
			return 'database/migrations';
		default:
			return '';
	}
}

/**
 * Generate a file
 */
async function generateFile(config: GeneratorConfig): Promise<string> {
	const { type, name, module, path: customPath, dryRun, force } = config;

	// Get project root
	const projectRoot = await getProjectRoot();
	if (!projectRoot) {
		throw new CLIError(
			'Not in a Bueno project directory',
			CLIErrorType.NOT_FOUND,
		);
	}

	// Determine file path
	const kebabName = kebabCase(name);
	const defaultDir = getDefaultDirectory(type);
	let targetDir: string;

	if (customPath) {
		targetDir = joinPaths(projectRoot, customPath);
	} else if (module) {
		targetDir = joinPaths(projectRoot, 'server', defaultDir, kebabCase(module));
	} else if (type === 'migration') {
		targetDir = joinPaths(projectRoot, 'server', defaultDir);
	} else {
		targetDir = joinPaths(projectRoot, 'server', defaultDir, kebabName);
	}

	const fileName = type === 'migration'
		? `${generateMigrationId()}_${kebabName}${getFileExtension(type)}`
		: `${kebabName}${getFileExtension(type)}`;
	const filePath = joinPaths(targetDir, fileName);

	// Check if file exists
	if (!force && await fileExists(filePath)) {
		if (isInteractive()) {
			const shouldOverwrite = await confirm(
				`File ${colors.cyan(filePath)} already exists. Overwrite?`,
				{ default: false },
			);
			if (!shouldOverwrite) {
				throw new CLIError(
					'File already exists. Use --force to overwrite.',
					CLIErrorType.FILE_EXISTS,
				);
			}
		} else {
			throw new CLIError(
				`File already exists: ${filePath}. Use --force to overwrite.`,
				CLIErrorType.FILE_EXISTS,
			);
		}
	}

	// Get template and process it
	const template = getTemplate(type);
	const content = processTemplate(template, {
		name,
		module: module ?? '',
		path: customPath ?? kebabName,
		service: type === 'controller' ? name : '',
		migrationId: generateMigrationId(),
		migrationName: name,
		tableName: kebabName,
	});

	// Write file or show dry run
	if (dryRun) {
		cliConsole.log(`\n${colors.bold('File:')} ${filePath}`);
		cliConsole.log(colors.bold('Content:'));
		cliConsole.log(content);
		cliConsole.log('');
	} else {
		await writeFile(filePath, content);
	}

	return filePath;
}

/**
 * Generate migration ID
 */
function generateMigrationId(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	const hour = String(now.getHours()).padStart(2, '0');
	const minute = String(now.getMinutes()).padStart(2, '0');
	const second = String(now.getSeconds()).padStart(2, '0');
	return `${year}${month}${day}${hour}${minute}${second}`;
}

/**
 * Handle generate command
 */
async function handleGenerate(args: ParsedArgs): Promise<void> {
	// Get generator type
	const typeArg = args.positionals[0];
	if (!typeArg) {
		throw new CLIError(
			'Generator type is required. Usage: bueno generate <type> <name>',
			CLIErrorType.INVALID_ARGS,
		);
	}

	const type = GENERATOR_ALIASES[typeArg] ?? typeArg as GeneratorType;
	if (!getTemplate(type)) {
		throw new CLIError(
			`Unknown generator type: ${typeArg}. Available types: controller, service, module, guard, interceptor, pipe, filter, dto, middleware, migration`,
			CLIErrorType.INVALID_ARGS,
		);
	}

	// Get name
	const name = args.positionals[1];
	if (!name) {
		throw new CLIError(
			'Name is required. Usage: bueno generate <type> <name>',
			CLIErrorType.INVALID_ARGS,
		);
	}

	// Get options
	const config: GeneratorConfig = {
		type,
		name,
		module: getOption<string>(args, 'module', {
			name: 'module',
			type: 'string',
			description: '',
		}),
		path: getOption<string>(args, 'path', {
			name: 'path',
			type: 'string',
			description: '',
		}),
		dryRun: hasFlag(args, 'dry-run'),
		force: hasFlag(args, 'force'),
	};

	// Check if in a Bueno project
	if (!config.dryRun && !(await isBuenoProject())) {
		throw new CLIError(
			'Not in a Bueno project directory. Run this command from a Bueno project.',
			CLIErrorType.NOT_FOUND,
		);
	}

	// Generate
	const s = spinner(`Generating ${colors.cyan(type)} ${colors.cyan(name)}...`);

	try {
		const filePath = await generateFile(config);

		if (config.dryRun) {
			s.info('Dry run complete');
		} else {
			s.success(`Created ${colors.green(filePath)}`);
		}
	} catch (error) {
		s.error();
		throw error;
	}
}

// Register the command
defineCommand(
	{
		name: 'generate',
		alias: 'g',
		description: 'Generate code artifacts (controllers, services, modules, etc.)',
		positionals: [
			{
				name: 'type',
				required: true,
				description: 'Type of artifact to generate (controller, service, module, guard, interceptor, pipe, filter, dto, middleware, migration)',
			},
			{
				name: 'name',
				required: true,
				description: 'Name of the artifact',
			},
		],
		options: [
			{
				name: 'module',
				alias: 'm',
				type: 'string',
				description: 'Parent module to register with',
			},
			{
				name: 'path',
				type: 'string',
				description: 'Custom path for controller routes',
			},
			{
				name: 'dry-run',
				type: 'boolean',
				default: false,
				description: 'Show what would be created without writing',
			},
			{
				name: 'force',
				type: 'boolean',
				default: false,
				description: 'Overwrite existing files',
			},
		],
		examples: [
			'bueno generate controller users',
			'bueno g service auth',
			'bueno g module posts',
			'bueno g guard auth-guard --module auth',
			'bueno g dto create-user --module users',
		],
	},
	handleGenerate,
);