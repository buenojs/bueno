/**
 * Framework Build Configurations
 *
 * Exports framework-specific build configurations for all supported frameworks.
 * Each framework module provides configuration for JSX runtime, plugins, and defines.
 */

import type { FrontendFramework, FrameworkBuildConfig } from "../types.js";

// Import framework configurations for internal use
import { getReactBuildConfig, reactFrameworkMeta } from "./react.js";
import { getVueBuildConfig, vueFrameworkMeta } from "./vue.js";
import { getSvelteBuildConfig, svelteFrameworkMeta } from "./svelte.js";
import { getSolidBuildConfig, solidFrameworkMeta } from "./solid.js";

// Re-export framework configurations
export { getReactBuildConfig, isReactComponent, getReactRefreshPreamble, reactFrameworkMeta } from "./react.js";
export { getVueBuildConfig, isVueComponent, isVueJsx, getVueBlockTypes, vueFrameworkMeta } from "./vue.js";
export { getSvelteBuildConfig, isSvelteComponent, getSveltePreprocessConfig, getSvelteCompilerOptions, svelteFrameworkMeta } from "./svelte.js";
export { getSolidBuildConfig, isSolidComponent, getSolidRefreshPreamble, getSolidTransformOptions, solidFrameworkMeta } from "./solid.js";

// Framework metadata types
export interface FrameworkMeta {
	name: FrontendFramework;
	displayName: string;
	fileExtensions: string[];
	componentExtensions: string[];
	needsRefreshRuntime: boolean;
	supportsHMR: boolean;
	supportsSSR: boolean;
}

/**
 * Get framework build configuration by framework name
 */
export function getFrameworkConfig(framework: FrontendFramework): FrameworkBuildConfig {
	switch (framework) {
		case "react":
			return getReactBuildConfig();
		case "vue":
			return getVueBuildConfig();
		case "svelte":
			return getSvelteBuildConfig();
		case "solid":
			return getSolidBuildConfig();
		default:
			// Default to React configuration
			return getReactBuildConfig();
	}
}

/**
 * Get framework metadata by framework name
 */
export function getFrameworkMeta(framework: FrontendFramework): FrameworkMeta {
	switch (framework) {
		case "react":
			return reactFrameworkMeta;
		case "vue":
			return vueFrameworkMeta;
		case "svelte":
			return svelteFrameworkMeta;
		case "solid":
			return solidFrameworkMeta;
		default:
			return reactFrameworkMeta;
	}
}

/**
 * Detect framework from file extension
 */
export function detectFrameworkFromExtension(filePath: string): FrontendFramework | null {
	if (filePath.endsWith(".vue")) {
		return "vue";
	}
	if (filePath.endsWith(".svelte")) {
		return "svelte";
	}
	// Both React and Solid use .jsx/.tsx, need package.json to distinguish
	// Default to React for JSX files
	if (/\.(j|t)sx$/.test(filePath)) {
		return "react";
	}
	return null;
}

/**
 * Get all supported file extensions
 */
export function getAllSupportedExtensions(): string[] {
	return [
		...reactFrameworkMeta.fileExtensions,
		...vueFrameworkMeta.fileExtensions,
		...svelteFrameworkMeta.fileExtensions,
		...solidFrameworkMeta.fileExtensions,
	];
}

/**
 * Check if a file extension is supported
 */
export function isSupportedExtension(filePath: string): boolean {
	const extensions = getAllSupportedExtensions();
	return extensions.some((ext) => filePath.endsWith(ext));
}