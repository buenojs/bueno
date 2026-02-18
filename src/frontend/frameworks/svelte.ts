/**
 * Svelte Framework Build Configuration
 *
 * Provides build configuration specific to Svelte applications,
 * including Svelte SFC support and Svelte-specific preprocessing.
 */

import type { FrameworkBuildConfig, BuildPlugin } from "../types.js";

/**
 * Svelte-specific build plugins
 * Note: Svelte compilation requires svelte-preprocess
 */
const sveltePlugins: BuildPlugin[] = [];

/**
 * Get Svelte framework build configuration
 */
export function getSvelteBuildConfig(): FrameworkBuildConfig {
	return {
		// Svelte doesn't use JSX runtime in the traditional sense
		jsxRuntime: "classic",
		
		// Svelte-specific file extensions
		extensions: [".svelte", ".js", ".ts"],
		
		// Svelte-specific plugins
		plugins: sveltePlugins,
		
		// Svelte-specific global defines
		define: {
			// Svelte production mode
			"process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
		},
		
		// External dependencies
		external: [],
		
		// Loader configurations for Svelte files
		loaders: {
			".svelte": "js", // Svelte SFCs are compiled to JS
		},
	};
}

/**
 * Check if a file is a Svelte component
 */
export function isSvelteComponent(filePath: string): boolean {
	return /\.svelte$/.test(filePath);
}

/**
 * Get Svelte preprocessor configuration
 * Returns configuration for svelte-preprocess
 */
export function getSveltePreprocessConfig() {
	return {
		typescript: {
			compilerOptions: {
				// Enable TypeScript in Svelte files
				allowJs: true,
				checkJs: false,
			},
		},
		postcss: true,
		scss: {
			prependData: "",
		},
	};
}

/**
 * Svelte compiler options
 */
export function getSvelteCompilerOptions() {
	return {
		// Enable CSS hashing for scoped styles
		cssHash: ({ hash, css, name }: { hash: (s: string) => string; css: string; name: string }) => {
			return `svelte-${hash(css)}-${name}`;
		},
		// Generate SSR-friendly code
		generate: "dom" as const,
		// Enable hydration
		hydratable: true,
		// Preserve whitespace in development
		preserveWhitespace: process.env.NODE_ENV !== "production",
	};
}

/**
 * Svelte framework metadata
 */
export const svelteFrameworkMeta: {
	name: "svelte";
	displayName: string;
	fileExtensions: string[];
	componentExtensions: string[];
	needsRefreshRuntime: boolean;
	supportsHMR: boolean;
	supportsSSR: boolean;
} = {
	name: "svelte",
	displayName: "Svelte",
	fileExtensions: [".svelte"],
	componentExtensions: [".svelte"],
	needsRefreshRuntime: false, // Svelte has built-in HMR
	supportsHMR: true,
	supportsSSR: true,
};