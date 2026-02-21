/**
 * Version Utility
 *
 * Gets the current version of @buenojs/bueno from package.json
 */

import { readFileSync } from 'fs';
import { join } from 'path';

let cachedVersion: string | null = null;

/**
 * Get the current version of @buenojs/bueno
 * Reads from package.json at runtime
 */
export function getBuenoVersion(): string {
	if (cachedVersion) {
		return cachedVersion;
	}

	try {
		// Try to read from the package.json in the bueno package
		const packageJsonPath = join(import.meta.dir, '..', '..', '..', 'package.json');
		const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
		cachedVersion = `^${packageJson.version}`;
		return cachedVersion;
	} catch {
		// Fallback to a default version if package.json can't be read
		console.warn('Could not read version from package.json, using default');
		return '^0.8.0';
	}
}

/**
 * Get the bueno dependency entry for package.json
 */
export function getBuenoDependency(): Record<string, string> {
	return {
		'@buenojs/bueno': getBuenoVersion(),
	};
}