/**
 * Interactive Prompts for Bueno CLI
 *
 * Provides interactive prompts for user input
 * Falls back to simple input for non-TTY environments
 */

import * as readline from 'readline';
import { colors } from './console';

export interface PromptOptions {
	default?: string;
	validate?: (value: string) => boolean | string;
}

export interface SelectOptions<T = string> {
	default?: T;
	pageSize?: number;
}

export interface ConfirmOptions {
	default?: boolean;
}

export interface MultiSelectOptions<T = string> {
	default?: T[];
	pageSize?: number;
	min?: number;
	max?: number;
}

/**
 * Check if running in interactive mode
 */
export function isInteractive(): boolean {
	return !!(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Create a readline interface
 */
function createRL(): readline.ReadLine {
	return readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
}

/**
 * Prompt for text input
 */
export async function prompt(
	message: string,
	options: PromptOptions = {},
): Promise<string> {
	const defaultValue = options.default;
	const promptText = defaultValue
		? `${colors.cyan('?')} ${message} ${colors.dim(`(${defaultValue})`)}: `
		: `${colors.cyan('?')} ${message}: `;

	if (!isInteractive()) {
		return defaultValue ?? '';
	}

	return new Promise((resolve) => {
		const rl = createRL();

		rl.question(promptText, (answer) => {
			rl.close();

			const value = answer.trim() || defaultValue || '';

			if (options.validate) {
				const result = options.validate(value);
				if (result !== true) {
					const errorMsg = typeof result === 'string' ? result : 'Invalid value';
					process.stdout.write(`${colors.red('✗')} ${errorMsg}\n`);
					// Re-prompt on validation failure
					prompt(message, options).then(resolve);
					return;
				}
			}

			resolve(value);
		});
	});
}

/**
 * Prompt for confirmation (yes/no)
 */
export async function confirm(
	message: string,
	options: ConfirmOptions = {},
): Promise<boolean> {
	const defaultValue = options.default ?? false;
	const hint = defaultValue ? 'Y/n' : 'y/N';

	if (!isInteractive()) {
		return defaultValue;
	}

	const answer = await prompt(`${message} ${colors.dim(`(${hint})`)}`, {
		default: defaultValue ? 'y' : 'n',
		validate: (value) => {
			if (!value) return true;
			return ['y', 'yes', 'n', 'no'].includes(value.toLowerCase()) ||
				'Please enter y or n';
		},
	});

	return ['y', 'yes'].includes(answer.toLowerCase());
}

/**
 * Prompt for selection from a list
 */
export async function select<T extends string>(
	message: string,
	choices: Array<{ value: T; name?: string; disabled?: boolean }>,
	options: SelectOptions<T> = {},
): Promise<T> {
	if (!isInteractive()) {
		return options.default ?? choices[0]?.value as T;
	}

	const pageSize = options.pageSize ?? 10;
	let selectedIndex = choices.findIndex(
		(c) => c.value === options.default && !c.disabled,
	);
	if (selectedIndex === -1) {
		selectedIndex = choices.findIndex((c) => !c.disabled);
	}

	return new Promise((resolve) => {
		// Hide cursor
		process.stdout.write('\x1b[?25l');

		const render = () => {
			// Clear previous output
			const lines = Math.min(choices.length, pageSize);
			process.stdout.write(`\x1b[${lines + 1}A\x1b[0J`);

			// Render prompt
			process.stdout.write(`${colors.cyan('?')} ${message}\n`);

			// Render choices
			const start = Math.max(0, selectedIndex - pageSize + 1);
			const end = Math.min(choices.length, start + pageSize);

			for (let i = start; i < end; i++) {
				const choice = choices[i];
				if (!choice) continue;

				const isSelected = i === selectedIndex;
				const prefix = isSelected ? `${colors.cyan('❯')} ` : '  ';
				const name = choice.name ?? choice.value;
				const text = choice.disabled
					? colors.dim(`${name} (disabled)`)
					: isSelected
						? colors.cyan(name)
						: name;

				process.stdout.write(`${prefix}${text}\n`);
			}
		};

		// Initial render
		process.stdout.write(`${colors.cyan('?')} ${message}\n`);
		render();

		// Handle key input
		const stdin = process.stdin;
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');

		const cleanup = () => {
			stdin.setRawMode(false);
			stdin.pause();
			stdin.removeListener('data', handler);
			// Show cursor
			process.stdout.write('\x1b[?25h');
		};

		const handler = (key: string) => {
			if (key === '\u001b[A' || key === 'k') {
				// Up
				do {
					selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
				} while (choices[selectedIndex]?.disabled);
				render();
			} else if (key === '\u001b[B' || key === 'j') {
				// Down
				do {
					selectedIndex = (selectedIndex + 1) % choices.length;
				} while (choices[selectedIndex]?.disabled);
				render();
			} else if (key === '\r' || key === '\n') {
				// Enter
				cleanup();
				const selected = choices[selectedIndex];
				if (selected) {
					process.stdout.write(
						`\x1b[${Math.min(choices.length, pageSize) + 1}A\x1b[0J`,
					);
					process.stdout.write(
						`${colors.cyan('?')} ${message} ${colors.cyan(selected.name ?? selected.value)}\n`,
					);
					resolve(selected.value);
				}
			} else if (key === '\u001b' || key === '\u0003') {
				// Escape or Ctrl+C
				cleanup();
				process.stdout.write('\n');
				process.exit(130);
			}
		};

		stdin.on('data', handler);
	});
}

/**
 * Prompt for multiple selections
 */
export async function multiSelect<T extends string>(
	message: string,
	choices: Array<{ value: T; name?: string; disabled?: boolean }>,
	options: MultiSelectOptions<T> = {},
): Promise<T[]> {
	if (!isInteractive()) {
		return options.default ?? [];
	}

	const pageSize = options.pageSize ?? 10;
	const selected = new Set<T>(options.default ?? []);
	let currentIndex = 0;

	return new Promise((resolve) => {
		// Hide cursor
		process.stdout.write('\x1b[?25l');

		const render = () => {
			// Clear previous output
			const lines = Math.min(choices.length, pageSize);
			process.stdout.write(`\x1b[${lines + 1}A\x1b[0J`);

			// Render prompt
			process.stdout.write(`${colors.cyan('?')} ${message}\n`);

			// Render choices
			const start = Math.max(0, currentIndex - pageSize + 1);
			const end = Math.min(choices.length, start + pageSize);

			for (let i = start; i < end; i++) {
				const choice = choices[i];
				if (!choice) continue;

				const isCurrent = i === currentIndex;
				const isSelected = selected.has(choice.value);
				const checkbox = isSelected ? `${colors.green('◉')}` : '○';
				const prefix = isCurrent ? `${colors.cyan('❯')} ` : '  ';
				const name = choice.name ?? choice.value;
				const text = choice.disabled
					? colors.dim(`${name} (disabled)`)
					: isCurrent
						? colors.cyan(name)
						: name;

				process.stdout.write(`${prefix}${checkbox} ${text}\n`);
			}
		};

		// Initial render
		process.stdout.write(`${colors.cyan('?')} ${message}\n`);
		render();

		// Handle key input
		const stdin = process.stdin;
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');

		const cleanup = () => {
			stdin.setRawMode(false);
			stdin.pause();
			stdin.removeListener('data', handler);
			// Show cursor
			process.stdout.write('\x1b[?25h');
		};

		const handler = (key: string) => {
			if (key === '\u001b[A' || key === 'k') {
				// Up
				do {
					currentIndex = (currentIndex - 1 + choices.length) % choices.length;
				} while (choices[currentIndex]?.disabled);
				render();
			} else if (key === '\u001b[B' || key === 'j') {
				// Down
				do {
					currentIndex = (currentIndex + 1) % choices.length;
				} while (choices[currentIndex]?.disabled);
				render();
			} else if (key === ' ' || key === 'x') {
				// Toggle selection
				const choice = choices[currentIndex];
				if (choice && !choice.disabled) {
					if (selected.has(choice.value)) {
						if (options.min === undefined || selected.size > options.min) {
							selected.delete(choice.value);
						}
					} else {
						if (options.max === undefined || selected.size < options.max) {
							selected.add(choice.value);
						}
					}
					render();
				}
			} else if (key === '\r' || key === '\n') {
				// Enter
				cleanup();
				const result = Array.from(selected);
				process.stdout.write(
					`\x1b[${Math.min(choices.length, pageSize) + 1}A\x1b[0J`,
				);
				const names = result
					.map((v) => choices.find((c) => c.value === v)?.name ?? v)
					.join(', ');
				process.stdout.write(
					`${colors.cyan('?')} ${message} ${colors.cyan(names || 'none')}\n`,
				);
				resolve(result);
			} else if (key === '\u001b' || key === '\u0003') {
				// Escape or Ctrl+C
				cleanup();
				process.stdout.write('\n');
				process.exit(130);
			}
		};

		stdin.on('data', handler);
	});
}

/**
 * Prompt for a number
 */
export async function number(
	message: string,
	options: PromptOptions & { min?: number; max?: number } = {},
): Promise<number> {
	const value = await prompt(message, {
		...options,
		validate: (v) => {
			if (!v && options.default) return true;
			const num = parseFloat(v);
			if (isNaN(num)) return 'Please enter a valid number';
			if (options.min !== undefined && num < options.min) {
				return `Value must be at least ${options.min}`;
			}
			if (options.max !== undefined && num > options.max) {
				return `Value must be at most ${options.max}`;
			}
			if (options.validate) {
				return options.validate(v);
			}
			return true;
		},
	});

	return parseFloat(value || options.default || '0');
}

/**
 * Prompt for password (hidden input)
 */
export async function password(
	message: string,
	options: Omit<PromptOptions, 'default'> = {},
): Promise<string> {
	if (!isInteractive()) {
		return '';
	}

	return new Promise((resolve) => {
		const stdin = process.stdin;
		const stdout = process.stdout;

		stdout.write(`${colors.cyan('?')} ${message}: `);

		let value = '';

		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding('utf8');

		const cleanup = () => {
			stdin.setRawMode(false);
			stdin.pause();
			stdin.removeListener('data', handler);
		};

		const handler = (key: string) => {
			if (key === '\r' || key === '\n') {
				cleanup();
				stdout.write('\n');
				resolve(value);
			} else if (key === '\u0003') {
				cleanup();
				stdout.write('\n');
				process.exit(130);
			} else if (key === '\u007f' || key === '\b') {
				// Backspace
				value = value.slice(0, -1);
			} else if (key[0] !== '\x1b') {
				value += key;
			}
		};

		stdin.on('data', handler);
	});
}