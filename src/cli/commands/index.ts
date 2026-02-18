/**
 * Command Registry for Bueno CLI
 *
 * Manages command registration and execution
 */

import type { CommandDefinition, ParsedArgs } from '../core/args';

/**
 * Command handler function type
 */
export type CommandHandler = (args: ParsedArgs) => Promise<void> | void;

/**
 * Registered command
 */
export interface RegisteredCommand {
	definition: CommandDefinition;
	handler: CommandHandler;
}

/**
 * Command registry
 */
class CommandRegistry {
	private commands: Map<string, RegisteredCommand> = new Map();
	private aliases: Map<string, string> = new Map();

	/**
	 * Register a command
	 */
	register(
		definition: CommandDefinition,
		handler: CommandHandler,
	): void {
		this.commands.set(definition.name, {
			definition,
			handler,
		});

		if (definition.alias) {
			this.aliases.set(definition.alias, definition.name);
		}
	}

	/**
	 * Get a command by name or alias
	 */
	get(name: string): RegisteredCommand | undefined {
		const commandName = this.aliases.get(name) ?? name;
		return this.commands.get(commandName);
	}

	/**
	 * Check if a command exists
	 */
	has(name: string): boolean {
		const commandName = this.aliases.get(name) ?? name;
		return this.commands.has(commandName);
	}

	/**
	 * Get all command definitions
	 */
	getAll(): CommandDefinition[] {
		return Array.from(this.commands.values()).map((c) => c.definition);
	}

	/**
	 * Get all registered commands
	 */
	getCommands(): Map<string, RegisteredCommand> {
		return new Map(this.commands);
	}

	/**
	 * Execute a command
	 */
	async execute(name: string, args: ParsedArgs): Promise<void> {
		const command = this.get(name);

		if (!command) {
			throw new Error(`Unknown command: ${name}`);
		}

		await command.handler(args);
	}
}

// Global command registry instance
export const registry = new CommandRegistry();

/**
 * Register a command (decorator-style)
 */
export function command(
	definition: CommandDefinition,
): (handler: CommandHandler) => void {
	return (handler: CommandHandler) => {
		registry.register(definition, handler);
	};
}

/**
 * Define a command with its handler
 */
export function defineCommand(
	definition: CommandDefinition,
	handler: CommandHandler,
): void {
	registry.register(definition, handler);
}