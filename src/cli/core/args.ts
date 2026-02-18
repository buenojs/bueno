/**
 * Argument Parser for Bueno CLI
 *
 * Parses command line arguments using Bun's native process.argv
 * Supports positional arguments, flags, and options
 */

export interface ParsedArgs {
	command: string;
	positionals: string[];
	options: Record<string, string | boolean | number>;
	flags: Set<string>;
}

export interface OptionDefinition {
	name: string;
	alias?: string;
	type: 'string' | 'boolean' | 'number';
	default?: string | boolean | number;
	description: string;
}

export interface CommandDefinition {
	name: string;
	alias?: string;
	description: string;
	options?: OptionDefinition[];
	positionals?: { name: string; required: boolean; description: string }[];
	examples?: string[];
}

/**
 * Parse command line arguments
 */
export function parseArgs(
	argv: string[] = process.argv.slice(2),
): ParsedArgs {
	const result: ParsedArgs = {
		command: '',
		positionals: [],
		options: {},
		flags: new Set(),
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];

		if (!arg) continue;

		// Long option: --option=value or --option value
		if (arg.startsWith('--')) {
			const eqIndex = arg.indexOf('=');
			if (eqIndex !== -1) {
				// --option=value
				const name = arg.slice(2, eqIndex);
				const value = arg.slice(eqIndex + 1);
				result.options[name] = value;
			} else {
				// --option value or --flag
				const name = arg.slice(2);
				const nextArg = argv[i + 1];

				// Check if it's a flag (no value or next arg starts with -)
				if (!nextArg || nextArg.startsWith('-')) {
					result.options[name] = true;
					result.flags.add(name);
				} else {
					result.options[name] = nextArg;
					i++; // Skip next arg as it's the value
				}
			}
		}
		// Short option: -o value or -abc (multiple flags)
		else if (arg.startsWith('-') && arg.length > 1) {
			const chars = arg.slice(1);

			// Check if it's a combined flag like -abc
			if (chars.length > 1) {
				// Treat each char as a flag
				for (const char of chars) {
					result.options[char] = true;
					result.flags.add(char);
				}
			} else {
				// Single short option
				const name = chars;
				const nextArg = argv[i + 1];

				if (!nextArg || nextArg.startsWith('-')) {
					result.options[name] = true;
					result.flags.add(name);
				} else {
					result.options[name] = nextArg;
					i++; // Skip next arg as it's the value
				}
			}
		}
		// Positional argument
		else {
			if (!result.command) {
				result.command = arg;
			} else {
				result.positionals.push(arg);
			}
		}
	}

	return result;
}

/**
 * Get option value with type coercion and default
 */
export function getOption<T extends string | boolean | number>(
	parsed: ParsedArgs,
	name: string,
	definition: OptionDefinition,
): T {
	const value = parsed.options[name] ?? parsed.options[definition.alias ?? ''];

	if (value === undefined) {
		return definition.default as T;
	}

	if (definition.type === 'boolean') {
		return (value === true || value === 'true') as T;
	}

	if (definition.type === 'number') {
		return (typeof value === 'number' ? value : typeof value === 'string' ? parseInt(value, 10) : NaN) as T;
	}

	return value as T;
}

/**
 * Check if a flag is set
 */
export function hasFlag(parsed: ParsedArgs, name: string, alias?: string): boolean {
	return parsed.flags.has(name) || (alias ? parsed.flags.has(alias) : false);
}

/**
 * Check if an option is set (either as flag or with value)
 */
export function hasOption(parsed: ParsedArgs, name: string, alias?: string): boolean {
	return name in parsed.options || (alias ? alias in parsed.options : false);
}

/**
 * Get all values for an option that can be specified multiple times
 * Parses raw argv to collect all occurrences of the option
 */
export function getOptionValues(parsed: ParsedArgs, name: string, alias?: string): string[] {
	const values: string[] = [];
	const argv = process.argv.slice(2);
	
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg) continue;
		
		// Long option: --name value or --name=value
		if (arg === `--${name}`) {
			const nextArg = argv[i + 1];
			if (nextArg && !nextArg.startsWith('-')) {
				values.push(nextArg);
				i++; // Skip next arg
			}
		} else if (arg.startsWith(`--${name}=`)) {
			const value = arg.slice(name.length + 3); // --name=
			values.push(value);
		}
		// Short option: -n value
		else if (alias && arg === `-${alias}`) {
			const nextArg = argv[i + 1];
			if (nextArg && !nextArg.startsWith('-')) {
				values.push(nextArg);
				i++; // Skip next arg
			}
		}
	}
	
	return values;
}

/**
 * Generate help text from command definition
 */
export function generateHelpText(
	command: CommandDefinition,
	cliName = 'bueno',
): string {
	const lines: string[] = [];

	// Description
	lines.push(`\n${command.description}\n`);

	// Usage
	lines.push('Usage:');
	let usage = `  ${cliName} ${command.name}`;

	if (command.positionals) {
		for (const pos of command.positionals) {
			usage += pos.required ? ` <${pos.name}>` : ` [${pos.name}]`;
		}
	}

	usage += ' [options]';
	lines.push(usage + '\n');

	// Positionals
	if (command.positionals && command.positionals.length > 0) {
		lines.push('Arguments:');
		for (const pos of command.positionals) {
			const required = pos.required ? ' (required)' : '';
			lines.push(`  ${pos.name.padEnd(20)} ${pos.description}${required}`);
		}
		lines.push('');
	}

	// Options
	if (command.options && command.options.length > 0) {
		lines.push('Options:');
		for (const opt of command.options) {
			let flag = `--${opt.name}`;
			if (opt.alias) {
				flag = `-${opt.alias}, ${flag}`;
			}

			let defaultValue = '';
			if (opt.default !== undefined) {
				defaultValue = ` (default: ${opt.default})`;
			}

			lines.push(`  ${flag.padEnd(20)} ${opt.description}${defaultValue}`);
		}
		lines.push('');
	}

	// Examples
	if (command.examples && command.examples.length > 0) {
		lines.push('Examples:');
		for (const example of command.examples) {
			lines.push(`  ${example}`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

/**
 * Generate global help text
 */
export function generateGlobalHelpText(
	commands: CommandDefinition[],
	cliName = 'bueno',
): string {
	const lines: string[] = [];

	lines.push(`\n${cliName} - A Bun-Native Full-Stack Framework CLI\n`);
	lines.push('Usage:');
	lines.push(`  ${cliName} <command> [options]\n`);

	lines.push('Commands:');
	for (const cmd of commands) {
		const name = cmd.alias ? `${cmd.name} (${cmd.alias})` : cmd.name;
		lines.push(`  ${name.padEnd(20)} ${cmd.description}`);
	}
	lines.push('');

	lines.push('Global Options:');
	lines.push('  --help, -h          Show help for command');
	lines.push('  --version, -v       Show CLI version');
	lines.push('  --verbose           Enable verbose output');
	lines.push('  --quiet             Suppress non-essential output');
	lines.push('  --no-color          Disable colored output');
	lines.push('');

	lines.push(`Run '${cliName} <command> --help' for more information about a command.\n`);

	return lines.join('\n');
}