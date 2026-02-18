/**
 * Vue Framework Build Configuration
 *
 * Provides build configuration specific to Vue applications,
 * including Vue SFC support, JSX configuration, and Vue-specific defines.
 */

import type { FrameworkBuildConfig, BuildPlugin } from "../types.js";

/**
 * Vue-specific build plugins
 * Note: Vue SFC compilation is handled by Bun's built-in support
 */
const vuePlugins: BuildPlugin[] = [];

/**
 * Get Vue framework build configuration
 */
export function getVueBuildConfig(): FrameworkBuildConfig {
	return {
		// Vue uses classic JSX runtime
		jsxRuntime: "classic",
		
		// Vue-specific file extensions
		extensions: [".vue", ".jsx", ".tsx", ".js", ".ts"],
		
		// Vue-specific plugins
		plugins: vuePlugins,
		
		// Vue-specific global defines
		define: {
			// Vue production mode flag
			"process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
			// Vue 3 specific features
			"__VUE_OPTIONS_API__": "true",
			"__VUE_PROD_DEVTOOLS__": "false",
			"__VUE_PROD_HYDRATION_MISMATCH_DETAILS__": "false",
		},
		
		// External dependencies
		external: [],
		
		// Loader configurations for Vue files
		loaders: {
			".vue": "js", // Vue SFCs are compiled to JS
			".jsx": "jsx",
			".tsx": "tsx",
		},
	};
}

/**
 * Check if a file is a Vue component
 */
export function isVueComponent(filePath: string): boolean {
	return /\.vue$/.test(filePath);
}

/**
 * Check if a file uses Vue JSX
 */
export function isVueJsx(filePath: string): boolean {
	return /\.(j|t)sx$/.test(filePath);
}

/**
 * Get Vue SFC block types
 */
export function getVueBlockTypes(): string[] {
	return ["template", "script", "style", "customBlocks"];
}

/**
 * Vue framework metadata
 */
export const vueFrameworkMeta: {
	name: "vue";
	displayName: string;
	fileExtensions: string[];
	componentExtensions: string[];
	needsRefreshRuntime: boolean;
	supportsHMR: boolean;
	supportsSSR: boolean;
} = {
	name: "vue",
	displayName: "Vue",
	fileExtensions: [".vue", ".jsx", ".tsx"],
	componentExtensions: [".vue"],
	needsRefreshRuntime: false, // Vue has built-in HMR
	supportsHMR: true,
	supportsSSR: true,
};