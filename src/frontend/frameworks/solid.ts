/**
 * Solid Framework Build Configuration
 *
 * Provides build configuration specific to Solid applications,
 * including Solid JSX transforms and Solid-specific optimizations.
 */

import type { FrameworkBuildConfig, BuildPlugin } from "../types.js";

/**
 * Solid-specific build plugins
 */
const solidPlugins: BuildPlugin[] = [];

/**
 * Get Solid framework build configuration
 */
export function getSolidBuildConfig(): FrameworkBuildConfig {
	return {
		// Solid uses automatic JSX runtime with solid-js
		jsxRuntime: "automatic",
		jsxImportSource: "solid-js",
		
		// Solid-specific file extensions
		extensions: [".jsx", ".tsx", ".js", ".ts"],
		
		// Solid-specific plugins
		plugins: solidPlugins,
		
		// Solid-specific global defines
		define: {
			// Solid production mode
			"process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
			// Solid-specific flags
			"DEV": JSON.stringify(process.env.NODE_ENV !== "production"),
		},
		
		// External dependencies
		external: [],
		
		// Loader configurations for Solid files
		loaders: {
			".jsx": "jsx",
			".tsx": "tsx",
		},
	};
}

/**
 * Check if a file is a Solid component
 */
export function isSolidComponent(filePath: string): boolean {
	return /\.(jsx|tsx)$/.test(filePath);
}

/**
 * Get Solid refresh preamble for development
 * Solid uses a different HMR mechanism than React
 */
export function getSolidRefreshPreamble(): string {
	return `
// Solid HMR is handled by solid-refresh
import { setHmr as setSolidHmr } from 'solid-js/web';
if (import.meta.hot) {
  setSolidHmr(true);
}
`;
}

/**
 * Solid babel-like transform options
 * For use with custom build configurations
 */
export function getSolidTransformOptions() {
	return {
		// Solid generates DOM elements
		generate: "dom" as const,
		// Enable hydration
		hydratable: true,
		// Compile time solid-js imports
		runtime: "solid-js/web" as const,
	};
}

/**
 * Solid framework metadata
 */
export const solidFrameworkMeta: {
	name: "solid";
	displayName: string;
	fileExtensions: string[];
	componentExtensions: string[];
	needsRefreshRuntime: boolean;
	supportsHMR: boolean;
	supportsSSR: boolean;
} = {
	name: "solid",
	displayName: "Solid",
	fileExtensions: [".jsx", ".tsx"],
	componentExtensions: [".jsx", ".tsx"],
	needsRefreshRuntime: true,
	supportsHMR: true,
	supportsSSR: true,
};