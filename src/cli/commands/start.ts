/**
 * Start Command
 *
 * Start the production server
 */

import { defineCommand } from './index';
import { getOption, hasFlag, type ParsedArgs } from '../core/args';
import { cliConsole, colors } from '../core/console';
import { spinner } from '../core/spinner';
import {
	fileExists,
	getProjectRoot,
	isBuenoProject,
	joinPaths,
} from '../utils/fs';
import { CLIError, CLIErrorType } from '../index';

/**
 * Find the entry point for the application
 */
async function findEntryPoint(projectRoot: string): Promise<string | null> {
	// Check for built files first
	const possibleBuiltEntries = [
		'dist/index.js',
		'dist/main.js',
		'dist/server.js',
		'dist/app.js',
	];

	for (const entry of possibleBuiltEntries) {
		const entryPath = joinPaths(projectRoot, entry);
		if (await fileExists(entryPath)) {
			return entry;
		}
	}

	// Fall back to source files
	const possibleSourceEntries = [
		'server/main.ts',
		'src/main.ts',
		'src/index.ts',
		'main.ts',
		'index.ts',
		'server.ts',
		'app.ts',
	];

	for (const entry of possibleSourceEntries) {
		const entryPath = joinPaths(projectRoot, entry);
		if (await fileExists(entryPath)) {
			return entry;
		}
	}

	return null;
}

/**
 * Handle start command
 */
async function handleStart(args: ParsedArgs): Promise<void> {
	// Get options
	const port = getOption(args, 'port', {
		name: 'port',
		alias: 'p',
		type: 'number',
		default: 3000,
		description: '',
	});

	const host = getOption<string>(args, 'host', {
		name: 'host',
		alias: 'H',
		type: 'string',
		default: '0.0.0.0',
		description: '',
	});

	const workers = getOption(args, 'workers', {
		name: 'workers',
		alias: 'w',
		type: 'string',
		default: 'auto',
		description: '',
	});

	const configPath = getOption<string>(args, 'config', {
		name: 'config',
		alias: 'c',
		type: 'string',
		description: '',
	});

	// Check if in a Bueno project
	const projectRoot = await getProjectRoot();
	if (!projectRoot) {
		throw new CLIError(
			'Not in a project directory. Run this command from a Bueno project.',
			CLIErrorType.NOT_FOUND,
		);
	}

	if (!(await isBuenoProject())) {
		throw new CLIError(
			'Not a Bueno project. Make sure you have a bueno.config.ts or bueno in your dependencies.',
			CLIErrorType.NOT_FOUND,
		);
	}

	// Find entry point
	const entryPoint = await findEntryPoint(projectRoot);
	if (!entryPoint) {
		throw new CLIError(
			'Could not find entry point. Make sure you have built the application or have a main.ts file.',
			CLIErrorType.FILE_NOT_FOUND,
		);
	}

	// Display startup info
	cliConsole.header('Starting Production Server');
	cliConsole.log(`${colors.bold('Entry:')} ${entryPoint}`);
	cliConsole.log(`${colors.bold('Port:')} ${port}`);
	cliConsole.log(`${colors.bold('Host:')} ${host}`);
	cliConsole.log(`${colors.bold('Workers:')} ${workers}`);
	cliConsole.log('');

	// Set environment variables
	const env: Record<string, string> = {
		NODE_ENV: 'production',
		PORT: String(port),
		HOST: host,
	};

	if (configPath) {
		env.BUENO_CONFIG = configPath;
	}

	// Start the server using Bun
	const s = spinner('Starting production server...');

	try {
		// Use Bun's spawn to run the production server
		const proc = Bun.spawn(['bun', 'run', entryPoint], {
			cwd: projectRoot,
			env: { ...process.env, ...env },
			stdout: 'inherit',
			stderr: 'inherit',
		});

		s.success(`Production server running at ${colors.cyan(`http://${host}:${port}`)}`);

		// Wait for the process to exit
		const exitCode = await proc.exited;

		if (exitCode !== 0 && exitCode !== null) {
			cliConsole.error(`Server exited with code ${exitCode}`);
			process.exit(exitCode);
		}
	} catch (error) {
		s.error();
		throw error;
	}
}

// Register the command
defineCommand(
	{
		name: 'start',
		description: 'Start the production server',
		options: [
			{
				name: 'port',
				alias: 'p',
				type: 'number',
				default: 3000,
				description: 'Server port',
			},
			{
				name: 'host',
				alias: 'H',
				type: 'string',
				default: '0.0.0.0',
				description: 'Server hostname',
			},
			{
				name: 'workers',
				alias: 'w',
				type: 'string',
				default: 'auto',
				description: 'Number of worker threads',
			},
			{
				name: 'config',
				alias: 'c',
				type: 'string',
				description: 'Path to config file',
			},
		],
		examples: [
			'bueno start',
			'bueno start --port 8080',
			'bueno start --host 0.0.0.0',
			'bueno start --workers 4',
		],
	},
	handleStart,
);