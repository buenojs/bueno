/**
 * React Framework Build Configuration
 *
 * Provides build configuration specific to React applications,
 * including JSX runtime, automatic import handling, and React-specific defines.
 */

import type { FrameworkBuildConfig, BuildPlugin } from "../types.js";

/**
 * React-specific build plugins
 */
const reactPlugins: BuildPlugin[] = [];

/**
 * Get React framework build configuration
 */
export function getReactBuildConfig(): FrameworkBuildConfig {
	return {
		// React 17+ automatic JSX runtime
		jsxRuntime: "automatic",
		jsxImportSource: "react",
		
		// React-specific file extensions
		extensions: [".jsx", ".tsx", ".js", ".ts"],
		
		// React-specific plugins
		plugins: reactPlugins,
		
		// React-specific global defines
		define: {
			// Enable React production mode in production builds
			"process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
		},
		
		// External dependencies (should not be bundled in library mode)
		external: [],
		
		// Loader configurations for React files
		loaders: {
			".jsx": "jsx",
			".tsx": "tsx",
		},
	};
}

/**
 * Check if a file is a React component
 */
export function isReactComponent(filePath: string): boolean {
	return /\.(jsx|tsx)$/.test(filePath);
}

/**
 * Get React refresh preamble for development
 */
export function getReactRefreshPreamble(): string {
	return `
import RefreshRuntime from 'react-refresh/runtime';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
`;
}

/**
 * React framework metadata
 */
export const reactFrameworkMeta: {
	name: "react";
	displayName: string;
	fileExtensions: string[];
	componentExtensions: string[];
	needsRefreshRuntime: boolean;
	supportsHMR: boolean;
	supportsSSR: boolean;
} = {
	name: "react",
	displayName: "React",
	fileExtensions: [".jsx", ".tsx"],
	componentExtensions: [".jsx", ".tsx"],
	needsRefreshRuntime: true,
	supportsHMR: true,
	supportsSSR: true,
};