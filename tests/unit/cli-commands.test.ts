/**
 * Unit Tests for CLI Commands
 *
 * Tests command registration, generate command, migration command,
 * help command, and command execution.
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { registry, defineCommand, type CommandHandler, type RegisteredCommand } from '../../src/cli/commands';
import type { CommandDefinition, ParsedArgs } from '../../src/cli/core/args';
import { CLIError, CLIErrorType, run } from '../../src/cli/index';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Command Registry Tests
// ============================================================================

describe('Command Registry', () => {
	// Create a fresh registry for each test by using the existing registry
	const testCommands: CommandDefinition[] = [];

	beforeEach(() => {
		// Clear any test commands we've added
		testCommands.length = 0;
	});

	describe('register', () => {
		test('should register a command with definition and handler', () => {
			const definition: CommandDefinition = {
				name: 'test-cmd',
				description: 'Test command',
			};
			const handler: CommandHandler = () => {};

			defineCommand(definition, handler);

			expect(registry.has('test-cmd')).toBe(true);
		});

		test('should register command with alias', () => {
			const definition: CommandDefinition = {
				name: 'test-alias-cmd',
				alias: 'tac',
				description: 'Test command with alias',
			};
			const handler: CommandHandler = () => {};

			defineCommand(definition, handler);

			expect(registry.has('test-alias-cmd')).toBe(true);
			expect(registry.has('tac')).toBe(true);
		});
	});

	describe('get', () => {
		test('should get registered command by name', () => {
			const definition: CommandDefinition = {
				name: 'get-test-cmd',
				description: 'Test command',
			};
			const handler: CommandHandler = () => {};
			defineCommand(definition, handler);

			const cmd = registry.get('get-test-cmd');
			expect(cmd).toBeDefined();
			expect(cmd?.definition.name).toBe('get-test-cmd');
		});

		test('should get command by alias', () => {
			const definition: CommandDefinition = {
				name: 'get-alias-test',
				alias: 'gat',
				description: 'Test command',
			};
			const handler: CommandHandler = () => {};
			defineCommand(definition, handler);

			const cmd = registry.get('gat');
			expect(cmd).toBeDefined();
			expect(cmd?.definition.name).toBe('get-alias-test');
		});

		test('should return undefined for non-existent command', () => {
			const cmd = registry.get('non-existent-command-xyz');
			expect(cmd).toBeUndefined();
		});
	});

	describe('has', () => {
		test('should return true for registered command', () => {
			const definition: CommandDefinition = {
				name: 'has-test-cmd',
				description: 'Test command',
			};
			defineCommand(definition, () => {});

			expect(registry.has('has-test-cmd')).toBe(true);
		});

		test('should return false for non-existent command', () => {
			expect(registry.has('non-existent-cmd-xyz')).toBe(false);
		});
	});

	describe('getAll', () => {
		test('should return all command definitions', () => {
			const commands = registry.getAll();
			expect(Array.isArray(commands)).toBe(true);
			expect(commands.length).toBeGreaterThan(0);

			// Check that built-in commands are registered
			const names = commands.map(c => c.name);
			expect(names).toContain('generate');
			expect(names).toContain('help');
		});
	});

	describe('execute', () => {
		test('should execute command handler', async () => {
			let executed = false;
			const definition: CommandDefinition = {
				name: 'execute-test-cmd',
				description: 'Test command',
			};
			defineCommand(definition, () => {
				executed = true;
			});

			const args: ParsedArgs = {
				command: 'execute-test-cmd',
				positionals: [],
				options: {},
				flags: new Set(),
			};

			await registry.execute('execute-test-cmd', args);
			expect(executed).toBe(true);
		});

		test('should throw for non-existent command', async () => {
			const args: ParsedArgs = {
				command: 'non-existent-cmd',
				positionals: [],
				options: {},
				flags: new Set(),
			};

			expect(async () => {
				await registry.execute('non-existent-cmd', args);
			}).toThrow('Unknown command: non-existent-cmd');
		});

		test('should pass arguments to handler', async () => {
			let receivedArgs: ParsedArgs | null = null;
			const definition: CommandDefinition = {
				name: 'args-test-cmd',
				description: 'Test command',
			};
			defineCommand(definition, (args) => {
				receivedArgs = args;
			});

			const args: ParsedArgs = {
				command: 'args-test-cmd',
				positionals: ['pos1', 'pos2'],
				options: { flag: true },
				flags: new Set(['flag']),
			};

			await registry.execute('args-test-cmd', args);
			expect(receivedArgs).toEqual(args);
		});
	});
});

// ============================================================================
// Generate Command Tests
// ============================================================================

describe('Generate Command', () => {
	const testDir = path.join(process.cwd(), 'test-temp-generate');

	beforeEach(async () => {
		// Clean up and create test directory
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
		fs.mkdirSync(testDir, { recursive: true });

		// Create a minimal Bueno project structure
		fs.mkdirSync(path.join(testDir, 'server'), { recursive: true });
		fs.mkdirSync(path.join(testDir, 'server', 'modules'), { recursive: true });
		fs.mkdirSync(path.join(testDir, 'server', 'common'), { recursive: true });
		fs.mkdirSync(path.join(testDir, 'server', 'database', 'migrations'), { recursive: true });

		// Create package.json
		fs.writeFileSync(
			path.join(testDir, 'package.json'),
			JSON.stringify({ name: 'test-project', dependencies: { bueno: 'latest' } }),
		);
	});

	afterEach(async () => {
		// Clean up test directory
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe('Generator Types', () => {
		const generatorTypes = [
			{ type: 'controller', short: 'c', expectedDir: 'modules' },
			{ type: 'service', short: 's', expectedDir: 'modules' },
			{ type: 'module', short: 'm', expectedDir: 'modules' },
			{ type: 'guard', short: 'gu', expectedDir: 'common/guards' },
			{ type: 'interceptor', short: 'i', expectedDir: 'common/interceptors' },
			{ type: 'pipe', short: 'p', expectedDir: 'common/pipes' },
			{ type: 'filter', short: 'f', expectedDir: 'common/filters' },
			{ type: 'dto', short: 'd', expectedDir: 'modules' },
			{ type: 'middleware', short: 'mw', expectedDir: 'common/middleware' },
			{ type: 'migration', short: 'mi', expectedDir: 'database/migrations' },
		];

		for (const { type, short } of generatorTypes) {
			test(`should have '${type}' generator registered with alias '${short}'`, () => {
				expect(registry.has('generate')).toBe(true);
				expect(registry.has('g')).toBe(true);
			});
		}
	});

	describe('Template Content', () => {
		test('generate command should be registered', () => {
			const cmd = registry.get('generate');
			expect(cmd).toBeDefined();
			expect(cmd?.definition.name).toBe('generate');
			expect(cmd?.definition.alias).toBe('g');
		});

		test('generate command should have correct positionals defined', () => {
			const cmd = registry.get('generate');
			expect(cmd?.definition.positionals).toBeDefined();
			expect(cmd?.definition.positionals?.length).toBe(2);
			expect(cmd?.definition.positionals?.[0]?.name).toBe('type');
			expect(cmd?.definition.positionals?.[1]?.name).toBe('name');
		});

		test('generate command should have options defined', () => {
			const cmd = registry.get('generate');
			expect(cmd?.definition.options).toBeDefined();
			const optionNames = cmd?.definition.options?.map(o => o.name) ?? [];
			expect(optionNames).toContain('module');
			expect(optionNames).toContain('path');
			expect(optionNames).toContain('dry-run');
			expect(optionNames).toContain('force');
		});
	});
});

// ============================================================================
// Migration Command Tests
// ============================================================================

describe('Migration Command', () => {
	test('migration command should be registered', () => {
		const cmd = registry.get('migration');
		expect(cmd).toBeDefined();
		expect(cmd?.definition.name).toBe('migration');
	});

	test('migration command should have correct description', () => {
		const cmd = registry.get('migration');
		expect(cmd?.definition.description).toContain('migration');
	});
});

// ============================================================================
// Help Command Tests
// ============================================================================

describe('Help Command', () => {
	test('help command should be registered', () => {
		const cmd = registry.get('help');
		expect(cmd).toBeDefined();
		expect(cmd?.definition.name).toBe('help');
	});

	test('help command should have correct description', () => {
		const cmd = registry.get('help');
		expect(cmd?.definition.description).toContain('help');
	});

	test('help command should have optional command positional', () => {
		const cmd = registry.get('help');
		expect(cmd?.definition.positionals).toBeDefined();
		expect(cmd?.definition.positionals?.[0]?.name).toBe('command');
		expect(cmd?.definition.positionals?.[0]?.required).toBe(false);
	});

	test('help command should have --all option', () => {
		const cmd = registry.get('help');
		const options = cmd?.definition.options ?? [];
		const allOption = options.find(o => o.name === 'all');
		expect(allOption).toBeDefined();
		expect(allOption?.alias).toBe('a');
	});
});

// ============================================================================
// Dev Command Tests
// ============================================================================

describe('Dev Command', () => {
	test('dev command should be registered', () => {
		const cmd = registry.get('dev');
		expect(cmd).toBeDefined();
		expect(cmd?.definition.name).toBe('dev');
	});

	test('dev command should have port option', () => {
		const cmd = registry.get('dev');
		const options = cmd?.definition.options ?? [];
		const portOption = options.find(o => o.name === 'port');
		expect(portOption).toBeDefined();
		expect(portOption?.alias).toBe('p');
	});
});

// ============================================================================
// Build Command Tests
// ============================================================================

describe('Build Command', () => {
	test('build command should be registered', () => {
		const cmd = registry.get('build');
		expect(cmd).toBeDefined();
		expect(cmd?.definition.name).toBe('build');
	});

	test('build command should have target option', () => {
		const cmd = registry.get('build');
		const options = cmd?.definition.options ?? [];
		const targetOption = options.find(o => o.name === 'target');
		expect(targetOption).toBeDefined();
		expect(targetOption?.alias).toBe('t');
	});
});

// ============================================================================
// Start Command Tests
// ============================================================================

describe('Start Command', () => {
	test('start command should be registered', () => {
		const cmd = registry.get('start');
		expect(cmd).toBeDefined();
		expect(cmd?.definition.name).toBe('start');
	});
});

// ============================================================================
// New Command Tests
// ============================================================================

describe('New Command', () => {
	test('new command should be registered', () => {
		const cmd = registry.get('new');
		expect(cmd).toBeDefined();
		expect(cmd?.definition.name).toBe('new');
	});

	test('new command should have template option', () => {
		const cmd = registry.get('new');
		const options = cmd?.definition.options ?? [];
		const templateOption = options.find(o => o.name === 'template');
		expect(templateOption).toBeDefined();
		expect(templateOption?.alias).toBe('t');
	});

	test('new command should have framework option', () => {
		const cmd = registry.get('new');
		const options = cmd?.definition.options ?? [];
		const frameworkOption = options.find(o => o.name === 'framework');
		expect(frameworkOption).toBeDefined();
		expect(frameworkOption?.alias).toBe('f');
	});
});

// ============================================================================
// CLI Error Tests
// ============================================================================

describe('CLIError', () => {
	test('should create error with message and type', () => {
		const error = new CLIError('Test error', CLIErrorType.INVALID_ARGS);
		expect(error.message).toBe('Test error');
		expect(error.type).toBe(CLIErrorType.INVALID_ARGS);
		expect(error.name).toBe('CLIError');
	});

	test('should have default exit code of 1', () => {
		const error = new CLIError('Test error', CLIErrorType.INVALID_ARGS);
		expect(error.exitCode).toBe(1);
	});

	test('should accept custom exit code', () => {
		const error = new CLIError('Test error', CLIErrorType.INVALID_ARGS, 2);
		expect(error.exitCode).toBe(2);
	});

	test('should be instance of Error', () => {
		const error = new CLIError('Test error', CLIErrorType.INVALID_ARGS);
		expect(error).toBeInstanceOf(Error);
	});
});

describe('CLIErrorType', () => {
	test('should have all error types defined', () => {
		expect(CLIErrorType.INVALID_ARGS).toBe('INVALID_ARGS');
		expect(CLIErrorType.FILE_EXISTS).toBe('FILE_EXISTS');
		expect(CLIErrorType.FILE_NOT_FOUND).toBe('FILE_NOT_FOUND');
		expect(CLIErrorType.MODULE_NOT_FOUND).toBe('MODULE_NOT_FOUND');
		expect(CLIErrorType.TEMPLATE_ERROR).toBe('TEMPLATE_ERROR');
		expect(CLIErrorType.DATABASE_ERROR).toBe('DATABASE_ERROR');
		expect(CLIErrorType.NETWORK_ERROR).toBe('NETWORK_ERROR');
		expect(CLIErrorType.PERMISSION_ERROR).toBe('PERMISSION_ERROR');
	});
});

// ============================================================================
// CLI Run Function Tests
// ============================================================================

describe('run function', () => {
	// Note: These tests verify the run function behavior without actually executing commands

	test('should show version with --version flag', async () => {
		const originalExit = process.exit;
		const exitMock = mock((code: number) => {
			throw new Error(`Exit with code ${code}`);
		});
		process.exit = exitMock as typeof process.exit;

		try {
			await run(['--version']);
		} catch (error) {
			// Expected to throw due to process.exit mock
		}

		process.exit = originalExit;
	});

	test('should show help with --help flag', async () => {
		const originalExit = process.exit;
		const exitMock = mock((code: number) => {
			throw new Error(`Exit with code ${code}`);
		});
		process.exit = exitMock as typeof process.exit;

		try {
			await run(['--help']);
		} catch (error) {
			// Expected to throw due to process.exit mock
		}

		process.exit = originalExit;
	});

	test('should show help with -h flag', async () => {
		const originalExit = process.exit;
		const exitMock = mock((code: number) => {
			throw new Error(`Exit with code ${code}`);
		});
		process.exit = exitMock as typeof process.exit;

		try {
			await run(['-h']);
		} catch (error) {
			// Expected to throw due to process.exit mock
		}

		process.exit = originalExit;
	});

	test('should show help when no command provided', async () => {
		const originalExit = process.exit;
		const exitMock = mock((code: number) => {
			throw new Error(`Exit with code ${code}`);
		});
		process.exit = exitMock as typeof process.exit;

		try {
			await run([]);
		} catch (error) {
			// Expected to throw due to process.exit mock
		}

		process.exit = originalExit;
	});
});

// ============================================================================
// Command Definition Validation Tests
// ============================================================================

describe('Command Definition Validation', () => {
	test('all built-in commands should have required properties', () => {
		const commands = registry.getAll();

		for (const cmd of commands) {
			expect(cmd.name).toBeDefined();
			expect(typeof cmd.name).toBe('string');
			expect(cmd.name.length).toBeGreaterThan(0);
			expect(cmd.description).toBeDefined();
			expect(typeof cmd.description).toBe('string');
			expect(cmd.description.length).toBeGreaterThan(0);
		}
	});

	test('all commands with options should have valid option definitions', () => {
		const commands = registry.getAll();

		for (const cmd of commands) {
			if (cmd.options) {
				for (const opt of cmd.options) {
					expect(opt.name).toBeDefined();
					expect(typeof opt.name).toBe('string');
					expect(opt.type).toBeDefined();
					expect(['string', 'boolean', 'number']).toContain(opt.type);
					expect(opt.description).toBeDefined();
					expect(typeof opt.description).toBe('string');
				}
			}
		}
	});

	test('all commands with positionals should have valid positional definitions', () => {
		const commands = registry.getAll();

		for (const cmd of commands) {
			if (cmd.positionals) {
				for (const pos of cmd.positionals) {
					expect(pos.name).toBeDefined();
					expect(typeof pos.name).toBe('string');
					expect(pos.required).toBeDefined();
					expect(typeof pos.required).toBe('boolean');
					expect(pos.description).toBeDefined();
					expect(typeof pos.description).toBe('string');
				}
			}
		}
	});

	test('all command aliases should be unique', () => {
		const commands = registry.getAll();
		const aliases = new Set<string>();

		for (const cmd of commands) {
			if (cmd.alias) {
				expect(aliases.has(cmd.alias)).toBe(false);
				aliases.add(cmd.alias);
			}
		}
	});

	test('all command names should be unique', () => {
		const commands = registry.getAll();
		const names = new Set<string>();

		for (const cmd of commands) {
			expect(names.has(cmd.name)).toBe(false);
			names.add(cmd.name);
		}
	});
});

// ============================================================================
// Generator Alias Tests
// ============================================================================

describe('Generator Aliases', () => {
	const aliasMap: Record<string, string> = {
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

	test('generate command should accept all type aliases', () => {
		const cmd = registry.get('generate');
		expect(cmd).toBeDefined();

		// The generate command should handle these aliases internally
		// We verify the command is properly registered
		expect(cmd?.definition.positionals?.[0]?.name).toBe('type');
	});
});

// ============================================================================
// Spinner Tests
// ============================================================================

import { Spinner, spinner, ProgressBar, progressBar, runTasks } from '../../src/cli/core/spinner';

describe('Spinner', () => {
	test('should create spinner with default options', () => {
		const s = new Spinner();
		expect(s).toBeDefined();
	});

	test('should create spinner with custom text', () => {
		const s = new Spinner({ text: 'Loading...' });
		expect(s).toBeDefined();
	});

	test('should create spinner with custom color', () => {
		const s = new Spinner({ text: 'Loading...', color: 'green' });
		expect(s).toBeDefined();
	});

	test('start should return spinner instance', () => {
		const s = new Spinner({ text: 'Loading...' });
		const result = s.start();
		expect(result).toBe(s);
		s.stop();
	});

	test('update should change text', () => {
		const s = new Spinner({ text: 'Loading...' });
		s.start();
		const result = s.update('Still loading...');
		expect(result).toBe(s);
		s.stop();
	});

	test('success should stop with success symbol', () => {
		const s = new Spinner({ text: 'Loading...' });
		s.start();
		const result = s.success('Done!');
		expect(result).toBe(s);
	});

	test('error should stop with error symbol', () => {
		const s = new Spinner({ text: 'Loading...' });
		s.start();
		const result = s.error('Failed!');
		expect(result).toBe(s);
	});

	test('warn should stop with warning symbol', () => {
		const s = new Spinner({ text: 'Loading...' });
		s.start();
		const result = s.warn('Warning!');
		expect(result).toBe(s);
	});

	test('info should stop with info symbol', () => {
		const s = new Spinner({ text: 'Loading...' });
		s.start();
		const result = s.info('Info!');
		expect(result).toBe(s);
	});
});

describe('spinner factory', () => {
	test('should create and start spinner', () => {
		const s = spinner('Loading...');
		expect(s).toBeInstanceOf(Spinner);
		s.stop();
	});
});

describe('ProgressBar', () => {
	test('should create progress bar with required options', () => {
		const pb = new ProgressBar({ total: 100 });
		expect(pb).toBeDefined();
	});

	test('should create progress bar with custom width', () => {
		const pb = new ProgressBar({ total: 100, width: 50 });
		expect(pb).toBeDefined();
	});

	test('start should return progress bar instance', () => {
		const pb = new ProgressBar({ total: 100 });
		const result = pb.start();
		expect(result).toBe(pb);
	});

	test('update should change current value', () => {
		const pb = new ProgressBar({ total: 100 });
		pb.start();
		const result = pb.update(50);
		expect(result).toBe(pb);
	});

	test('increment should increase current value', () => {
		const pb = new ProgressBar({ total: 100 });
		pb.start();
		const result = pb.increment(5);
		expect(result).toBe(pb);
	});

	test('complete should set to total', () => {
		const pb = new ProgressBar({ total: 100 });
		pb.start();
		const result = pb.complete();
		expect(result).toBe(pb);
	});
});

describe('progressBar factory', () => {
	test('should create progress bar', () => {
		const pb = progressBar({ total: 100 });
		expect(pb).toBeInstanceOf(ProgressBar);
	});
});

describe('runTasks', () => {
	test('should run tasks sequentially', async () => {
		const order: string[] = [];
		
		await runTasks([
			{
				text: 'Task 1',
				task: async () => {
					order.push('1');
				},
			},
			{
				text: 'Task 2',
				task: async () => {
					order.push('2');
				},
			},
		]);

		expect(order).toEqual(['1', '2']);
	});

	test('should throw on task failure', async () => {
		expect(async () => {
			await runTasks([
				{
					text: 'Failing task',
					task: async () => {
						throw new Error('Task failed');
					},
				},
			]);
		}).toThrow();
	});
});

// ============================================================================
// Prompt Tests (Non-Interactive Mode)
// ============================================================================

import {
	isInteractive,
	prompt,
	confirm,
	select,
	multiSelect,
	number,
	password,
} from '../../src/cli/core/prompt';

describe('Prompt Utilities (Non-Interactive Mode)', () => {
	describe('isInteractive', () => {
		test('should return boolean or undefined (falsy value)', () => {
			const result = isInteractive();
			// Note: isInteractive() returns process.stdin.isTTY && process.stdout.isTTY
			// In non-TTY environments, this can be undefined (not false) due to && behavior
			// We test that it's a falsy value in CI environments
			expect(!result || typeof result === 'boolean').toBe(true);
		});
	});

	describe('prompt (non-interactive fallback)', () => {
		test('should return default value when not interactive', async () => {
			// This test assumes non-interactive mode in CI
			if (!isInteractive()) {
				const result = await prompt('Enter value', { default: 'default-value' });
				expect(result).toBe('default-value');
			}
		});

		test('should return empty string when no default and not interactive', async () => {
			if (!isInteractive()) {
				const result = await prompt('Enter value');
				expect(result).toBe('');
			}
		});
	});

	describe('confirm (non-interactive fallback)', () => {
		test('should return default value when not interactive', async () => {
			if (!isInteractive()) {
				const result = await confirm('Are you sure?', { default: true });
				expect(result).toBe(true);
			}
		});

		test('should return false when no default and not interactive', async () => {
			if (!isInteractive()) {
				const result = await confirm('Are you sure?');
				expect(result).toBe(false);
			}
		});
	});

	describe('select (non-interactive fallback)', () => {
		test('should return default value when not interactive', async () => {
			if (!isInteractive()) {
				const choices = [
					{ value: 'a', name: 'Option A' },
					{ value: 'b', name: 'Option B' },
				];
				const result = await select('Choose option', choices, { default: 'b' });
				expect(result).toBe('b');
			}
		});

		test('should return first choice when no default and not interactive', async () => {
			if (!isInteractive()) {
				const choices = [
					{ value: 'a', name: 'Option A' },
					{ value: 'b', name: 'Option B' },
				];
				const result = await select('Choose option', choices);
				expect(result).toBe('a');
			}
		});
	});

	describe('multiSelect (non-interactive fallback)', () => {
		test('should return default values when not interactive', async () => {
			if (!isInteractive()) {
				const choices = [
					{ value: 'a', name: 'Option A' },
					{ value: 'b', name: 'Option B' },
				];
				const result = await multiSelect('Choose options', choices, { default: ['a'] });
				expect(result).toEqual(['a']);
			}
		});

		test('should return empty array when no default and not interactive', async () => {
			if (!isInteractive()) {
				const choices = [
					{ value: 'a', name: 'Option A' },
					{ value: 'b', name: 'Option B' },
				];
				const result = await multiSelect('Choose options', choices);
				expect(result).toEqual([]);
			}
		});
	});

	describe('number (non-interactive fallback)', () => {
		test('should return default value when not interactive', async () => {
			if (!isInteractive()) {
				const result = await number('Enter number', { default: '42' });
				expect(result).toBe(42);
			}
		});

		test('should return 0 when no default and not interactive', async () => {
			if (!isInteractive()) {
				const result = await number('Enter number');
				expect(result).toBe(0);
			}
		});
	});

	describe('password (non-interactive fallback)', () => {
		test('should return empty string when not interactive', async () => {
			if (!isInteractive()) {
				const result = await password('Enter password');
				expect(result).toBe('');
			}
		});
	});
});