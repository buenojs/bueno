/**
 * Help Command
 *
 * Display help information for commands
 */

import { defineCommand } from './index';
import { generateGlobalHelpText, generateHelpText, hasFlag } from '../core/args';
import { cliConsole } from '../core/console';
import { registry } from './index';

defineCommand(
	{
		name: 'help',
		description: 'Show help information for commands',
		positionals: [
			{
				name: 'command',
				required: false,
				description: 'Command to show help for',
			},
		],
		options: [
			{
				name: 'all',
				alias: 'a',
				type: 'boolean',
				default: false,
				description: 'Show help for all commands',
			},
		],
	},
	async (args) => {
		const commandName = args.positionals[0];

		if (commandName && registry.has(commandName)) {
			// Show help for specific command
			const cmd = registry.get(commandName);
			if (cmd) {
				cliConsole.log(generateHelpText(cmd.definition));
			}
		} else if (hasFlag(args, 'all')) {
			// Show detailed help for all commands
			cliConsole.log('\nBueno CLI - Available Commands\n');

			for (const cmd of registry.getAll()) {
				cliConsole.log(generateHelpText(cmd));
				cliConsole.log('---');
			}
		} else {
			// Show global help
			cliConsole.log(generateGlobalHelpText(registry.getAll()));
		}
	},
);