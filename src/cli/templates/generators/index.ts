/**
 * Generators Templates
 *
 * Code generator templates registry
 */

// Re-export types
export type {
	GeneratorType,
	GeneratorConfig,
	GeneratorResult,
} from './types';

export { GENERATOR_ALIASES } from './types';

import type { GeneratorType, GeneratorConfig, GeneratorResult } from './types';

/**
 * Generator template function type
 */
type GeneratorTemplate = (config: GeneratorConfig) => string;

/**
 * Generator template registry
 */
const generatorTemplates: Record<GeneratorType, GeneratorTemplate> = {
	controller: (config) => getControllerTemplate(config),
	service: () => getServiceTemplate(),
	module: (config) => getModuleTemplate(config),
	guard: (config) => getGuardTemplate(config),
	interceptor: (config) => getInterceptorTemplate(config),
	pipe: (config) => getPipeTemplate(config),
	filter: (config) => getFilterTemplate(config),
	dto: (config) => getDtoTemplate(config),
	middleware: (config) => getMiddlewareTemplate(config),
	migration: (config) => getMigrationTemplate(config),
};

/**
 * Get generator template
 */
export function getGeneratorTemplate(type: GeneratorType): GeneratorTemplate {
	return generatorTemplates[type];
}

/**
 * Get all available generator types
 */
export function getGeneratorTypes(): GeneratorType[] {
	return Object.keys(generatorTemplates) as GeneratorType[];
}

/**
 * Get default directory for generator type
 */
export function getDefaultDirectory(type: GeneratorType): string {
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
 * Get file extension for generator type
 */
export function getFileExtension(type: GeneratorType): string {
	return type === 'dto' ? '.dto.ts' : '.ts';
}

// ============= Template Functions =============

function getControllerTemplate(config: GeneratorConfig): string {
	return `import { Controller, Get, Post, Put, Delete{{#if path}} } from '@buenojs/bueno'{{/if}}{{#if service}}, { {{pascalCase service}}Service } from './{{kebabCase service}}.service'{{/if}};
import type { Context } from '@buenojs/bueno';

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
`;
}

function getServiceTemplate(): string {
	return `import { Injectable } from '@buenojs/bueno';

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
`;
}

function getModuleTemplate(config: GeneratorConfig): string {
	return `import { Module } from '@buenojs/bueno';
import { {{pascalCase name}}Controller } from './{{kebabCase name}}.controller';
import { {{pascalCase name}}Service } from './{{kebabCase name}}.service';

@Module({
  controllers: [{{pascalCase name}}Controller],
  providers: [{{pascalCase name}}Service],
  exports: [{{pascalCase name}}Service],
})
export class {{pascalCase name}}Module {}
`;
}

function getGuardTemplate(config: GeneratorConfig): string {
	return `import { Injectable, type CanActivate, type Context } from '@buenojs/bueno';

@Injectable()
export class {{pascalCase name}}Guard implements CanActivate {
  async canActivate(ctx: Context): Promise<boolean> {
    // TODO: Implement guard logic
    // Return true to allow access, false to deny
    return true;
  }
}
`;
}

function getInterceptorTemplate(config: GeneratorConfig): string {
	return `import { Injectable, type NestInterceptor, type CallHandler, type Context } from '@buenojs/bueno';
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
`;
}

function getPipeTemplate(config: GeneratorConfig): string {
	return `import { Injectable, type PipeTransform, type Context } from '@buenojs/bueno';

@Injectable()
export class {{pascalCase name}}Pipe implements PipeTransform {
  async transform(value: unknown, ctx: Context): Promise<unknown> {
    // TODO: Implement transformation/validation logic
    // Throw an error to reject the value
    return value;
  }
}
`;
}

function getFilterTemplate(config: GeneratorConfig): string {
	return `import { Injectable, type ExceptionFilter, type Context } from '@buenojs/bueno';
import type { Response } from '@buenojs/bueno';

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
`;
}

function getDtoTemplate(config: GeneratorConfig): string {
	return `/**
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
`;
}

function getMiddlewareTemplate(config: GeneratorConfig): string {
	return `import type { Middleware, Context, Handler } from '@buenojs/bueno';

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
`;
}

function getMigrationTemplate(config: GeneratorConfig): string {
	const migrationId = generateMigrationId();
	return `import { createMigration, type MigrationRunner } from '@buenojs/bueno/migrations';

export default createMigration('${migrationId}', '{{migrationName}}')
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
`;
}

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