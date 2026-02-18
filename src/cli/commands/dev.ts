/**
 * Dev Command
 *
 * Start the development server with hot reload
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
	findFileUp,
	readFile,
} from '../utils/fs';
import { CLIError, CLIErrorType } from '../index';

/**
 * Find the entry point for the application
 */
async function findEntryPoint(projectRoot: string): Promise<string | null> {
	const possibleEntries = [
		'server/main.ts',
		'src/main.ts',
		'src/index.ts',
		'main.ts',
		'index.ts',
		'server.ts',
		'app.ts',
	];

	for (const entry of possibleEntries) {
		const entryPath = joinPaths(projectRoot, entry);
		if (await fileExists(entryPath)) {
			return entry;
		}
	}

	return null;
}

/**
 * Check if package.json has dev script
 */
async function hasDevScript(projectRoot: string): Promise<boolean> {
	const packageJsonPath = joinPaths(projectRoot, 'package.json');
	if (!(await fileExists(packageJsonPath))) {
		return false;
	}

	try {
		const content = await readFile(packageJsonPath);
		const pkg = JSON.parse(content);
		return !!pkg.scripts?.dev;
	} catch {
		return false;
	}
}

/**
 * Handle dev command
 */
async function handleDev(args: ParsedArgs): Promise<void> {
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
		default: 'localhost',
		description: '',
	});

	const hmr = !hasFlag(args, 'no-hmr');
	const watch = !hasFlag(args, 'no-watch');
	const openBrowser = hasFlag(args, 'open') || hasFlag(args, 'o');
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
			'Could not find entry point. Make sure you have a main.ts or index.ts file.',
			CLIErrorType.FILE_NOT_FOUND,
		);
	}

	// Build the command
	const bunArgs: string[] = [];

	if (watch) {
		bunArgs.push('--watch');
	}

	if (hmr) {
		// HMR is handled by the dev server in the framework
		cliConsole.debug('HMR enabled');
	}

	bunArgs.push(entryPoint);

	// Set environment variables
	const env: Record<string, string> = {
		NODE_ENV: 'development',
		PORT: String(port),
		HOST: host,
	};

	if (configPath) {
		env.BUENO_CONFIG = configPath;
	}

	// Display startup info
	cliConsole.header('Starting Development Server');
	cliConsole.log(`${colors.bold('Entry:')} ${entryPoint}`);
	cliConsole.log(`${colors.bold('Port:')} ${port}`);
	cliConsole.log(`${colors.bold('Host:')} ${host}`);
	cliConsole.log(`${colors.bold('Watch:')} ${watch ? colors.green('enabled') : colors.red('disabled')}`);
	cliConsole.log(`${colors.bold('HMR:')} ${hmr ? colors.green('enabled') : colors.red('disabled')}`);
	cliConsole.log('');

	// Start the server using Bun
	const s = spinner('Starting development server...');

	try {
		// Use Bun's spawn to run the dev server
		const proc = Bun.spawn(['bun', 'run', ...bunArgs], {
			cwd: projectRoot,
			env: { ...process.env, ...env },
			stdout: 'inherit',
			stderr: 'inherit',
		});

		s.success(`Development server running at ${colors.cyan(`http://${host}:${port}`)}`);

		// Open browser if requested
		if (openBrowser) {
			const openCommand = process.platform === 'darwin' 
				? 'open' 
				: process.platform === 'win32' 
					? 'start' 
					: 'xdg-open';
			
			Bun.spawn([openCommand, `http://${host}:${port}`], {
				cwd: projectRoot,
			});
		}

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
		name: 'dev',
		description: 'Start the development server with hot reload',
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
				default: 'localhost',
				description: 'Server hostname',
			},
			{
				name: 'no-hmr',
				type: 'boolean',
				default: false,
				description: 'Disable hot module replacement',
			},
			{
				name: 'no-watch',
				type: 'boolean',
				default: false,
				description: 'Disable file watching',
			},
			{
				name: 'open',
				alias: 'o',
				type: 'boolean',
				default: false,
				description: 'Open browser on start',
			},
			{
				name: 'config',
				alias: 'c',
				type: 'string',
				description: 'Path to config file',
			},
		],
		examples: [
			'bueno dev',
			'bueno dev --port 4000',
			'bueno dev --host 0.0.0.0',
			'bueno dev --no-hmr',
			'bueno dev --open',
		],
	},
	handleDev,
);