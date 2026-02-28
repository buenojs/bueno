/**
 * Generator Types
 *
 * Type definitions for code generators
 */

/**
 * Generator types available
 */
export type GeneratorType =
	| "controller"
	| "service"
	| "module"
	| "guard"
	| "interceptor"
	| "pipe"
	| "filter"
	| "dto"
	| "middleware"
	| "migration";

/**
 * Generator aliases
 */
export const GENERATOR_ALIASES: Record<string, GeneratorType> = {
	c: "controller",
	s: "service",
	m: "module",
	gu: "guard",
	i: "interceptor",
	p: "pipe",
	f: "filter",
	d: "dto",
	mw: "middleware",
	mi: "migration",
};

/**
 * Generator configuration
 */
export interface GeneratorConfig {
	type: GeneratorType;
	name: string;
	module?: string;
	path?: string;
	dryRun: boolean;
	force: boolean;
}

/**
 * Generator result
 */
export interface GeneratorResult {
	filePath: string;
	content: string;
}
