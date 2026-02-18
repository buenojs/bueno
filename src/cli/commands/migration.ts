/**
 * Migration Command
 *
 * Manage database migrations
 */

import { defineCommand } from './index';
import { getOption, hasFlag, type ParsedArgs } from '../core/args';
import { cliConsole, colors, printTable } from '../core/console';
import { spinner } from '../core/spinner';
import {
	fileExists,
	readFile,
	writeFile,
	listFiles,
	getProjectRoot,
	isBuenoProject,
	joinPaths,
} from '../utils/fs';
import { CLIError, CLIErrorType } from '../index';

/**
 * Migration actions
 */
type MigrationAction = 'create' | 'up' | 'down' | 'reset' | 'refresh' | 'status';

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
 * Get migrations directory
 */
async function getMigrationsDir(): Promise<string> {
	const projectRoot = await getProjectRoot();
	if (!projectRoot) {
		throw new CLIError(
			'Not in a project directory',
			CLIErrorType.NOT_FOUND,
		);
	}

	// Check common locations
	const possibleDirs = [
		joinPaths(projectRoot, 'server', 'database', 'migrations'),
		joinPaths(projectRoot, 'database', 'migrations'),
		joinPaths(projectRoot, 'migrations'),
	];

	for (const dir of possibleDirs) {
		if (await fileExists(dir)) {
			return dir;
		}
	}

	// Default to server/database/migrations
	return possibleDirs[0] ?? '';
}

/**
 * Get migration files
 */
async function getMigrationFiles(dir: string): Promise<string[]> {
	if (!await fileExists(dir)) {
		return [];
	}

	const files = await listFiles(dir, {
		recursive: false,
		pattern: /\.ts$/,
	});

	return files.sort();
}

/**
 * Parse migration info from filename
 */
function parseMigrationFile(filename: string): { id: string; name: string } {
	const match = filename.match(/^(\d+)_(.+)\.ts$/);
	if (!match || !match[1] || !match[2]) {
		return { id: filename, name: filename };
	}
	return { id: match[1], name: match[2] };
}

/**
 * Create a new migration file
 */
async function createMigration(name: string, dryRun: boolean): Promise<string> {
	const migrationsDir = await getMigrationsDir();
	const id = generateMigrationId();
	const kebabName = name.toLowerCase().replace(/\s+/g, '-');
	const fileName = `${id}_${kebabName}.ts`;
	const filePath = joinPaths(migrationsDir, fileName);

	const template = `import { createMigration, type MigrationRunner } from 'bueno';

export default createMigration('${id}', '${kebabName}')
  .up(async (db: MigrationRunner) => {
    // TODO: Add migration logic
    // Example:
    // await db.createTable({
    //   name: '${kebabName}',
    //   columns: [
    //     { name: 'id', type: 'uuid', primary: true },
    //     { name: 'created_at', type: 'timestamp', default: 'NOW()' },
    //   ],
    // });
  })
  .down(async (db: MigrationRunner) => {
    // TODO: Add rollback logic
    // Example:
    // await db.dropTable('${kebabName}');
  });
`;

	if (dryRun) {
		cliConsole.log(`\n${colors.bold('File:')} ${filePath}`);
		cliConsole.log(colors.bold('Content:'));
		cliConsole.log(template);
		cliConsole.log('');
		return filePath;
	}

	await writeFile(filePath, template);
	return filePath;
}

/**
 * Show migration status
 */
async function showStatus(): Promise<void> {
	const migrationsDir = await getMigrationsDir();
	const files = await getMigrationFiles(migrationsDir);

	if (files.length === 0) {
		cliConsole.info('No migrations found');
		return;
	}

	cliConsole.header('Migration Status');

	const rows = files.map((file) => {
		const info = parseMigrationFile(file.split('/').pop() ?? '');
		return [info.id, info.name, colors.yellow('Pending')];
	});

	printTable(['ID', 'Name', 'Status'], rows);
	cliConsole.log('');
	cliConsole.log(`Total: ${files.length} migration(s)`);
}

/**
 * Handle migration command
 */
