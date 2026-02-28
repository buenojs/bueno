/**
 * Project Template Types
 *
 * Type definitions for project scaffolding
 */

/**
 * Project templates
 */
export type ProjectTemplate =
	| "default"
	| "minimal"
	| "fullstack"
	| "api"
	| "website";

/**
 * Frontend frameworks
 */
export type FrontendFramework = "react" | "vue" | "svelte" | "solid" | "none";

/**
 * Database drivers
 */
export type DatabaseDriver = "sqlite" | "postgresql" | "mysql" | "none";

/**
 * Deploy platforms
 */
export type DeployPlatform = "render" | "fly" | "railway";

/**
 * Project configuration interface
 */
export interface ProjectConfig {
	name: string;
	template: ProjectTemplate;
	framework: FrontendFramework;
	database: DatabaseDriver;
	skipInstall: boolean;
	skipGit: boolean;
	docker: boolean;
	deploy: DeployPlatform[];
	link: boolean;
}

/**
 * Template file representation
 */
export interface TemplateFile {
	path: string;
	content: string;
}

/**
 * Project template result
 */
export interface ProjectTemplateResult {
	files: TemplateFile[];
	directories: string[];
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
}

/**
 * Database template result
 */
export interface DatabaseTemplateResult {
	files: TemplateFile[];
	directories: string[];
	envConfig?: string;
	configCode?: string;
}

/**
 * Frontend template result
 */
export interface FrontendTemplateResult {
	files: TemplateFile[];
	directories: string[];
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
	scripts: Record<string, string>;
}

/**
 * Option for interactive selection
 */
export interface SelectOption<T> {
	value: T;
	name: string;
	description?: string;
}
