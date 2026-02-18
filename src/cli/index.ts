/**
 * Bueno CLI Entry Point
 *
 * Main entry point for the Bueno CLI
 */

import { parseArgs, hasFlag, generateGlobalHelpText, generateHelpText, type ParsedArgs } from './core/args';
import { cliConsole, colors, setColorEnabled } from './core/console';
import { registry } from './commands';

// Import commands to register them
import './commands/new';
import './commands/generate';
import './commands/migration';
import './commands/dev';
import './commands/build';
import './commands/start';
import './commands/help';

// CLI version (should match package.json)
const VERSION = '0.1.0';

/**
 * CLI error types
 */
export enum CLIErrorType {
	INVALID_ARGS = 'INVALID_ARGS',
	FILE_EXISTS = 'FILE_EXISTS',
	FILE_NOT_FOUND = 'FILE_NOT_FOUND',
	MODULE_NOT_FOUND = 'MODULE_NOT_FOUND',
	TEMPLATE_ERROR = 'TEMPLATE_ERROR',
	DATABASE_ERROR = 'DATABASE_ERROR',
	NETWORK_ERROR = 'NETWORK_ERROR',
	PERMISSION_ERROR = 'PERMISSION_ERROR',
	NOT_FOUND = 'NOT_FOUND',
}

/**
 * CLI Error class
 */
export class CLIError extends Error {
	constructor(
		message: string,
		public readonly type: CLIErrorType,
		public readonly exitCode = 1,
	) {
		super(message);
		this.name = 'CLIError';
	}
}

/**
 * Run the CLI
 */
export async function run(argv: string[] = process.argv.slice(2)): Promise<void> {
	// Parse arguments
	const args = parseArgs(argv);

	// Handle global options
	if (hasFlag(args, 'no-color')) {
		setColorEnabled(false);
	}

	if (hasFlag(args, 'verbose')) {
		process.env.BUENO_VERBOSE = 'true';
	}

	if (hasFlag(args, 'quiet')) {
		process.env.BUENO_QUIET = 'true';
	}

	// Show version
	if (hasFlag(args, 'version') || hasFlag(args, 'v')) {
		cliConsole.log(`bueno v${VERSION}`);
		process.exit(0);
	}

	// Show help if no command or help flag
	if (!args.command || hasFlag(args, 'help') || hasFlag(args, 'h')) {
		if (args.command && registry.has(args.command)) {
			// Show command-specific help
			const cmd = registry.get(args.command);
			if (cmd) {
				cliConsole.log(generateHelpText(cmd.definition));
			}
		} else {
			// Show global help
			cliConsole.log(generateGlobalHelpText(registry.getAll()));
		}
		process.exit(0);
	}

	// Execute command
	try {
		await registry.execute(args.command, args);
	} catch (error) {
		if (error instanceof CLIError) {
			cliConsole.error(error.message);
			process.exit(error.exitCode);
		}

		if (error instanceof Error) {
			if (process.env.BUENO_VERBOSE === 'true') {
				cliConsole.error(error.stack ?? error.message);
			} else {
				cliConsole.error(error.message);
			}
		}
		process.exit(1);
	}
}

/**
 * Run CLI and handle process events
 */
export async function main(): Promise<void> {
	// Handle Ctrl+C gracefully
	process.on('SIGINT', () => {
		cliConsole.newline();
		process.exit(130);
	});

	// Handle unhandled rejections
	process.on('unhandledRejection', (reason) => {
		cliConsole.error('Unhandled rejection:', reason);
		process.exit(1);
	});

	await run();
}

// Export for programmatic use
export { registry, defineCommand, command } from './commands';
export * from './core';
export * from './utils';