async function handleMigration(args: ParsedArgs): Promise<void> {
	// Get action
	const action = args.positionals[0] as MigrationAction | undefined;
	if (!action) {
		throw new CLIError(
			'Action is required. Usage: bueno migration <action>',
			CLIErrorType.INVALID_ARGS,
		);
	}

	const validActions: MigrationAction[] = ['create', 'up', 'down', 'reset', 'refresh', 'status'];
	if (!validActions.includes(action)) {
		throw new CLIError(
			`Unknown action: ${action}. Valid actions: ${validActions.join(', ')}`,
			CLIErrorType.INVALID_ARGS,
		);
	}

	// Get options
	const dryRun = hasFlag(args, 'dry-run');
	const steps = getOption(args, 'steps', {
		name: 'steps',
		alias: 'n',
		type: 'number',
		default: 1,
		description: '',
	});

	// Check if in a Bueno project (except for create with dry-run)
	if (action !== 'create' || !dryRun) {
		if (!(await isBuenoProject())) {
			throw new CLIError(
				'Not in a Bueno project directory. Run this command from a Bueno project.',
				CLIErrorType.NOT_FOUND,
			);
		}
	}

	switch (action) {
		case 'create': {
			const name = args.positionals[1];
			if (!name) {
				throw new CLIError(
					'Migration name is required. Usage: bueno migration create <name>',
					CLIErrorType.INVALID_ARGS,
				);
			}

			const s = spinner(`Creating migration ${colors.cyan(name)}...`);
			try {
				const filePath = await createMigration(name, dryRun);
				if (dryRun) {
					s.info('Dry run complete');
				} else {
					s.success(`Created ${colors.green(filePath)}`);
				}
			} catch (error) {
				s.error();
				throw error;
			}
			break;
		}

		case 'up': {
			cliConsole.info('Running pending migrations...');
			cliConsole.log('');
			cliConsole.warn(
				'Migration execution requires database connection. Use the MigrationRunner in your application code.',
			);
			cliConsole.log('');
			cliConsole.log('Example:');
			cliConsole.log(colors.cyan(`
import { createMigrationRunner, loadMigrations } from 'bueno';
import { db } from './database';

const runner = createMigrationRunner(db);
const migrations = await loadMigrations('./database/migrations');
await runner.migrate(migrations);
`));
			break;
		}

		case 'down': {
			cliConsole.info(`Rolling back ${steps} migration(s)...`);
			cliConsole.log('');
			cliConsole.warn(
				'Migration rollback requires database connection. Use the MigrationRunner in your application code.',
			);
			cliConsole.log('');
			cliConsole.log('Example:');
			cliConsole.log(colors.cyan(`
import { createMigrationRunner, loadMigrations } from 'bueno';
import { db } from './database';

const runner = createMigrationRunner(db);
const migrations = await loadMigrations('./database/migrations');
await runner.rollback(migrations, ${steps});
`));
			break;
		}

		case 'reset': {
			cliConsole.info('Rolling back all migrations...');
			cliConsole.log('');
			cliConsole.warn(
				'Migration reset requires database connection. Use the MigrationRunner in your application code.',
			);
			cliConsole.log('');
			cliConsole.log('Example:');
			cliConsole.log(colors.cyan(`
import { createMigrationRunner, loadMigrations } from 'bueno';
import { db } from './database';

const runner = createMigrationRunner(db);
const migrations = await loadMigrations('./database/migrations');
await runner.reset(migrations);
`));
			break;
		}

		case 'refresh': {
			cliConsole.info('Refreshing all migrations...');
			cliConsole.log('');
			cliConsole.warn(
				'Migration refresh requires database connection. Use the MigrationRunner in your application code.',
			);
			cliConsole.log('');
			cliConsole.log('Example:');
			cliConsole.log(colors.cyan(`
import { createMigrationRunner, loadMigrations } from 'bueno';
import { db } from './database';

const runner = createMigrationRunner(db);
const migrations = await loadMigrations('./database/migrations');
await runner.refresh(migrations);
`));
			break;
		}

		case 'status': {
			await showStatus();
			break;
		}
	}
}

// Register the command
defineCommand(
	{
		name: 'migration',
		description: 'Manage database migrations',
		positionals: [
			{
				name: 'action',
				required: true,
				description: 'Action to perform (create, up, down, reset, refresh, status)',
			},
			{
				name: 'name',
				required: false,
				description: 'Migration name (required for create action)',
			},
		],
		options: [
			{
				name: 'steps',
				alias: 'n',
				type: 'number',
				default: 1,
				description: 'Number of migrations to rollback',
			},
			{
				name: 'dry-run',
				type: 'boolean',
				default: false,
				description: 'Show what would happen without executing',
			},
		],
		examples: [
			'bueno migration create add-users-table',
			'bueno migration up',
			'bueno migration down --steps 3',
			'bueno migration reset',
			'bueno migration refresh',
			'bueno migration status',
		],
	},
	handleMigration,
);